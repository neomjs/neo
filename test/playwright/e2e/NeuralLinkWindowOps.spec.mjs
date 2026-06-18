import {test, expect} from '../fixtures.mjs';

/**
 * @summary Live Neural Link proof for dashboard window operations.
 *
 * Drives the agent-facing RuntimeService path against the AgentOS dashboard: resolve a real
 * dashboard panel through App-Worker state, open it through the dashboard popup primitive, assert the
 * popup registers in window topology, then exercise focus/position fail-closed behavior for the live
 * popup window id in headless Chrome.
 */
test.describe('Neural Link window operations (e2e)', () => {
    test.setTimeout(90000);

    test('opens a dashboard panel popup and resolves known-window focus/position calls', async ({page, neuralLink}) => {
        let popup;

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-panel-settings')).toBeVisible({timeout: 60000});

        const app = await neuralLink.connectToApp('AgentOS');

        const
            dashboards = await app.queryComponent({className: 'Neo.dashboard.Container'}, ['id', 'className', 'ntype']),
            panels     = await app.queryComponent({className: 'AgentOS.view.FleetSettingsPanel'}, ['id', 'className', 'ntype', 'parentId']);

        expect(dashboards.length, 'dashboard host should be discoverable through Neural Link').toBeGreaterThan(0);
        expect(panels.length, 'FleetSettingsPanel should be discoverable through Neural Link').toBeGreaterThan(0);

        const
            dashboard = dashboards[0],
            panel     = panels[0];

        expect(dashboard.properties).toMatchObject({
            className: 'Neo.dashboard.Container',
            ntype    : 'dashboard'
        });
        expect(panel.properties).toMatchObject({
            className: 'AgentOS.view.FleetSettingsPanel',
            ntype    : 'dashboard-panel',
            parentId : dashboard.id
        });

        const sourceWindows = (await app.getWindowTopology()).filter(win => win.sessionId === app.sessionId);
        expect(sourceWindows.some(win => win.appName === 'AgentOS')).toBe(true);

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
                windowName : 'settings'
            });

            await popup.waitForLoadState('domcontentloaded');
            await expect(popup.locator('.agent-panel-settings')).toBeVisible({timeout: 30000});

            await expect.poll(async () => {
                const windows = (await app.getWindowTopology()).filter(win => win.sessionId === app.sessionId);
                return windows.length
            }, {timeout: 15000}).toBeGreaterThan(sourceWindows.length);

            const
                windows     = (await app.getWindowTopology()).filter(win => win.sessionId === app.sessionId),
                popupWindow = windows.find(win => win.appName === 'AgentOSWidget');

            expect(popupWindow?.windowId, 'popup should register a logical window id').toBeTruthy();
            expect(popupWindow.appWorkerId).toBe(app.sessionId);

            const focusResult = await app.focusWindow(popupWindow.windowId);
            expect(focusResult).toMatchObject({
                success    : false,
                unsupported: true
            });
            expect(focusResult.error).toContain(popupWindow.windowId);

            const positionResult = await app.positionWindow({windowId: popupWindow.windowId, x: 120, y: 140});
            expect(positionResult).toMatchObject({
                success    : false,
                unsupported: true
            });
            expect(positionResult.error).toContain(popupWindow.windowId);

            await expect(app.focusWindow('missing-window-id')).rejects.toThrow(/Unknown windowId 'missing-window-id'/);
        } finally {
            await popup?.close().catch(() => {})
        }
    });
});
