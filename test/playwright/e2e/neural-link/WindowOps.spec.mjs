import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Live Neural Link proof for dashboard window operations.
 *
 * Drives the agent-facing RuntimeService path against the Colors dashboard: resolve a real
 * dashboard panel through App-Worker state, open it through the dashboard popup primitive, assert the
 * popup registers in window topology, then exercise focus/position/close through the trusted identity
 * spine and observe the terminal topology disappearance.
 */
test.describe('Neural Link window operations (e2e)', () => {
    test.setTimeout(90000);

    test('operates one exact popup generation and degrades a reloaded generation', async ({page, neuralLink}) => {
        let popup;

        // Colors is the surviving Engine-owned dashboard host. Neural Link is test-provisioned
        // here rather than changing the app's production config solely to serve this witness.
        await page.route('**/apps/colors/neo-config.json*', async route => {
            const
                response = await route.fetch(),
                config   = await response.json();

            await route.fulfill({response, json: {...config, useAiClient: true}})
        });

        await page.goto('/apps/colors/index.html');
        await expect(page.locator('.colors-viewport')).toBeVisible({timeout: 60000});
        await expect(page.locator('.neo-dashboard-panel').first()).toBeVisible({timeout: 60000});

        const app = await neuralLink.connectToApp('Colors');

        const
            dashboards = await app.queryComponent({className: 'Neo.dashboard.Container'}, ['id', 'className', 'ntype']),
            panels     = await app.queryComponent({className: 'Neo.dashboard.Panel'}, ['id', 'className', 'ntype', 'parentId']);

        expect(dashboards.length, 'dashboard host should be discoverable through Neural Link').toBeGreaterThan(0);
        expect(panels.length, 'the Accounts panel should be discoverable through Neural Link').toBeGreaterThan(0);

        const
            dashboard = dashboards[0],
            panel     = panels[0];

        expect(dashboard.properties).toMatchObject({
            className: 'Neo.dashboard.Container',
            ntype    : 'dashboard'
        });
        expect(panel.properties).toMatchObject({
            className: 'Neo.dashboard.Panel',
            ntype    : 'dashboard-panel',
            parentId : dashboard.id
        });

        const getBoundWindows = async () => {
            const windows = await app.getWindowTopology();

            return windows.filter(win => win.appWorkerId === app.sessionId)
        };

        const sourceWindows = await getBoundWindows();
        expect(sourceWindows.some(win => win.appName === 'Colors')).toBe(true);

        try {
            const result = await Promise.all([
                page.waitForEvent('popup'),
                app.openComponentWindow({
                    componentId: panel.id,
                    dashboardId: dashboard.id,
                    rect       : {height: 240, width: 420, x: 80, y: 80}
                })
            ]);

            popup = result[0];

            const openResult = result[1];
            expect(openResult).toMatchObject({
                success    : true,
                componentId: panel.id,
                dashboardId: dashboard.id,
                popupWidth : 420,
                windowName : 'grid-panel'
            });

            await popup.waitForLoadState('domcontentloaded');
            await expect(popup.locator(`#${panel.id}`)).toBeVisible({timeout: 30000});

            await expect.poll(async () => {
                const windows = await getBoundWindows();
                return windows.length
            }, {timeout: 15000}).toBeGreaterThan(sourceWindows.length);

            const
                windows     = await getBoundWindows(),
                popupWindow = windows.find(win => win.appName === 'ColorsWidget');

            expect(popupWindow?.windowId, 'popup should register a logical window id').toBeTruthy();
            expect(popupWindow.appWorkerId).toBe(app.sessionId);
            expect(popupWindow.capabilities).toEqual({close: true, focus: true, position: true, resize: false});
            expect(popupWindow.nativeHandleKey).toBeUndefined();
            expect(popupWindow.ownerWindowId).toBeUndefined();
            expect(popupWindow.targetWindowId).toBeUndefined();

            const
                sourceWindow = windows.find(win => win.appName === 'Colors'),
                sourceNodeId = 'nl-atomic-drag-source',
                targetNodeId = 'nl-atomic-drag-target';

            await page.evaluate(id => {
                const node = document.createElement('div');

                Object.assign(node, {
                    className: 'neo-draggable',
                    id
                });
                Object.assign(node.style, {
                    height  : '40px',
                    left    : '40px',
                    position: 'fixed',
                    top     : '120px',
                    width   : '40px',
                    zIndex  : '99999'
                });
                document.body.append(node)
            }, sourceNodeId);

            await popup.evaluate(id => {
                const node = document.createElement('div');

                Object.assign(node, {id});
                Object.assign(node.style, {
                    height  : '30px',
                    left    : '80px',
                    position: 'fixed',
                    top     : '70px',
                    width   : '50px',
                    zIndex  : '99999'
                });
                document.body.append(node)
            }, targetNodeId);

            const dragReceipt = await app.driveDrag({
                source: {
                    targetId: sourceNodeId,
                    windowId: sourceWindow.windowId
                },
                destination: {
                    targetId: targetNodeId,
                    windowId: popupWindow.windowId
                },
                durationMs: 160,
                steps     : 8
            });

            expect(dragReceipt).toMatchObject({
                success    : true,
                phase      : 'complete',
                released   : true,
                source     : {windowId: sourceWindow.windowId},
                destination: {windowId: popupWindow.windowId},
                observed   : {started: true, ended: true}
            });
            expect(dragReceipt.observed.moveCount).toBeGreaterThan(0);
            expect(dragReceipt.destination.screen.x - dragReceipt.destination.targetClient.x)
                .toBeCloseTo(popupWindow.innerRect.x, 0);
            expect(dragReceipt.destination.screen.y - dragReceipt.destination.targetClient.y)
                .toBeCloseTo(popupWindow.innerRect.y, 0);
            expect(dragReceipt.destination.screen.x - dragReceipt.destination.sourceEventClient.x)
                .toBeCloseTo(sourceWindow.innerRect.x, 0);
            expect(dragReceipt.destination.screen.y - dragReceipt.destination.sourceEventClient.y)
                .toBeCloseTo(sourceWindow.innerRect.y, 0);

            await page.evaluate(id => document.getElementById(id)?.remove(), sourceNodeId);
            await popup.evaluate(id => document.getElementById(id)?.remove(), targetNodeId);

            const focusResult = await app.focusWindow(popupWindow.windowId);
            expect(focusResult).toMatchObject({
                success : true,
                windowId: popupWindow.windowId
            });

            const positionResult = await app.positionWindow({windowId: popupWindow.windowId, x: 120, y: 140});
            expect(positionResult).toMatchObject({
                success : true,
                windowId: popupWindow.windowId,
                x       : 120,
                y       : 140
            });
            await expect.poll(() => popup.evaluate(() => ({x: window.screenX, y: window.screenY})), {
                timeout: 5000
            }).toEqual({x: 120, y: 140});

            await expect(app.focusWindow('missing-window-id')).rejects.toThrow(/Unknown windowId 'missing-window-id'/);

            const closeResult = await app.closeWindow(popupWindow.windowId);
            expect(closeResult).toEqual({success: true, windowId: popupWindow.windowId});

            await expect.poll(async () => {
                const windows = await getBoundWindows();
                return windows.some(win => win.windowId === popupWindow.windowId)
            }, {timeout: 15000}).toBe(false);
            await expect.poll(() => popup.isClosed(), {timeout: 5000}).toBe(true)

            await expect(app.focusWindow(popupWindow.windowId)).rejects.toThrow(
                new RegExp(`Unknown windowId '${popupWindow.windowId}'`)
            );

            await expect.poll(async () => {
                const matches = await app.queryComponent({id: panel.id}, ['parentId']);

                return matches[0]?.properties?.parentId
            }, {timeout: 15000}).toBe(dashboard.id);

            const reopened = await Promise.all([
                page.waitForEvent('popup'),
                app.openComponentWindow({
                    componentId: panel.id,
                    dashboardId: dashboard.id,
                    rect       : {height: 240, width: 420, x: 80, y: 80}
                })
            ]);

            popup = reopened[0];

            expect(reopened[1].success).toBe(true);
            await popup.waitForLoadState('domcontentloaded');

            await expect.poll(async () => {
                const windows = await getBoundWindows();

                return windows.some(win => win.appName === 'ColorsWidget' && win.windowId !== popupWindow.windowId)
            }, {timeout: 15000}).toBe(true);

            const reopenedWindow = (await getBoundWindows()).find(win =>
                win.appName === 'ColorsWidget' && win.windowId !== popupWindow.windowId
            );

            expect(reopenedWindow.capabilities).toEqual({close: true, focus: true, position: true, resize: false});

            await popup.reload();
            await popup.waitForLoadState('domcontentloaded');

            await expect.poll(async () => {
                const windows = await getBoundWindows();

                return windows.find(win => win.appName === 'ColorsWidget')?.capabilities
            }, {timeout: 15000}).toEqual({close: false, focus: false, position: false, resize: false})
        } finally {
            await popup?.close().catch(() => {})
        }
    });
});
