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

        await expect(relock).toHaveClass(/neo-toolbar-action-context-inactive/);
        await expect(relock).toHaveAttribute('aria-label', 'lock');
        // Focus state crosses the App/Main render boundary. The class can become observable before
        // the sibling accessibility deltas settle, so poll the semantic state itself rather than
        // treating one DOM class as a settlement acknowledgement for unrelated VDOM properties.
        await expect.poll(() => relock.evaluate(node => ({
            ariaHidden: node.getAttribute('aria-hidden'),
            inert     : node.inert,
            tabIndex  : node.tabIndex
        }))).toEqual({ariaHidden: 'true', inert: true, tabIndex: -1});

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

    test('locked rail remains revealable while inert, then re-reveals interactive after unlock', async ({page}) => {
        const railTab = page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed'),
              overlay = page.locator(
                  '.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'
              );

        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(page.locator('#dock-lock-pane-railed')).toHaveClass(/neo-dock-pane-locked/);
        expect(await page.locator('#dock-lock-pane-railed').evaluate(node => node.inert)).toBe(true);

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

        // Reconciliation may dismiss the transient overlay through its ordinary focus/pointer state
        // machine. Orthogonality means the rail remains usable, not that one reveal is persistent.
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
        const railTab = page.locator('.neo-dashboard-dock-edge-rail').getByText('Railed'),
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
        const railTab = page.locator('.neo-dashboard-dock-edge-rail').getByText('Reader'),
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

        await railTab.click();
        await expect(overlay).toHaveCount(1);
        await expect(pane).not.toHaveClass(/neo-dock-pane-locked/);
        await expect(control).toBeEnabled();
        expect(await calls(), 'the re-materialized pane was never locked, so it is never asked').toEqual([]);
        expect(await readInertOwnership(page, 'dock-lock-pane-reader')).toEqual({owned: false, value: undefined})
    })
});
