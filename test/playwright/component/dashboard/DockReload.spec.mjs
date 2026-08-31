import {test, expect} from '@playwright/test';

/**
 * The engine-owned, delegation-only dock reload action
 * (`Neo.dashboard.dock.Workspace#enableDockReloadAction`), witnessed on a rendered workspace:
 *
 * - **Delegation:** a pane implementing `dockReload()` is asked — invocation counted, instance
 *   identity untouched, the committed document byte-identical.
 * - **Settlement channel:** every completion — sync success, sync throw, async resolution, async
 *   rejection — settles exactly once through the PRODUCTION `dockReloadSettled` event (the
 *   fixture subscribes like any application; no test-only override).
 * - **Single-flight:** one invocation per item at a time; the stable action instance disables
 *   for the window, a second activation cannot double-invoke, and BOTH action axes (`hidden`
 *   from the contract, `disabled` from the active item's in-flight membership) re-derive on
 *   every active-item change — switching panes never inherits another item's flight window.
 * - **Availability:** hidden for panes without the contract — a pure `typeof` probe on the live
 *   card, never a resolver call.
 * - **Teardown:** destroying the workspace mid-flight settles the delegation terminally; a
 *   producer released AFTER destroy mutates nothing (the erased-field falsifier).
 *
 * Rides the dock-maximize fixture app: `alpha` and `beta` both own the contract (alpha
 * mode-switchable sync/defer/reject — two carriers in one node witness per-item single-flight),
 * `gamma` owns a sync-throwing one, `frame` stays contract-free — the hidden-witness.
 */

const WORKSPACE_ID = 'dock-maximize-workspace';

const readInstance = async (page, id, keys) => {
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id, keys});

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

const lastSettled = async page => {
    const raw = (await readInstance(page, WORKSPACE_ID, ['lastReloadResultJson']))[0];

    return raw ? JSON.parse(raw) : null
};

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('dock reload — delegation-only, settled, single-flight', () => {
    test('reload leads the engine set, focus-gated like its siblings', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await expect(actionButton(main, 'fa-rotate-right')).toHaveClass(/neo-toolbar-action-context-inactive/);

        await tabButton(main, 'Alpha').click();
        await expect(actionButton(main, 'fa-rotate-right')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        // The frozen ordering contract as geometry: reload → maximize → close.
        const reloadBox = await actionButton(main, 'fa-rotate-right').boundingBox(),
              maxBox    = await actionButton(main, 'fa-window-maximize').boundingBox(),
              closeBox  = await actionButton(main, 'fa-times').boundingBox();

        expect(reloadBox.x).toBeLessThan(maxBox.x);
        expect(maxBox.x).toBeLessThan(closeBox.x)
    });

    test('sync delegation settles clean: asked once, identity kept, document untouched', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await page.evaluate(() => {
            const el = document.getElementById('dock-maximize-pane-alpha');

            window.__alphaEl   = el;
            el.dataset.witness = 'kept'
        });

        const [docBefore] = await readInstance(page, WORKSPACE_ID, ['docJson']);

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-rotate-right').click();

        await expect.poll(() => lastSettled(page)).toEqual({errors: [], itemId: 'alpha'});
        await expect.poll(async () => (await readInstance(page, 'dock-maximize-pane-alpha', ['reloadCount']))[0]).toBe(1);

        expect(await page.evaluate(() => {
            const el = document.getElementById('dock-maximize-pane-alpha');

            return el === window.__alphaEl && el.dataset.witness === 'kept'
        })).toBe(true);

        expect((await readInstance(page, WORKSPACE_ID, ['docJson']))[0]).toBe(docBefore)
    });

    test('a sync-throwing dockReload() keeps the pane and settles the failure', async ({page}) => {
        const side = tabsNodeWith(page, 'Frame');

        await tabButton(side, 'Gamma').click();

        await page.waitForSelector('#dock-maximize-pane-gamma', {state: 'attached'});
        await page.evaluate(() => {
            const el = document.getElementById('dock-maximize-pane-gamma');

            window.__gammaEl   = el;
            el.dataset.witness = 'kept'
        });

        const [docBefore] = await readInstance(page, WORKSPACE_ID, ['docJson']);

        await actionButton(side, 'fa-rotate-right').click();

        await expect.poll(async () => (await lastSettled(page))?.errors?.[0] || '').toContain('probe refuses to reload');

        expect(await page.evaluate(() => {
            const el = document.getElementById('dock-maximize-pane-gamma');

            return el === window.__gammaEl && el.dataset.witness === 'kept'
        })).toBe(true);

        expect((await readInstance(page, WORKSPACE_ID, ['docJson']))[0]).toBe(docBefore)
    });

    test('async lifecycle: single-flight disables the action, resolution and rejection both settle', async ({page}) => {
        const main   = tabsNodeWith(page, 'Alpha'),
              reload = actionButton(main, 'fa-rotate-right');

        await tabButton(main, 'Alpha').click();
        await setWorkspace(page, {alphaReloadMode: 'defer'});

        const [docBefore] = await readInstance(page, WORKSPACE_ID, ['docJson']);

        await reload.click();

        // In flight: the stable instance disables; a second activation cannot double-invoke.
        await expect(reload).toBeDisabled();
        await reload.click({force: true});
        await expect.poll(async () => (await readInstance(page, 'dock-maximize-pane-alpha', ['reloadCount']))[0]).toBe(1);

        // Resolution settles, re-enables.
        await setWorkspace(page, {alphaReloadResolveCount: 1});
        await expect.poll(() => lastSettled(page)).toEqual({errors: [], itemId: 'alpha'});
        await expect(reload).toBeEnabled();

        // An async rejection settles with the failure text and keeps everything intact.
        await setWorkspace(page, {alphaReloadMode: 'reject'});
        await reload.click();

        await expect.poll(async () => (await lastSettled(page))?.errors?.[0] || '').toContain('async refusal');
        await expect(reload).toBeEnabled();
        await expect.poll(async () => (await readInstance(page, 'dock-maximize-pane-alpha', ['reloadCount']))[0]).toBe(2);

        expect((await readInstance(page, WORKSPACE_ID, ['docJson']))[0]).toBe(docBefore)
    });

    test('a pane without the contract hides the action — pure probe, no resolver call', async ({page}) => {
        const side   = tabsNodeWith(page, 'Frame'),
              reload = actionButton(side, 'fa-rotate-right');

        // gamma (contract, throwing or not) active: present in the DOM.
        await tabButton(side, 'Gamma').click();
        await expect(reload).toHaveCount(1);

        // frame (contract-free) active: hidden means removeDom — the control leaves entirely.
        await tabButton(side, 'Frame').click();
        await expect(reload).toHaveCount(0);

        // and returns with gamma.
        await tabButton(side, 'Gamma').click();
        await expect(reload).toHaveCount(1)
    });

    test('single-flight is per item: switching panes re-derives both axes from the active item', async ({page}) => {
        const main   = tabsNodeWith(page, 'Alpha'),
              reload = actionButton(main, 'fa-rotate-right');

        await tabButton(main, 'Alpha').click();
        await setWorkspace(page, {alphaReloadMode: 'defer'});
        await reload.click();
        await expect(reload).toBeDisabled();

        // beta shares the node and the contract but owns NO flight: the same action instance
        // must re-enable for it — inheriting alpha's window is the falsifier.
        await tabButton(main, 'Beta').click();
        await expect(reload).toBeEnabled();

        // beta can even run its own (sync) delegation while alpha's flight is still open.
        await reload.click();
        await expect.poll(() => lastSettled(page)).toEqual({errors: [], itemId: 'beta'});
        await expect.poll(async () => (await readInstance(page, 'dock-maximize-pane-beta', ['reloadCount']))[0]).toBe(1);

        // back on alpha the open flight must resurface as disabled — not the false-enable that
        // a blind `disabled = false` at beta's settlement would have written.
        await tabButton(main, 'Alpha').click();
        await expect(reload).toBeDisabled();

        // releasing alpha's producer settles it and re-derives the enabled state.
        await setWorkspace(page, {alphaReloadResolveCount: 1});
        await expect.poll(() => lastSettled(page)).toEqual({errors: [], itemId: 'alpha'});
        await expect(reload).toBeEnabled()
    });

    test('default-off is behaviorally inert: a host-owned reload action keeps consumer state', async ({page}) => {
        // Isolated fixture: two workspaces booting concurrently in one app interfere on CI
        // (double-rendered bar chrome) — the flag-off subject boots alone on its own page.
        await page.goto('test/playwright/component/apps/dock-hostreload/index.html');
        await page.waitForSelector('#dock-hostreload-workspace', {state: 'attached'});
        await page.waitForSelector('.neo-tab-header-button', {state: 'visible'});

        const host   = tabsNodeWith(page, 'HostA'),
              close  = actionButton(host, 'fa-times'),
              reload = actionButton(host, 'fa-rotate-right');

        // The host workspace legally owns the NAME `reload` while the engine flag is off. The
        // engine's close action (its flag IS on) proves the sweep runs on this header — reload's
        // per-action guard, not a dead sweep, is what protects the host action.
        await expect(close).toHaveCount(1);
        await expect(reload).toHaveCount(1);

        // Active switches drive both sync paths (no-commit re-emit + committed activation); a
        // guardless sweep hides the host action here — the pane has no dockReload() contract.
        await tabButton(host, 'HostB').click();
        await expect(tabButton(host, 'HostB')).toHaveClass(/pressed/);
        await expect(reload).toHaveCount(1);
        await expect(reload).toBeEnabled();

        await tabButton(host, 'HostA').click();
        await expect(tabButton(host, 'HostA')).toHaveClass(/pressed/);
        await expect(reload).toHaveCount(1);
        await expect(reload).toBeEnabled()
    });

    test('the no-active race settles through the channel with a null item', async ({page}) => {
        await setWorkspace(page, {dispatchNoActiveReloadCount: 1});

        await expect.poll(() => lastSettled(page)).toEqual({
            errors: ['Dock reload action requires an active item'],
            itemId: null
        })
    });

    test('teardown mid-flight settles terminally: a producer released after destroy mutates nothing', async ({page}) => {
        const main     = tabsNodeWith(page, 'Alpha'),
              pageErrs = [];

        page.on('pageerror', error => pageErrs.push(String(error)));

        await tabButton(main, 'Alpha').click();
        await setWorkspace(page, {alphaReloadMode: 'defer'});
        await actionButton(main, 'fa-rotate-right').click();
        await expect(actionButton(main, 'fa-rotate-right')).toBeDisabled();

        await page.evaluate(() => Neo.worker.App.destroyNeoInstance('dock-maximize-workspace'));
        await page.waitForSelector('#dock-maximize-workspace', {state: 'detached'});

        // The producer settles AFTER destroy, through the standing probe (the workspace and its
        // trigger configs are gone). Old-shape falsifier: the resumed continuation dereferenced
        // the erased in-flight Set — a TypeError this collector would catch.
        await page.evaluate(data => Neo.worker.App.setConfigs(data), {id: 'dock-maximize-probe', releaseDeferredCount: 1});
        await expect.poll(async () => (await readInstance(page, 'dock-maximize-probe', ['deferredReleasedTotal']))[0]).toBe(1);

        expect(pageErrs).toEqual([])
    })
});
