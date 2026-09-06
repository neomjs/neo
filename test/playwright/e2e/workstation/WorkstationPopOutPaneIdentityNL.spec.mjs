import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A nested pane subtree survives a REAL pop-out and return with its component, provider,
 * store and descendant identities intact.
 *
 * The three identities are deliberately separate claims, because they fail separately. A hop that
 * rebuilt the component would break every one of them at once and is the easy case. The interesting
 * failures are quieter: a pane that keeps its own id while its `state.Provider` is re-resolved in the
 * popup reads different truth from the same expression, and a pane that keeps component AND provider
 * while its `data.Store` is re-created shows the same rows re-fetched rather than the rows the user
 * was looking at. Asserting only the component id certifies none of that.
 *
 * The witness is the Feed pane — a `grid.Container` whose item tree carries real descendants — rather
 * than a leaf panel, because "the same instance made the hop" is trivially true for a component with
 * nothing under it. The descendant census is what makes the subtree claim non-vacuous, and it is read
 * from the App Worker's own instance graph, not from DOM: DOM nodes are necessarily rebuilt in the
 * target document, so a DOM-identity claim would be false by construction and a DOM-count claim
 * proves only that something rendered.
 *
 * The return leg is not decoration. Adoption and reintegration are different code paths with
 * different owners, and a pane can survive the outbound hop and come home rebuilt.
 *
 * Requires a Neural Link runtime root:
 *
 *      NEO_AGENTOS_RUNTIME_ROOT=<neo-agent-brain> \
 *      npx playwright test workstation/WorkstationPopOutPaneIdentityNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * Without it `playwright.config.e2e.mjs` EXCLUDES every neuralLink-fixture spec from selection, so
 * the command selects zero tests and reports success.
 */
const
    ACTION     = '.neo-toolbar-action',
    FEED_ITEM  = 'feed',
    FEED_TITLE = 'Live Event Stream',
    HEADER     = '.neo-tab-header-toolbar',
    POP_OUT    = 'window-restore',
    TAB        = '.neo-tab-header-button';

/**
 * @summary The identity triple plus the descendant census, read from the App Worker instance graph.
 * @param {Object} app Neural Link app wrapper.
 * @param {String} paneId
 * @returns {Promise<{componentId: String, providerId: String|null, storeId: String|null, descendants: String[]}>}
 */
const readIdentity = async (app, paneId) => {
    const props    = await app.getComponent(paneId, ['id', 'store.id']),
          provider = await app.callMethod(paneId, 'getStateProvider'),
          response = await app.getComponentTree(paneId, -1, true),
          // The service answers `{tree: node}`; the node itself is `{className, id, items?}`.
          // Walking the envelope instead of the node yields an empty census that reads exactly like
          // a leaf — which is why the subtree guard below exists at all.
          root     = response?.tree ?? response;

    /** Every id under the pane, the pane itself excluded — the subtree the claim is about. */
    const walk = node => node ? [node.id, ...(node.items || []).flatMap(walk)] : [];

    return {
        componentId: props.id,
        descendants: walk(root).filter(id => id && id !== paneId).sort(),
        providerId : provider?.id ?? provider?.properties?.id ?? null,
        storeId    : props['store.id'] ?? null
    }
};

test.describe('Workstation pop-out — a nested pane subtree keeps its identities across the hop and back', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1600}});

    test('component, provider, store and descendant identities survive pop-out AND return', async ({page, context, neuralLink}, testInfo) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error.stack || error.message || error)));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});

        const app         = await neuralLink.connectToApp('Workstation'),
              workspaces  = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
              workspaceId = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(workspaceId, 'the App Worker owns one Workstation workspace').toBeTruthy();

        const header = page.locator(HEADER).filter({has: page.locator(TAB, {hasText: FEED_TITLE})}).first();

        await expect(header, 'the Feed pane must have a projected tab header').toBeVisible({timeout: 30000});
        await header.locator(TAB, {hasText: FEED_TITLE}).first().click();

        const paneId = await app.callMethod(workspaceId, 'getPaneIdentity', [FEED_ITEM]);

        expect(paneId, 'the Feed pane owns a live instance before the gesture').toBeTruthy();

        const before = await readIdentity(app, paneId);

        // The arm is only meaningful over a real subtree; a leaf would make every claim below
        // trivially true. This is the census the identity assertions are measured against.
        expect(before.descendants.length, 'the Feed pane is a real subtree, not a leaf').toBeGreaterThan(0);
        expect(before.providerId, 'the pane resolves a state provider in the opener').toBeTruthy();
        expect(before.storeId, 'the Feed grid owns a store in the opener').toBeTruthy();

        const popOut = header.locator(`${ACTION}:has(span[class*="${POP_OUT}"])`).first();

        await expect(popOut, 'the Feed pane offers the pop-out action').toBeVisible({timeout: 10000});

        // Subscribed before the click: the vessel can open faster than the next await.
        const vesselPromise = context.waitForEvent('page', {timeout: 45000});

        let vessel;

        try {
            await popOut.click();

            vessel = await vesselPromise;

            await vessel.waitForLoadState('domcontentloaded');
            await vessel.waitForSelector('.workstation-viewport', {timeout: 45000});

            expect(new URL(vessel.url()).searchParams.get('popout'), 'the vessel carries the Feed identity').toBe(FEED_ITEM);
            await expect(vessel.locator(`#${paneId}`), 'the popup adopts the exact live pane').toBeVisible({timeout: 30000});
            await expect(page.locator(`#${paneId}`), 'and the opener released it').toHaveCount(0);

            const detached = await readIdentity(app, paneId);

            expect(detached.componentId, 'the SAME component made the hop').toBe(before.componentId);
            expect(detached.providerId, 'and it resolves the SAME provider from inside the popup').toBe(before.providerId);
            expect(detached.storeId, 'and its store was not re-created').toBe(before.storeId);
            expect(detached.descendants, 'and every descendant travelled as the same instance').toEqual(before.descendants);

            // The return leg, through the production retirement seam rather than a synthetic close.
            expect(await app.callMethod(workspaceId, 'closeTearOutVessel', [{
                itemId    : FEED_ITEM,
                windowName: `tearout-${FEED_ITEM}`
            }]), 'the production retirement seam closes the adopted vessel').toBe(true);

            await expect.poll(() => vessel.isClosed(), {
                message: 'the physical popup closes after the native acknowledgement',
                timeout: 15000
            }).toBe(true);

            await expect.poll(async () => {
                const state = await app.getComponent(workspaceId, ['dockModel']);

                return Object.values(state.dockModel.nodes)
                    .some(node => node.type === 'tabs' && node.items?.includes(FEED_ITEM))
            }, {
                intervals: [50, 100, 250],
                message  : 'vessel death reintegrates the Feed pane into a tab flow',
                timeout  : 30000
            }).toBe(true);

            await expect(page.locator(`#${paneId}`), 'the exact live pane returns to the main window').toBeVisible({timeout: 30000});

            const returned = await readIdentity(app, paneId);

            expect(returned.componentId, 'the SAME component came home').toBe(before.componentId);
            expect(returned.providerId, 'resolving the SAME provider again').toBe(before.providerId);
            expect(returned.storeId, 'with its store intact — not re-created on the way back').toBe(before.storeId);
            expect(returned.descendants, 'and the whole subtree returned as the same instances').toEqual(before.descendants);

            // The receipt carries its own magnitudes, so a reader never has to take "passed" as the
            // measurement. A census of one would satisfy every assertion above and mean nothing.
            testInfo.annotations.push({
                type       : 'ac-4-identity-receipt',
                description: `component ${before.componentId} · provider ${before.providerId} · store ${before.storeId} · ${before.descendants.length} descendants, identical across pop-out and return`
            })
        } finally {
            vessel && !vessel.isClosed() && await vessel.close()
        }

        expect(pageErrors, 'the journey raises no page errors').toEqual([])
    })
});
