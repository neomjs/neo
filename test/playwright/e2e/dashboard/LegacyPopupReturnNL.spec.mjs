import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A legacy dashboard widget returns once after physical popup close, immediately and after
 * its source is hidden and shown. The existing base example supplies the real dashboard; test-only
 * configuration adds a header handle and an existing empty shared-worker popup host.
 */
test.describe('Legacy dashboard popup return', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1200, height: 800}});

    test('a terminal tear-out returns the original widget once across close and hide/show', async ({page, neuralLink}, testInfo) => {
        await neuralLink.routeConfig(page, config => ({
            ...config,
            mainThreadAddons: ['DragDrop', 'Navigator', 'Stylesheet', 'WindowPosition'],
            useAiClient     : true,
            useSharedWorkers: true
        }), '**/examples/dashboard/base/neo-config.json*');
        await page.goto('/examples/dashboard/base/index.html');

        const app         = await neuralLink.connectToApp('Neo.examples.dashboard.base');
        const [dashboard] = await app.findInstances({className: 'Neo.dashboard.Container'},
            ['id', 'items.0.id', 'sortZone.id', 'windowId']);
        const dashboardId  = dashboard.id,
              widgetId     = 'legacy-return-widget',
              sourceWindow = dashboard.properties.windowId,
              widget       = page.locator(`#${widgetId}`),
              popupUrl     = new URL('/examples/dashboard/crossWindow/index.html?popout=legacy-return', page.url()).href;

        await expect.poll(async () => (await app.getComponent(dashboardId, ['sortZone.id']))['sortZone.id']).toBeTruthy();

        const sortZoneId = (await app.getComponent(dashboardId, ['sortZone.id']))['sortZone.id'];

        await app.callMethod(dashboardId, 'removeAt', [0]);
        await app.callMethod(dashboardId, 'insert', [0, {
            ntype: 'component',
            id   : widgetId,
            vdom : {cn: [
                {tag: 'div', cls: ['neo-draggable', 'legacy-return-handle'], text: 'Return widget'},
                {tag: 'div', text: 'Retained body value'}
            ]}
        }]);

        await app.setProperties(dashboardId, {popupUrl});
        await app.setProperties(sortZoneId, {dragHandleSelector: '.legacy-return-handle'});
        await app.callMethod(sortZoneId, 'adjustItemCls', [true]);
        const handle = widget.locator('.legacy-return-handle');
        await expect(handle).toBeVisible();
        await expect(handle).toHaveClass(/neo-draggable/);

        for (let cycle = 0; cycle < 3; cycle++) {
            const box        = await handle.boundingBox(),
                  popupReady = page.waitForEvent('popup', {timeout: 10000});

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(1, box.y + box.height / 2, {steps: 40});
            await testInfo.attach(`drag-state-${cycle}`, {
                body: Buffer.from(JSON.stringify(await app.getComponent(sortZoneId,
                    ['dragHandleSelector', 'dragComponent.id', 'isWindowDragging', 'currentIndex', 'ownerRect', 'sortBoundaryRect']))),
                contentType: 'application/json'
            });

            const popup = await popupReady;

            try {
                await expect(popup.locator(`#${widgetId}`)).toBeVisible({timeout: 30000});
                expect((await app.getComponent(sortZoneId, ['isWindowDragging'])).isWindowDragging).toBe(true);
                await page.mouse.up();
                await expect.poll(async () => app.getComponent(sortZoneId, ['currentIndex', 'isWindowDragging', 'dragProxy']))
                    .toMatchObject({currentIndex: -1, isWindowDragging: false, dragProxy: null});

                if (cycle === 2) {
                    await app.setProperties(dashboardId, {hidden: true});
                    await expect(page.locator(`#${dashboardId}`)).toBeHidden()
                }

                await Promise.all([popup.waitForEvent('close'), popup.close({runBeforeUnload: true})]);

                await expect.poll(async () => (await app.getComponent(widgetId, ['parentId'])).parentId).toBe(dashboardId);
                expect((await app.getComponent(dashboardId, ['detachedItems.size']))['detachedItems.size']).toBe(0);

                if (cycle === 2) {
                    await app.setProperties(dashboardId, {hidden: false})
                }
                await testInfo.attach(`return-state-${cycle}`, {
                    body: Buffer.from(JSON.stringify({
                        widget     : await app.getComponent(widgetId, ['mounted', 'hidden', 'removeDom', 'vnodeInitialized', 'vnode', 'vdom', 'isVdomUpdating', 'parentId', 'windowId']),
                        dashboard  : await app.getComponent(dashboardId, ['vdom', 'vnode', 'isVdomUpdating', 'needsVdomUpdate', 'updateDepth']),
                        consistency: await app.verifyComponentConsistency(dashboardId)
                    })),
                    contentType: 'application/json'
                });
                await expect(widget, 'closing the popup returns the view without navigation').toBeVisible();
                await expect(widget).toContainText('Retained body value');
                await expect.poll(async () => (await app.verifyComponentConsistency(dashboardId)).consistent).toBe(true);
                const returned = await app.getComponent(widgetId, ['parentId', 'windowId']);

                expect(returned).toMatchObject({parentId: dashboardId, windowId: sourceWindow});
                expect(await page.locator(`[id="${widgetId}"]`).count()).toBe(1);
                expect((await app.getComponent(dashboardId, ['detachedItems.size']))['detachedItems.size']).toBe(0);

                await app.setProperties(dashboardId, {hidden: true});
                await expect(widget).toBeHidden();
                await app.setProperties(dashboardId, {hidden: false});
                await expect(widget).toBeVisible();
                expect(await page.locator(`[id="${widgetId}"]`).count()).toBe(1);
                expect((await app.verifyComponentConsistency(dashboardId)).consistent).toBe(true)
            } finally {
                await page.mouse.up();
                !popup.isClosed() && await popup.close()
            }
        }

        const box               = await handle.boundingBox(),
              reentryPopupReady = page.waitForEvent('popup', {timeout: 10000});

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(1, box.y + box.height / 2, {steps: 40});
        const reentryPopup = await reentryPopupReady;

        try {
            await expect(reentryPopup.locator(`#${widgetId}`)).toBeVisible({timeout: 30000});
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 40});
            await expect.poll(() => reentryPopup.isClosed(), {message: 'drag-back retires the popup'}).toBe(true);
            await page.mouse.up();
            await expect(widget).toBeVisible();
            await expect.poll(async () => (await app.verifyComponentConsistency(dashboardId)).consistent).toBe(true)
        } finally {
            await page.mouse.up();
            !reentryPopup.isClosed() && await reentryPopup.close()
        }
    });
});
