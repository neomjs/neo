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
        expect(await unlock.evaluate(node => ({
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
        expect(await relock.evaluate(node => ({
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
    })
});
