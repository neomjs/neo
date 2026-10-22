import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Whitebox Neural Link E2E witness for tab-overflow menu stability in docked and maximized panes.
 *
 * When a dock pane is maximized (`position: fixed` via `.neo-dock-maximized`), its tab header toolbar and
 * contributed overflow control (`⋯`) sit near the right edge of the viewport, outside the bounding box of
 * the underlying static `overflow: hidden` split container (`split-main`). `DomAccess#getClippedRect` must
 * walk the CSS containing-block chain so the fixed pane is clipped only by the viewport (or a fixed-containing
 * ancestor) rather than by bypassed static ancestors; otherwise `DomAccess#align` treats the trigger as
 * clipped out of view (`target === false`) and immediately hides the opening menu, dropping focus from the
 * pane, withdrawing focus-gated header actions, and re-partitioning the tab strip.
 *
 * Run:
 * NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> \
 *   npx playwright test workstation/WorkstationMaximizeOverflowMenuNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const
    asArray   = value => Array.isArray(value) ? value : value ? [value] : [],
    normalize = values => values.map(value => value.trim()).filter(Boolean);

/**
 * @summary Connects to the live Workstation app and returns the main workspace and `heavy-tabs` chrome identity.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @returns {Promise<{app: Object, chrome: Object, workspaceId: String}>}
 */
async function connectHeavyTabs(page, neuralLink) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-dock-host', {timeout: 30000});

    const
        app        = await neuralLink.connectToApp('Workstation'),
        mainWindow = await page.evaluate(() => Neo.worker.Manager.windowId),
        candidates = asArray(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id', 'windowId']))
            .map(record => ({...(record.properties ?? record), id: record.id ?? record.properties?.id})),
        workspaceId = candidates.find(record => record.windowId === mainWindow)?.id;

    expect(workspaceId).toBeTruthy();

    let chrome = null;

    await expect.poll(async () => {
        chrome = await app.callMethod(workspaceId, 'getTabChromeIdentity', ['heavy-tabs']);
        return Boolean(chrome?.overflowControlId && chrome?.overflowPluginId)
    }, {
        message: 'heavy-tabs mounts its overflow plugin and control',
        timeout: 30000
    }).toBe(true);

    return {app, chrome, workspaceId}
}

/**
 * @summary Waits for the `heavy-tabs` overflow plugin to finish any in-flight or queued measurement pass.
 * @param {Object} app
 * @param {String} overflowPluginId
 * @returns {Promise<Object>}
 */
async function waitForOverflowSettled(app, overflowPluginId) {
    let props = null;

    await expect.poll(async () => {
        props = await app.getComponent(overflowPluginId, [
            'appliedHiddenIds',
            'measuring',
            'menuProjectionQueued',
            'projectQueued'
        ]);
        return Boolean(props && props.measuring === false && props.projectQueued === false && Array.isArray(props.appliedHiddenIds) && props.appliedHiddenIds.length > 0)
    }, {
        message: 'overflow projection settles with a non-empty hidden partition',
        timeout: 15000
    }).toBe(true);

    return props
}

/**
 * @summary Exercises the overflow menu open/hold/select contract on `heavy-tabs` after focusing the pane body.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {Object} chrome
 */
async function assertOverflowMenuHoldsAndSelects(page, app, chrome) {
    const
        headerToolbar   = page.locator(`#${chrome.headerId}`),
        overflowControl = page.locator(`#${chrome.overflowControlId}`),
        paneBody        = page.locator(`#${chrome.bodyId}`);

    // Focus the pane body with a real pointer so focus-gated header actions reveal in the DOM and settle.
    await paneBody.click({position: {x: 80, y: 80}});

    await expect.poll(async () => {
        const
            props = await app.getComponent(chrome.headerId, ['contextualActionsVisible']),
            count = await headerToolbar.locator('.neo-toolbar-action').count();

        return props?.contextualActionsVisible === true && count > 2
    }, {
        message: 'focusing the pane body reveals contextual header actions in the DOM',
        timeout: 10000
    }).toBe(true);

    const
        prePluginProps    = await waitForOverflowSettled(app, chrome.overflowPluginId),
        preHiddenIds      = [...prePluginProps.appliedHiddenIds],
        preVisibleHeaders = normalize(await headerToolbar.locator('.neo-tab-header-button:visible').allTextContents()),
        preActionIds      = await headerToolbar.locator('.neo-toolbar-action').evaluateAll(nodes => nodes.map(n => n.id));

    expect(preActionIds.length, 'focus-gated actions are present in the header toolbar DOM').toBeGreaterThan(3);

    // wall-clock-under-test: DomAccess#align auto-hide removes the menu at ~48 ms and triggers header repartition by ~300 ms.
    await overflowControl.click();
    await page.waitForTimeout(350);

    const
        menuList  = page.locator('.neo-menu-list:visible'),
        menuItems = menuList.locator('.neo-list-item').filter({hasText: /\S/});

    await expect(menuList, 'overflow menu remains mounted and visible after >= 300 ms').toHaveCount(1);
    await expect(menuItems.first()).toBeVisible();

    const menuState = await menuList.evaluate(node => {
        const
            rect      = node.getBoundingClientRect(),
            cx        = rect.left + rect.width / 2,
            cy        = rect.top + rect.height / 2,
            hitTarget = document.elementFromPoint(cx, cy),
            activeEl  = document.activeElement;

        return {
            focusedInside: Boolean(activeEl && node.contains(activeEl)),
            hitInside    : Boolean(hitTarget && node.contains(hitTarget)),
            itemCount    : node.querySelectorAll('.neo-list-item').length
        }
    });

    expect(menuState.hitInside, 'overflow menu is hit-testable at its center after >= 300 ms').toBe(true);
    expect(menuState.focusedInside, 'focus stays inside the overflow menu after >= 300 ms').toBe(true);
    expect(menuState.itemCount).toBe(preHiddenIds.length);

    // While the menu is open, focus-gated actions and the visible/hidden header partition remain unchanged.
    const
        openHeaderProps    = await app.getComponent(chrome.headerId, ['contextualActionsVisible']),
        openPluginProps    = await app.getComponent(chrome.overflowPluginId, ['appliedHiddenIds']),
        openActionIds      = await headerToolbar.locator('.neo-toolbar-action').evaluateAll(nodes => nodes.map(n => n.id)),
        openVisibleHeaders = normalize(await headerToolbar.locator('.neo-tab-header-button:visible').allTextContents());

    expect(openHeaderProps?.contextualActionsVisible,
        'contextualActionsVisible stays true while the overflow menu is open').toBe(true);
    expect(openActionIds, 'focus-gated actions remain mounted in the header toolbar while the menu is open').toEqual(preActionIds);
    expect(openPluginProps?.appliedHiddenIds,
        'overflow appliedHiddenIds partition stays unchanged while the menu is open').toEqual(preHiddenIds);
    expect(openVisibleHeaders,
        'visible tab header buttons stay unchanged while the menu is open').toEqual(preVisibleHeaders);

    // Selecting an item from the menu activates that tab and closes the menu.
    const targetLabel = (await menuItems.last().innerText()).trim();

    await menuItems.filter({hasText: targetLabel}).first().click();

    await expect(menuList, 'selecting an overflow item closes the menu').toHaveCount(0, {timeout: 10000});
    await expect(headerToolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: targetLabel}),
        'the selected overflow item becomes the active visible tab').toHaveCount(1, {timeout: 10000})
}

test.describe('Workstation — tab overflow menu in docked and maximized panes', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1440, height: 900}});

    test('docked control arm: clicking More tabs keeps the overflow menu open, focused, and partition-stable until selection', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(app, chrome.overflowPluginId);
        await assertOverflowMenuHoldsAndSelects(page, app, chrome)
    });

    test('maximized 12-tab pane: clicking More tabs keeps the overflow menu open, focused, and focus-gated actions + partition unchanged until selection', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(app, chrome.overflowPluginId);

        // Reveal the focus-gated maximize action by clicking the pane body first.
        await page.locator(`#${chrome.bodyId}`).click({position: {x: 80, y: 80}});

        const maxAction = await app.callMethod(chrome.headerId, 'getAction', ['maximize']);
        expect(maxAction?.id).toBeTruthy();

        await expect(page.locator(`#${maxAction.id}`)).toBeVisible({timeout: 10000});
        await page.locator(`#${maxAction.id}`).click();
        await expect(page.locator(`#${chrome.containerId}`)).toHaveClass(/\bneo-dock-maximized\b/, {timeout: 10000});

        await waitForOverflowSettled(app, chrome.overflowPluginId);
        await assertOverflowMenuHoldsAndSelects(page, app, chrome)
    })
});
