import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The G1 dock tear-out e2e witness leg. Neural Link invokes the app's semantic
 * tear-out executor {@link AgentOS.childapps.dockdemo.view.DemoBWorkspace#executeTearOutStep}, which
 * resolves the live tab header + geometry immediately before dispatching an arming mousedown ->
 * threshold moves -> a deep outward fling -> (gated on the vessel's real birth) post-birth survival
 * moves -> either a detached mouseup (terminal) or an Escape (cancel) through the existing
 * InteractionService. The post-state proves the REAL landed grammar, not a reducer call:
 *
 *  1. birth + survival — a `?popout=` vessel is actually born AND survives deliberate post-birth
 *     moves (the reap regression: a false boundary re-entry used to close the newborn ~2ms in);
 *  2. terminal — `detachItem` commits to document truth: the item is ABSENT from every node's items
 *     yet PRESENT in the catalog (the vessel owns it; catalog preservation is what stops a leak);
 *  3. cancel — Escape while detached closes the vessel and mutates NEITHER the tree NOR the catalog
 *     (the zero-mutation-by-GUARD invariant, asserted from the committed document, the third party);
 *  4. AC-3 falsifier — the MIDDLE tab of a multi-item group tears out cleanly, its siblings and their
 *     order preserved (a naive splice-by-index would corrupt the survivors).
 *
 * The reap only ever reproduced HEADED (Clio's headed receipts), so this runs headed for witness 1's
 * fidelity floor; the executor already drives placement CDP-side for the headless legs.
 *
 * Run: NEO_E2E_PORT=8120 npx playwright test agentos/DemoBDockTearOutNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Demo B — real dock tear-out gesture', () => {
    test.setTimeout(120000);
    // The tear-out vessel is a second physical window; give the stage room so its placement + the
    // survival probe never collide with the source viewport.
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 760}
    });

    /**
     * Boots Demo B, connects Neural Link, and wires page/runtime error capture. Returns the live
     * handles every witness drives — the same boot the cross-window precedent repeats per test.
     * @param {Object} fixtures `{page, neuralLink}`
     * @param {String} tag Unique error-bridge suffix (one exposeFunction name per test).
     * @returns {Promise<Object>}
     */
    async function boot({page, neuralLink}, tag) {
        const pageErrors = [], popupErrors = [], runtimeErrors = [];

        await page.context().exposeFunction(`__recordTearOut_${tag}`, payload => runtimeErrors.push(payload));
        await page.context().addInitScript(recordName => {
            globalThis.addEventListener('error', event => globalThis[recordName]({
                column: event.colno, line: event.lineno, message: event.message, source: event.filename, type: 'error'
            }));
            globalThis.addEventListener('unhandledrejection', event => globalThis[recordName]({
                reason: String(event.reason?.stack || event.reason?.message || event.reason), type: 'unhandledrejection'
            }))
        }, `__recordTearOut_${tag}`);

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/childapps/dockdemo/index.html?demo=b');
        await page.waitForSelector('.agentos-dockdemo-counter-pane', {timeout: 30000});

        const app        = await neuralLink.connectToApp('AgentOSDockDemo'),
              workspaces = await app.findInstances({className: 'AgentOS.childapps.dockdemo.view.DemoBWorkspace'}, ['id']),
              wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the App Worker must own one DemoBWorkspace').toBeTruthy();

        return {app, page, pageErrors, popupErrors, runtimeErrors, wsId}
    }

    /**
     * Drives one tear-out gesture, catching the real vessel Page the executor opens. Places the
     * vessel outside the source viewport CDP-side (headless Chrome ignores the app-owned placement,
     * exactly as the cross-window adapter documents) so the two windows never overlap.
     * @returns {Promise<{popup: (import('@playwright/test').Page|null), result: Object}>}
     */
    async function tearOut({app, page, popupErrors, wsId}, step, options = {}) {
        const popupPromise  = page.waitForEvent('popup', {timeout: 30000}).catch(() => null),
              resultPromise = app.callMethod(wsId, 'executeTearOutStep', [step, options]),
              popup         = await popupPromise;

        if (popup) {
            popup.on('pageerror', error => {
                let value = String(error?.stack || error?.message || error || '');
                value && value !== 'undefined' && popupErrors.push(value)
            })
        }

        return {popup, result: await resultPromise}
    }

    test('witness 1 — the vessel is born and SURVIVES deliberate post-birth moves (#15413 reap regression)', async ({page, neuralLink}) => {
        const ctx    = await boot({page, neuralLink}, 'survival'),
              before = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        expect(before.dockModel.nodes['workbench-tabs'].items).toEqual(['workbench']);

        // Four post-birth moves — well past the ~2ms window the inverted hysteresis used to reap in.
        const {popup, result} = await tearOut(ctx, {itemId: 'workbench', sourceNodeId: 'workbench-tabs'}, {postBirthMoves: 4});

        expect(result.errors, 'the gesture must reach the vessel').toEqual([]);
        expect(result.proof.born, 'a real ?popout= vessel must be born by the boundary exit').toBe(true);
        expect(result.proof.survivedProbe, 'the newborn vessel must survive the deliberate post-birth moves').toBe(true);
        expect(popup, 'Playwright must observe the vessel as a real popup window').toBeTruthy();
        expect(popup.url(), 'the vessel carries the pop-out shell identity').toContain('popout=workbench');
        expect(ctx.runtimeErrors).toEqual([]);
        expect(ctx.pageErrors).toEqual([]);
        expect(ctx.popupErrors).toEqual([])
    });

    test('witness 2 — release while detached commits detachItem to document truth, catalog preserved', async ({page, neuralLink}) => {
        const ctx    = await boot({page, neuralLink}, 'terminal'),
              before = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        expect(before.dockModel.nodes['workbench-tabs'].items).toEqual(['workbench']);

        const {result} = await tearOut(ctx, {itemId: 'workbench', sourceNodeId: 'workbench-tabs'});

        expect(result.errors).toEqual([]);
        expect(result.applied, 'the terminal must commit the detach').toBe(true);
        expect(result.proof).toMatchObject({
            born              : true,
            committed         : true,
            detachCommitted   : true,
            itemAbsentFromTree: true,
            itemKeptInCatalog : true,
            catalogPreserved  : true
        });

        // Committed document truth, read fresh from the worker — not the executor's own snapshot.
        const after = await ctx.app.getComponent(ctx.wsId, ['dockModel']),
              nodes = after.dockModel.nodes;

        expect(Object.values(nodes).some(node => node.items?.includes('workbench')),
            'workbench must be absent from every node — the vessel owns it now').toBe(false);
        expect(after.dockModel.items.workbench, 'the catalog entry must be preserved (no leak)').toBeTruthy();
        expect(ctx.runtimeErrors).toEqual([]);
        expect(ctx.pageErrors).toEqual([]);
        expect(ctx.popupErrors).toEqual([])
    });

    test('witness 3 — Escape while detached closes the vessel and mutates NEITHER document', async ({page, neuralLink}) => {
        const ctx    = await boot({page, neuralLink}, 'cancel'),
              before = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        const {result} = await tearOut(ctx, {itemId: 'workbench', sourceNodeId: 'workbench-tabs'}, {cancel: true});

        expect(result.errors).toEqual([]);
        expect(result.cancelled, 'Escape while detached must cancel').toBe(true);
        expect(result.proof.born, 'the vessel is born BEFORE the cancel — the cancel is the interesting phase').toBe(true);
        expect(result.proof.documentsUnchanged, 'a cancelled tear-out is zero-mutation by GUARD').toBe(true);

        // The committed document must be byte-identical to the pre-gesture state.
        const after = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        expect(after.dockModel).toEqual(before.dockModel);
        expect(after.dockModel.nodes['workbench-tabs'].items, 'workbench stayed home').toEqual(['workbench']);
        expect(ctx.runtimeErrors).toEqual([]);
        expect(ctx.pageErrors).toEqual([]);
        expect(ctx.popupErrors).toEqual([])
    });

    test('witness 4 — the MIDDLE tab of a multi-item group tears out, siblings and order preserved (AC-3)', async ({page, neuralLink}) => {
        const ctx    = await boot({page, neuralLink}, 'middle'),
              before = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        // side-tabs holds three; timeline is the MIDDLE tab — a splice-by-index bug would corrupt it.
        expect(before.dockModel.nodes['side-tabs'].items).toEqual(['inspector', 'timeline', 'console']);

        const {result} = await tearOut(ctx, {itemId: 'timeline', sourceNodeId: 'side-tabs'});

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.proof).toMatchObject({born: true, detachCommitted: true, itemKeptInCatalog: true});

        const after = await ctx.app.getComponent(ctx.wsId, ['dockModel']);

        expect(after.dockModel.nodes['side-tabs'].items,
            'the two surviving siblings keep their identity AND order').toEqual(['inspector', 'console']);
        expect(after.dockModel.items.timeline, 'the torn-out middle tab is preserved in the catalog').toBeTruthy();
        expect(ctx.runtimeErrors).toEqual([]);
        expect(ctx.pageErrors).toEqual([]);
        expect(ctx.popupErrors).toEqual([])
    })
});
