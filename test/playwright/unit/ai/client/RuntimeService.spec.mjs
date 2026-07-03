import {setup} from '../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ClientRuntimeServiceWindowOpsTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import RuntimeService from '../../../../../src/ai/client/RuntimeService.mjs';

test.describe('Neo.ai.client.RuntimeService window ops (#13446)', () => {
    let originalGetComponent, originalMain, originalWindowManager, service;

    test.beforeEach(() => {
        originalGetComponent  = Neo.getComponent;
        originalMain          = Neo.Main;
        originalWindowManager = Neo.manager.Window;
        service               = Neo.create(RuntimeService);
    });

    test.afterEach(() => {
        Neo.getComponent    = originalGetComponent;
        Neo.Main            = originalMain;
        Neo.manager.Window  = originalWindowManager;

        service.destroy()
    });

    test('opens a known dashboard widget in a popup', async () => {
        let captured;

        const dashboard = {
            id                : 'dashboard-a',
            openWidgetInPopup: async (widget, rect) => {
                captured = {widget, rect};

                return {
                    popupHeight: rect.height - 50,
                    popupLeft  : rect.x + 100,
                    popupTop   : rect.y + 200,
                    popupWidth : rect.width,
                    windowName : widget.id
                }
            }
        };

        const component = {
            id        : 'widget-a',
            parent    : dashboard,
            getDomRect: async () => ({height: 260, width: 420, x: 12, y: 34})
        };

        Neo.getComponent = id => id === 'widget-a' ? component : null;

        const result = await service.openComponentWindow({componentId: 'widget-a'});

        expect(captured).toEqual({
            widget   : component,
            rect     : {height: 260, width: 420, x: 12, y: 34}
        });
        expect(result).toEqual({
            success    : true,
            componentId: 'widget-a',
            dashboardId: 'dashboard-a',
            popupHeight: 210,
            popupLeft  : 112,
            popupTop   : 234,
            popupWidth : 420,
            windowName : 'widget-a'
        })
    });

    test('fails loud when the component or dashboard popup host is unknown', async () => {
        Neo.getComponent = id => id === 'widget-a' ? {id, parent: null} : null;

        await expect(service.openComponentWindow({componentId: 'missing'})).resolves.toEqual({
            success: false,
            error  : "Unknown componentId 'missing'."
        });

        await expect(service.openComponentWindow({componentId: 'widget-a'})).resolves.toEqual({
            success: false,
            error  : "Component 'widget-a' is not inside a dashboard host that can open popups."
        })
    });

    test('positions and focuses known native popup handles', () => {
        const calls = [];

        Neo.manager.Window = {
            get: id => id === 'win-a' ? {id} : null
        };

        Neo.Main = {
            openWindows: {
                'win-a': {
                    win: {
                        focus : () => calls.push({type: 'focus'}),
                        moveTo: () => {}
                    }
                }
            },
            windowMoveTo: data => calls.push({type: 'move', data})
        };

        expect(service.positionWindow({windowId: 'win-a', x: 100, y: 200})).toEqual({
            success : true,
            windowId: 'win-a',
            x       : 100,
            y       : 200
        });
        expect(service.focusWindow({windowId: 'win-a'})).toEqual({success: true, windowId: 'win-a'});
        expect(calls).toEqual([
            {type: 'move', data: {windowName: 'win-a', x: 100, y: 200}},
            {type: 'focus'}
        ])
    });

    test('fails loud for unknown or unsupported window handles', () => {
        Neo.manager.Window = {
            get: id => id === 'win-a' ? {id} : null
        };
        Neo.Main = {openWindows: {}};

        expect(service.positionWindow({windowId: 'missing', x: 1, y: 2})).toEqual({
            success: false,
            error  : "Unknown windowId 'missing'."
        });
        expect(service.positionWindow({windowId: 'win-a', x: 1, y: 2})).toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be positioned by this runtime."
        });
        expect(service.focusWindow({windowId: 'win-a'})).toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be focused by this runtime."
        })
    });
});
