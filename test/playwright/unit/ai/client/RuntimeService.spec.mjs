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
            id               : 'dashboard-a',
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
            widget: component,
            rect  : {height: 260, width: 420, x: 12, y: 34}
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

    test('positions and focuses known native popup routes', async () => {
        const calls = [];

        Neo.manager.Window = {
            get: id => id === 'win-a' ? {
                id,
                nativeRoute: {
                    capabilities   : {close: true, focus: true, position: true},
                    nativeHandleKey: 'handle-a',
                    ownerWindowId  : 'owner-a',
                    targetWindowId : 'win-a'
                }
            } : null
        };

        Neo.Main = {
            windowNativeFocus: async data => {
                calls.push({type: 'focus', data});
                return true
            },
            windowNativeMoveTo: async data => {
                calls.push({type: 'move', data});
                return true
            }
        };

        await expect(service.positionWindow({
            nativeHandleKey: 'caller-forged-handle',
            ownerWindowId  : 'caller-forged-owner',
            targetWindowId : 'caller-forged-target',
            windowId       : 'win-a',
            x              : 100,
            y              : 200
        })).resolves.toEqual({
            success : true,
            windowId: 'win-a',
            x       : 100,
            y       : 200
        });
        await expect(service.focusWindow({windowId: 'win-a'})).resolves.toEqual({success: true, windowId: 'win-a'});
        expect(calls).toEqual([
            {
                type: 'move',
                data: {
                    nativeHandleKey: 'handle-a',
                    targetWindowId : 'win-a',
                    windowId       : 'owner-a',
                    x              : 100,
                    y              : 200
                }
            },
            {
                type: 'focus',
                data: {nativeHandleKey: 'handle-a', targetWindowId: 'win-a', windowId: 'owner-a'}
            }
        ])
    });

    test('closes the native popup and requires terminal topology disappearance', async () => {
        const calls     = [];
        let   connected = true;

        Neo.manager.Window = {
            get: id => id === 'win-a' && connected ? {
                id,
                nativeRoute: {
                    capabilities   : {close: true, focus: true, position: true},
                    nativeHandleKey: 'handle-a',
                    ownerWindowId  : 'owner-a',
                    targetWindowId : 'win-a'
                }
            } : null
        };
        Neo.Main = {
            windowNativeClose: async data => {
                calls.push(data);
                connected = false;
                return true
            }
        };

        await expect(service.closeWindow({windowId: 'win-a'})).resolves.toEqual({
            success : true,
            windowId: 'win-a'
        });
        expect(calls).toEqual([{
            nativeHandleKey: 'handle-a',
            targetWindowId : 'win-a',
            windowId       : 'owner-a'
        }])
    });

    test('reports platform-blocked native outcomes instead of manufacturing success', async () => {
        Neo.manager.Window = {
            get: id => id === 'win-a' ? {
                id,
                nativeRoute: {
                    capabilities   : {close: true, focus: true, position: true},
                    nativeHandleKey: 'handle-a',
                    ownerWindowId  : 'owner-a',
                    targetWindowId : 'win-a'
                }
            } : null
        };
        Neo.Main = {
            windowNativeFocus : async () => false,
            windowNativeMoveTo: async () => false
        };

        await expect(service.positionWindow({windowId: 'win-a', x: 1, y: 2})).resolves.toEqual({
            success: false,
            blocked: true,
            error  : "Window 'win-a' did not reach the requested position."
        });
        await expect(service.focusWindow({windowId: 'win-a'})).resolves.toEqual({
            success: false,
            blocked: true,
            error  : "Window 'win-a' did not accept focus."
        })
    });

    test('keeps physical close unsupported when the semantic owner did not grant it', async () => {
        let closeCalled = false;

        Neo.manager.Window = {
            get: id => id === 'win-a' ? {
                id,
                nativeRoute: {
                    capabilities   : {close: false, focus: true, position: true},
                    nativeHandleKey: 'handle-a',
                    ownerWindowId  : 'owner-a',
                    targetWindowId : 'win-a'
                }
            } : null
        };
        Neo.Main = {
            windowNativeClose: async () => {
                closeCalled = true;
                return true
            }
        };

        await expect(service.closeWindow({windowId: 'win-a'})).resolves.toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be closed by this runtime."
        });
        expect(closeCalled).toBe(false)
    });

    test('fails loud for unknown or unsupported window routes', async () => {
        Neo.manager.Window = {
            get: id => id === 'win-a' ? {id, nativeRoute: null} : null
        };
        Neo.Main = {};

        await expect(service.positionWindow({windowId: 'missing', x: 1, y: 2})).resolves.toEqual({
            success: false,
            error  : "Unknown windowId 'missing'."
        });
        await expect(service.positionWindow({windowId: 'win-a', x: 1, y: 2})).resolves.toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be positioned by this runtime."
        });
        await expect(service.focusWindow({windowId: 'win-a'})).resolves.toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be focused by this runtime."
        });
        await expect(service.closeWindow({windowId: 'win-a'})).resolves.toEqual({
            success    : false,
            unsupported: true,
            error      : "Window 'win-a' cannot be closed by this runtime."
        })
    });
});
