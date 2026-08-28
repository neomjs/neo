import {test, expect} from '../../fixtures.mjs';

test.use({viewport: {width: 1280, height: 720}});

/**
 * @summary Returns the one context-menu example MainContainer property projection.
 * @param {Object} app
 * @returns {Promise<Object>}
 */
async function getMainState(app) {
    const result = await app.queryComponent(
        {className: 'Neo.examples.menu.context.MainContainer'},
        ['id', 'contextMenuId', 'contextPoint', 'lastAction', 'openCount']
    );

    return (Array.isArray(result) ? result[0] : result).properties
}

/**
 * @summary Requires worker and DOM dismissal to settle together.
 * @param {Object} page
 * @param {Object} app
 * @param {String} menuId
 * @returns {Promise<void>}
 */
async function expectDismissed(page, app, menuId) {
    await expect.poll(async () => {
        const state = await app.getComponent(menuId, ['hidden', 'mounted']);

        return `${state.hidden}:${state.mounted}`
    }).toBe('true:false');
    await expect(page.locator(`#${menuId}`)).toHaveCount(0)
}

/**
 * @summary Opens or repositions the context menu with a real browser right click.
 * @param {Object} page
 * @param {Object} app
 * @param {{x:Number,y:Number}} point
 * @param {Number} openCount
 * @param {String|null} [expectedMenuId]
 * @returns {Promise<{box:Object,menuId:String}>}
 */
async function openAt(page, app, point, openCount, expectedMenuId=null) {
    await page.mouse.click(point.x, point.y, {button: 'right'});

    await expect.poll(async () => (await getMainState(app)).openCount).toBe(openCount);

    const
        state  = await getMainState(app),
        menuId = state.contextMenuId,
        menu   = page.locator(`#${menuId}`);

    expectedMenuId && expect(menuId).toBe(expectedMenuId);
    expect(state.contextPoint).toEqual(point);
    await expect.poll(async () => {
        const menuState = await app.getComponent(menuId, ['align', 'hidden', 'mounted']);

        return menuState.mounted === true &&
            menuState.hidden === false &&
            menuState.align.target.x === point.x &&
            menuState.align.target.y === point.y &&
            Boolean(await menu.boundingBox())
    }).toBe(true);

    return {box: await menu.boundingBox(), menuId}
}

test.describe('Context Menu — real pointer + Neural Link', () => {
    test('reuses one Menu across placement, hierarchy, action and dismissal paths', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.stack || error?.message || error)));
        await page.goto('/examples/menu/context/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.menu.context');

        await expect(page.getByText('Right-click anywhere in this workspace')).toBeVisible();

        // Observe native suppression after the event has completed its browser dispatch.
        await page.evaluate(() => {
            window.__contextMenuDefaultPrevented = null;
            document.addEventListener('contextmenu', event => {
                queueMicrotask(() => {
                    window.__contextMenuDefaultPrevented = event.defaultPrevented
                })
            }, {once: true})
        });

        const
            center = {x: 640, y: 360},
            first  = await openAt(page, app, center, 1),
            menuId = first.menuId;

        expect(first.box.x).toBeCloseTo(center.x, 0);
        expect(first.box.y).toBeCloseTo(center.y, 0);
        await expect.poll(() => page.evaluate(() => window.__contextMenuDefaultPrevented)).toBe(true);

        const firstMenuState = await app.getComponent(menuId, [
            'align', 'hidden', 'menuFocus', 'mounted', 'parentComponent'
        ]);

        expect(firstMenuState).toMatchObject({
            hidden         : false,
            menuFocus      : true,
            mounted        : true,
            parentComponent: null
        });
        expect(firstMenuState.align.target).toEqual({...center, width: 0, height: 0});

        // Reposition the SAME live Menu at all viewport edges. Each physical rectangle must remain
        // wholly viewport-contained; the worker point records the unmodified browser coordinate.
        const edgePoints = [
            {x: 640,  y: 1},
            {x: 1279, y: 360},
            {x: 640,  y: 719},
            {x: 1,    y: 360}
        ];

        for (let index = 0; index < edgePoints.length; index++) {
            const {box} = await openAt(page, app, edgePoints[index], index + 2, menuId);

            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(1280);
            expect(box.y + box.height).toBeLessThanOrEqual(720)
        }

        // Non-focusable app chrome produces no helpful focus move; pointer containment must still dismiss.
        await page.mouse.click(640, 100);
        await expectDismissed(page, app, menuId);

        let menuState = await app.getComponent(menuId, ['hidden', 'mounted']);
        expect(menuState).toMatchObject({hidden: true, mounted: false});

        // A focusable outside target dismisses on mousedown and then receives the ordinary click/focus.
        await openAt(page, app, {x: 80, y: 80}, 6, menuId);

        const focusable = page.getByRole('button', {name: 'Focusable outside target'});
        await focusable.click();
        await expectDismissed(page, app, menuId);
        await expect(page.getByText('Focusable outside target clicked')).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe(
            'Focusable outside target'
        );

        // Real nested clicks keep the root plus both descendant submenus mounted and focus the leaf.
        await openAt(page, app, center, 7, menuId);
        await page.getByText('Inspect', {exact: true}).click();
        await expect(page.locator('.neo-menu-list')).toHaveCount(2);
        await page.getByText('Details', {exact: true}).click();
        await expect(page.locator('.neo-menu-list')).toHaveCount(3);
        await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Copy name');

        menuState = await app.getComponent(menuId, ['hidden', 'mounted']);
        expect(menuState).toMatchObject({hidden: false, mounted: true});

        // The real leaf click updates worker-owned state and follows Menu's leaf-dismissal policy.
        await page.getByText('Copy name', {exact: true}).click();
        await expect(page.getByText('Last action: Copy name')).toBeVisible();
        await expect.poll(async () => (await getMainState(app)).lastAction).toBe('Copy name');
        await expect(page.locator('.neo-menu-list')).toHaveCount(0);

        // Reopen at a fresh point after the nested tree settled; identity stays stable and Escape closes it.
        await openAt(page, app, {x: 300, y: 240}, 8, menuId);
        await page.keyboard.press('Escape');
        await expectDismissed(page, app, menuId);

        const finalState = await getMainState(app);
        expect(finalState).toMatchObject({contextMenuId: menuId, lastAction: 'Copy name', openCount: 8});
        expect(pageErrors).toEqual([]);
        expect(await app.getConsoleLogs('error')).toEqual([])
    })
});
