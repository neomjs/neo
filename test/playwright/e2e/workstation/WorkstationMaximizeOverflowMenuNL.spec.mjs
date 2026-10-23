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
 * @summary Waits for the `heavy-tabs` overflow plugin to finish any in-flight or queued measurement pass, and for
 * the DOM to show that split. The plugin publishes `appliedHiddenIds` and clears `measuring` before the header
 * updates of the same pass land, so the worker state alone can lead the DOM a snapshot reads.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {Object} chrome The `heavy-tabs` chrome identity, including its header `buttons`.
 * @returns {Promise<Object>}
 */
async function waitForOverflowSettled(page, app, chrome) {
    const buttonIds = Object.values(chrome.buttons).filter(Boolean);
    let   props     = null;

    await expect.poll(async () => {
        props = await app.getComponent(chrome.overflowPluginId, [
            'appliedHiddenIds',
            'measuring',
            'menuProjectionQueued',
            'projectQueued'
        ]);

        if (!(props && props.measuring === false && props.projectQueued === false && Array.isArray(props.appliedHiddenIds) && props.appliedHiddenIds.length > 0)) {
            return false
        }

        return page.evaluate(({buttonIds, hiddenIds}) => buttonIds.every(id =>
            (document.getElementById(id)?.getClientRects().length > 0) !== hiddenIds.includes(id)
        ), {buttonIds, hiddenIds: props.appliedHiddenIds})
    }, {
        message: 'overflow projection settles with a non-empty hidden partition the DOM shows',
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

    await waitForOverflowSettled(page, app, chrome);

    const preActionIds = await headerToolbar.locator('.neo-toolbar-action').evaluateAll(nodes => nodes.map(n => n.id));

    expect(preActionIds.length, 'focus-gated actions are present in the header toolbar DOM').toBeGreaterThan(3);

    await overflowControl.click();

    const
        menuList  = page.locator('.neo-menu-list:visible'),
        menuItems = menuList.locator('.neo-list-item').filter({hasText: /\S/});

    await expect(menuList, 'clicking More tabs opens the overflow menu').toHaveCount(1);

    // The revealed actions' own resize can re-partition the closed strip after any pre-click settle, so the partition
    // that must hold is the one the menu opened against. An open menu parks every projection.
    const
        openPluginProps    = await waitForOverflowSettled(page, app, chrome),
        openHiddenIds      = [...openPluginProps.appliedHiddenIds],
        openVisibleHeaders = normalize(await headerToolbar.locator('.neo-tab-header-button:visible').allTextContents());

    // wall-clock-under-test: DomAccess#align auto-hide removes the menu at ~48 ms and triggers header repartition by ~300 ms.
    await page.waitForTimeout(350);

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
    expect(menuState.itemCount).toBe(openHiddenIds.length);

    // While the menu is open, focus-gated actions and the visible/hidden header partition remain unchanged.
    const
        heldHeaderProps    = await app.getComponent(chrome.headerId, ['contextualActionsVisible']),
        heldPluginProps    = await app.getComponent(chrome.overflowPluginId, ['appliedHiddenIds']),
        heldActionIds      = await headerToolbar.locator('.neo-toolbar-action').evaluateAll(nodes => nodes.map(n => n.id)),
        heldVisibleHeaders = normalize(await headerToolbar.locator('.neo-tab-header-button:visible').allTextContents());

    expect(heldHeaderProps?.contextualActionsVisible,
        'contextualActionsVisible stays true while the overflow menu is open').toBe(true);
    expect(heldActionIds, 'focus-gated actions remain mounted in the header toolbar while the menu is open').toEqual(preActionIds);
    expect(heldPluginProps?.appliedHiddenIds,
        'overflow appliedHiddenIds partition stays unchanged while the menu is open').toEqual(openHiddenIds);
    expect(heldVisibleHeaders,
        'visible tab header buttons stay unchanged while the menu is open').toEqual(openVisibleHeaders);

    // Selecting an item from the menu activates that tab and closes the menu.
    const targetLabel = (await menuItems.last().innerText()).trim();

    await menuItems.filter({hasText: targetLabel}).first().click();

    await expect(menuList, 'selecting an overflow item closes the menu').toHaveCount(0, {timeout: 10000});
    await expect(headerToolbar.locator('.neo-tab-header-button.pressed:visible').filter({hasText: targetLabel}),
        'the selected overflow item becomes the active visible tab').toHaveCount(1, {timeout: 10000})
}

/**
 * @summary Presses More tabs on the unfocused `heavy-tabs` pane for `holdMs`, releases on the same point, and asserts
 * that the release opened the menu on a control that never moved.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {Object} chrome
 * @param {Number} holdMs How long the button stays down.
 */
async function assertPressOpensMenuInPlace(page, app, chrome, holdMs) {
    const
        overflowControl = page.locator(`#${chrome.overflowControlId}`),
        menuList        = page.locator('.neo-menu-list:visible'),
        header          = await app.getComponent(chrome.headerId, ['contextualActionsVisible']);

    expect(header?.contextualActionsVisible, 'the pane starts unfocused: its focus-gated actions are withdrawn').toBe(false);
    await expect(overflowControl).toBeVisible();

    const before = await overflowControl.boundingBox(),
          x      = before.x + before.width  / 2,
          y      = before.y + before.height / 2;

    // A human press: the pointer-down focuses the pane, which owes its focus reveal while the button is
    // held, and the pointer-up has to find the same control it pressed.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(holdMs);
    await page.mouse.up();

    await expect(menuList, 'one press opens the overflow menu').toHaveCount(1, {timeout: 3000});

    const after = await overflowControl.boundingBox();

    expect(Math.abs(after.x - before.x), 'the control did not move out from under the pointer').toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);

    const props = await app.getComponent(chrome.headerId, ['contextualActionsVisible']);
    expect(props?.contextualActionsVisible, 'the press focused the pane as before').toBe(true)
}

test.describe('Workstation — tab overflow menu in docked and maximized panes', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1440, height: 900}});

    test('docked control arm: clicking More tabs keeps the overflow menu open, focused, and partition-stable until selection', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(page, app, chrome);
        await assertOverflowMenuHoldsAndSelects(page, app, chrome)
    });

    test('unfocused docked pane: one human-paced press on More tabs opens the menu, and the control stays under the pointer (#20046)', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(page, app, chrome);
        await assertPressOpensMenuInPlace(page, app, chrome, 120)
    });

    test('unfocused docked pane: a press held for two seconds still opens the menu on release, and the control stays under the pointer (#20046)', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(page, app, chrome);
        // wall-clock-under-test: only the press may end its hold, however long the button stays down
        await assertPressOpensMenuInPlace(page, app, chrome, 2000)
    });

    test('maximized 12-tab pane: clicking More tabs keeps the overflow menu open, focused, and focus-gated actions + partition unchanged until selection', async ({page, neuralLink}) => {
        const {app, chrome} = await connectHeavyTabs(page, neuralLink);

        await waitForOverflowSettled(page, app, chrome);

        // Reveal the focus-gated maximize action by clicking the pane body first.
        await page.locator(`#${chrome.bodyId}`).click({position: {x: 80, y: 80}});

        const maxAction = await app.callMethod(chrome.headerId, 'getAction', ['maximize']);
        expect(maxAction?.id).toBeTruthy();

        await expect(page.locator(`#${maxAction.id}`)).toBeVisible({timeout: 10000});
        await page.locator(`#${maxAction.id}`).click();
        await expect(page.locator(`#${chrome.containerId}`)).toHaveClass(/\bneo-dock-maximized\b/, {timeout: 10000});

        await waitForOverflowSettled(page, app, chrome);
        await assertOverflowMenuHoldsAndSelects(page, app, chrome)
    })
});
