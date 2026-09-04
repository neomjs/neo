import {test, expect} from '@playwright/test';

const WORKSPACE_ID = 'dock-lock-workspace';

const readConfigs = async (page, id, keys) => {
    const reply = await page.evaluate(
        data => Neo.worker.App.getConfigs(data),
        {id, keys}
    );

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

let settleProbeCount = 0;

/**
 * Awaits the Workspace refresh chain through the fixture-owned semantic settlement probe.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const awaitRefresh = async page => {
    const value = ++settleProbeCount;

    await setWorkspace(page, {settleProbeCount: value});
    await expect.poll(async () => (await readConfigs(page, WORKSPACE_ID, ['settledProbeCount']))[0])
        .toBe(value)
};

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) =>
    node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

// The rail's own tab button, by role and exact name: a revealed overlay lives inside the rail and
// repeats the item's title in its header, so a text match would resolve to both.
const railButton = (page, name) =>
    page.locator('.neo-dashboard-dock-edge-rail').getByRole('button', {name, exact: true});

const readInertOwnership = (page, id) => page.evaluate(async componentId => {
    const reply  = await Neo.worker.App.getConfigs({id: componentId, keys: ['vdom']}),
          [vdom] = reply?.data ?? reply;

    return {owned: Object.hasOwn(vdom, 'inert'), value: vdom.inert}
}, id);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-lock/index.html');
    await page.waitForSelector('#dock-lock-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button', {state: 'visible'});
    await awaitRefresh(page)
});

test.describe('dock lock — committed boundary plus reversible presentation', () => {
    test('inert blocks pointer and keyboard, then unlock restores absent and owned inert exactly', async ({page}) => {
        const main  = tabsNodeWith(page, 'Alpha'),
              alpha = page.locator('#dock-lock-control-alpha');

        await page.evaluate(() => {
            window.__dockLockClicks = 0;
            document.getElementById('dock-lock-control-alpha')
                .addEventListener('click', () => window.__dockLockClicks++)
        });

        let box = await alpha.boundingBox();

        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => window.__dockLockClicks)).toBe(1);

        await tabButton(main, 'Alpha').click();
        await awaitRefresh(page);
        await actionButton(main, 'fa-lock').click();
        await awaitRefresh(page);

        await expect(page.locator('#dock-lock-pane-alpha')).toHaveClass(/neo-dock-pane-locked/);
        await expect(page.locator('#dock-lock-pane-alpha')).toHaveCSS('outline-style', 'solid');
        await expect(tabButton(main, 'Alpha')).not.toHaveClass(/neo-draggable/);
        await expect(actionButton(main, 'fa-times')).toBeHidden();
        expect(await page.locator('#dock-lock-pane-alpha').evaluate(node => node.inert)).toBe(true);

        box = await alpha.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => window.__dockLockClicks)).toBe(1);

        const keyboardFocus = [];

        for (let i = 0; i < 8; i++) {
            await page.keyboard.press('Tab');
            keyboardFocus.push(await page.evaluate(() => document.activeElement?.id || null))
        }

        expect(keyboardFocus).not.toContain('dock-lock-control-alpha');

        const outside = page.locator('#dock-lock-outside-focus'),
              unlock  = actionButton(main, 'fa-lock-open');

        await outside.focus();
        await expect(outside).toBeFocused();

        // A persistent protective state must not hide its reversal behind transient focus. With
        // focus deliberately outside the dock, only unlock stays discoverable/actionable; no other
        // contextual sibling is exposed by this.
        await expect(unlock).not.toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(unlock).toHaveAttribute('aria-label', 'unlock');
        await expect.poll(() => unlock.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: null, inert: false, tabIndex: 0});

        await unlock.click();
        await awaitRefresh(page);

        await expect(page.locator('#dock-lock-pane-alpha')).not.toHaveClass(/neo-dock-pane-locked/);
        await expect(tabButton(main, 'Alpha')).toHaveClass(/neo-draggable/);
        await expect(actionButton(main, 'fa-times')).toBeVisible();
        expect(await readInertOwnership(page, 'dock-lock-pane-alpha')).toEqual({
            owned: false,
            value: undefined
        });

        box = await alpha.boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        expect(await page.evaluate(() => window.__dockLockClicks)).toBe(2);

        await outside.focus();
        const relock = actionButton(main, 'fa-lock');

        // Back under the focus gate, a withdrawn action has no node at all — the collapse is DOM
        // absence on the retained instance, so there is no class or attribute left to observe.
        await expect(relock, 'lock is withdrawn again once the protective state ends').toHaveCount(0);

        await tabButton(main, 'Beta').focus();
        await tabButton(main, 'Beta').click();
        await awaitRefresh(page);
        expect(await readInertOwnership(page, 'dock-lock-pane-beta')).toEqual({owned: true, value: true});

        await actionButton(main, 'fa-lock').click();
        await awaitRefresh(page);
        await actionButton(main, 'fa-lock-open').click();
        await awaitRefresh(page);

        expect(await readInertOwnership(page, 'dock-lock-pane-beta')).toEqual({owned: true, value: true})
    });

    test('locked rail remains revealable while inert, and the unlock reaches the revealed pane in place', async ({page}) => {
        const railTab = railButton(page, 'Railed'),
              overlay = page.locator(
                  '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'
              );

        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(page.locator('#dock-lock-pane-railed')).toHaveClass(/neo-dock-pane-locked/);
        expect(await page.locator('#dock-lock-pane-railed').evaluate(node => node.inert)).toBe(true);

        // Marks the live pane element: an in-place landing keeps it, a rebuilt rail would mint a new one.
        await page.locator('#dock-lock-pane-railed').evaluate(node => {node.dataset.held = 'yes'});

        await setWorkspace(page, {
            operationJson: JSON.stringify({
                operation: 'setItemLocked',
                itemId   : 'railed',
                locked   : false,
                attempt  : 1
            })
        });

        await expect.poll(async () => {
            const [json] = await readConfigs(page, WORKSPACE_ID, ['docJson']);

            return JSON.parse(json).items.railed.locked
        }).toBe(false);
        await awaitRefresh(page);

        // An item-flag commit on a railed item reconciles the rail in place: the reveal survives the
        // refresh and the unlock reaches the revealed pane where it stands — the same element, not a
        // re-materialized one. The rail stays usable: a further click keeps the item revealed.
        await expect(overlay).toHaveCount(1);
        await expect(page.locator('#dock-lock-pane-railed')).toHaveAttribute('data-held', 'yes');
        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(page.locator('#dock-lock-pane-railed')).not.toHaveClass(/neo-dock-pane-locked/);
        expect(await readInertOwnership(page, 'dock-lock-pane-railed')).toEqual({
            owned: false,
            value: undefined
        })
    });

    /**
     * An item can leave auto-hidden state without the rail ever being asked — a restored perspective,
     * a transfer, or as here a `setItemPinned` committed straight through the reducer. Only the
     * workspace's pre-projection sweep sees it leave. With the overlay OPEN on that item, the sweep
     * has to retire the reveal state with the pane, and the refresh has to settle: this fixture mints
     * pane ids from a config, so a reveal pane that outlives the flow pane's creation is exactly the
     * id collision that rejected the refresh silently.
     */
    test('a reducer-committed pin-back with an open reveal returns the pane to flow and settles', async ({page}) => {
        const railTab = railButton(page, 'Railed'),
              overlay = page.locator(
                  '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'
              );

        // Unlock first: the arm is about the leave path, not the lock boundary.
        await setWorkspace(page, {
            operationJson: JSON.stringify({operation: 'setItemLocked', itemId: 'railed', locked: false, attempt: 2})
        });
        await awaitRefresh(page);

        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(overlay.locator('#dock-lock-pane-railed')).toBeVisible();

        // The leave path the rail never sees: the reducer un-rails the revealed item directly.
        await setWorkspace(page, {
            operationJson: JSON.stringify({operation: 'setItemPinned', itemId: 'railed', pinned: true, attempt: 3})
        });
        await awaitRefresh(page);

        const returned = tabsNodeWith(page, 'Railed');

        await expect(returned, 'the band is back with a tabs node').toHaveCount(1);
        await expect(returned.locator('#dock-lock-pane-railed'), 'the flow pane took the consumer id').toBeVisible();
        await expect(overlay, 'the reveal is gone with the rail').toHaveCount(0);
        await expect(page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed'), 'and so is its rail tab')
            .toHaveCount(0);

        // The pane is the registered holder of its id — a zombie would have no worker instance.
        expect((await readConfigs(page, 'dock-lock-pane-railed', ['mounted']))?.[0]).toBe(true)
    });

    /**
     * The content half of lock is delegable: a pane implementing `dockLock(locked)` decides what
     * locked means for its content, the engine writes no `inert`, and the forbidding cursor stays
     * with the inert default. The structural half — hidden close, suppressed drag source, the frame
     * cue — is never delegated.
     */
    test('a pane implementing dockLock owns its content presentation without inert', async ({page}) => {
        const main    = tabsNodeWith(page, 'Alpha'),
              pane    = page.locator('#dock-lock-pane-delegated'),
              control = page.locator('#dock-lock-pane-delegated-control'),
              keep    = page.locator('#dock-lock-pane-delegated-keep'),
              cursor  = locator => locator.evaluate(node => getComputedStyle(node).cursor),
              calls   = async () => (await readConfigs(page, 'dock-lock-pane-delegated', ['lockCalls']))[0];

        await tabButton(main, 'Delegated').click();
        await awaitRefresh(page);
        await expect(control).toBeEnabled();

        await actionButton(main, 'fa-lock').click();
        await awaitRefresh(page);

        await expect(pane).toHaveClass(/neo-dock-pane-locked/);
        await expect(pane).toHaveCSS('outline-style', 'solid');
        await expect(control, 'the pane disabled the control it chose to').toBeDisabled();
        expect(await pane.evaluate(node => node.inert), 'the engine wrote no inert').toBe(false);
        expect(await readInertOwnership(page, 'dock-lock-pane-delegated')).toEqual({owned: false, value: undefined});
        expect(await cursor(pane), 'the forbidding cursor belongs to the inert default').not.toBe('not-allowed');

        await page.evaluate(() => {
            window.__dockLockKeepClicks = 0;
            document.getElementById('dock-lock-pane-delegated-keep')
                .addEventListener('click', () => window.__dockLockKeepClicks++)
        });
        await keep.click();
        expect(await page.evaluate(() => window.__dockLockKeepClicks), 'what the pane left live stays live').toBe(1);

        await expect(tabButton(main, 'Delegated'), 'the drag source is still the engine\'s').not.toHaveClass(/neo-draggable/);
        await expect(actionButton(main, 'fa-times'), 'and so is the hidden close').toBeHidden();

        // The sweep runs on every active-item change; the hook must not.
        await tabButton(main, 'Alpha').click();
        await awaitRefresh(page);
        await tabButton(main, 'Delegated').click();
        await awaitRefresh(page);
        expect(await calls(), 'once per transition').toEqual([true]);

        await actionButton(main, 'fa-lock-open').click();
        await awaitRefresh(page);

        await expect(control).toBeEnabled();
        await expect(pane).not.toHaveClass(/neo-dock-pane-locked/);
        expect(await calls()).toEqual([true, false]);
        expect(await readInertOwnership(page, 'dock-lock-pane-delegated')).toEqual({owned: false, value: undefined});

        // Contrast on the same page: a pane without the hook keeps the inert default and its cursor.
        await tabButton(main, 'Alpha').click();
        await awaitRefresh(page);
        await actionButton(main, 'fa-lock').click();
        await awaitRefresh(page);

        expect(await page.locator('#dock-lock-pane-alpha').evaluate(node => node.inert)).toBe(true);
        expect(await cursor(page.locator('#dock-lock-pane-alpha'))).toBe('not-allowed')
    });

    /**
     * The revealed rail pane resolves the hook through the same presentation seam as the in-flow
     * card. The workspace here takes the reconciler's default full staged transaction on every
     * commit, rails included, so a committed unlock re-materializes the reveal pane instead of
     * restoring it: a fresh pane is never asked. The same-instance reversal on a retained overlay is
     * the unit spec's rail-callback witness.
     */
    test('a delegating reveal pane receives the committed lock on the rail, never inert', async ({page}) => {
        const railTab = railButton(page, 'Reader'),
              overlay = page.locator(
                  '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'
              ),
              pane    = page.locator('#dock-lock-pane-reader'),
              control = page.locator('#dock-lock-pane-reader-control'),
              calls   = async () => (await readConfigs(page, 'dock-lock-pane-reader', ['lockCalls']))[0];

        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(pane).toHaveClass(/neo-dock-pane-locked/);
        await expect(control, 'the reveal pane was asked, not made inert').toBeDisabled();
        expect(await pane.evaluate(node => node.inert)).toBe(false);
        expect(await calls()).toEqual([true]);

        await setWorkspace(page, {
            operationJson: JSON.stringify({operation: 'setItemLocked', itemId: 'reader', locked: false, attempt: 4})
        });
        await awaitRefresh(page);

        // The rail reconciles in place, so the revealed pane persists and is asked to unlock where it
        // stands — a re-materialized pane would never have been asked at all.
        await expect(overlay).toHaveCount(1);
        await expect(pane).not.toHaveClass(/neo-dock-pane-locked/);
        await expect(control).toBeEnabled();
        expect(await calls(), 'the persisting pane is asked to unlock, once').toEqual([true, false]);
        await railTab.click();
        await expect(overlay).toHaveCount(1);
        expect(await readInertOwnership(page, 'dock-lock-pane-reader')).toEqual({owned: false, value: undefined})
    })
});

/**
 * The refresh SHAPE a lock commit takes, measured as DOM churn over the whole app.
 *
 * `setItemLocked` assigns one boolean on one item and touches `document.nodes` nowhere, but
 * `getRefreshOptions` used to return `{}` for every commit — the full staged transaction — so the
 * splits and edge rows had their children removed and re-added and every retained header in the app
 * was re-parented. A re-parented node repaints, which is what the operator saw: clicking lock made
 * every tab-container header in the app flicker.
 *
 * **The observer must sit ABOVE the headers.** The mechanism is re-parenting, not re-creation: the
 * header components and their DOM nodes survive with zero internal mutations, so an observer scoped
 * to a header cannot see its own cause. Three earlier arms found nothing for exactly that reason.
 *
 * This fixture writes no `getRefreshOptions`, which is what makes it the witness: the engine's
 * derived default is the only thing under test.
 *
 * @see https://github.com/neomjs/neo/issues/18152
 */
test.describe('dock lock — the commit takes an item-only refresh (#18152)', () => {
    /**
     * Records every mutation under the app root while `action` runs, classified by whether the
     * target sits inside a tab header.
     * @param {Object} page
     * @param {Function} action
     * @returns {Promise<Object>} {total, outsideHeaders, targets}
     */
    async function mutationsDuring(page, action, ownPaneSelector) {
        await page.evaluate(selector => {
            globalThis.__ownPane = selector;
            globalThis.__mutations = [];
            globalThis.__observer  = new MutationObserver(records => {
                for (const record of records) {
                    const el = record.target instanceof Element ? record.target : record.target.parentElement;

                    // "Own" = the locked pane's header, or the locked pane itself. Both MUST change:
                    // the header swaps its action glyph and the pane gains its locked presentation.
                    // The defect was never those — it was the splits, edge rows and dock host being
                    // rebuilt around them, which re-parents every retained header in the app.
                    globalThis.__mutations.push({
                        own   : !!el?.closest('.neo-tab-header-toolbar') || !!el?.closest(globalThis.__ownPane),
                        target: el ? (el.className?.toString?.() || el.tagName) : 'unknown',
                        type  : record.type
                    })
                }
            });
            globalThis.__observer.observe(document.body, {attributes: true, childList: true, subtree: true})
        }, ownPaneSelector);

        await action();
        await awaitRefresh(page);

        return page.evaluate(() => {
            globalThis.__observer.disconnect();

            const all     = globalThis.__mutations,
                  outside = all.filter(entry => !entry.own);

            return {
                outsideHeaders: outside.length,
                targets       : [...new Set(outside.map(entry => entry.target))].slice(0, 8),
                total         : all.length
            }
        })
    }

    test('locking a shell pane mutates nothing outside its own header', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await awaitRefresh(page);

        const churn = await mutationsDuring(page, () => actionButton(main, 'fa-lock').click(), '#dock-lock-pane-alpha');

        // Non-vacuity: a commit that produced NO mutations at all would satisfy the assertion below
        // while proving the lock never landed.
        expect(churn.total, 'the lock must actually have changed something').toBeGreaterThan(0);
        await expect(page.locator('#dock-lock-pane-alpha')).toHaveClass(/neo-dock-pane-locked/);

        expect(churn.outsideHeaders,
            `nothing outside a tab header may move — saw: ${churn.targets.join(', ')}`).toBe(0)
    });

    // The RAILED counterpart is deliberately not a component arm. A railed pane's document delta is
    // identical — one item field — but it is projected outside the shell, so the item-only path
    // would leave a stale rail copy beside the fresh one; the engine declines on placement. That
    // DECISION is witnessed in `unit/dashboard/DockOperationChangeClass.spec.mjs`, and the rail's
    // end-to-end correctness is already carried by the locked-rail arms above, which exercise the
    // full transaction on `railed` and `reader`. A third arm driving the same rail through its
    // reveal choreography would restate them and add a timing surface, not coverage.
});
