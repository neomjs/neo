import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'ManagerWindowTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

test.describe.serial('Neo.manager.Window connection ordering (#15396)', () => {
    let WindowManager;

    test.beforeAll(async () => {
        WindowManager = (await import('../../../../src/manager/Window.mjs')).default
    });

    test.beforeEach(() => {
        WindowManager.items = [];
        WindowManager.map   = new Map()
    });

    test.afterEach(() => {
        WindowManager.items = [];
        WindowManager.map   = new Map()
    });

    /**
     * @summary Creates one complete geometry report for a native browser window.
     * @param {Object} [overrides]
     * @returns {Object}
     */
    function createGeometry(overrides={}) {
        return {
            innerHeight: 500,
            innerWidth : 600,
            outerHeight: 540,
            outerWidth : 620,
            screenLeft : 100,
            screenTop  : 80,
            ...overrides
        }
    }

    /**
     * @summary Creates an exact-window native route with every physical capability admitted.
     * @param {String} windowId
     * @returns {Object}
     */
    function createNativeRoute(windowId) {
        return {
            capabilities: {
                close   : true,
                focus   : true,
                position: true,
                resize  : true
            },
            nativeHandleKey: `handle-${windowId}`,
            ownerWindowId  : 'source-window',
            targetWindowId : windowId
        }
    }

    test('connect enriches a geometry-first provisional record with its exact native route', () => {
        const
            windowId    = 'geometry-first-window',
            nativeRoute = createNativeRoute(windowId),
            geometry    = createGeometry();

        WindowManager.onWindowPositionChange({windowId, ...geometry});

        const provisional = WindowManager.get(windowId);

        expect(provisional.nativeRoute).toBeNull();
        expect(provisional.capabilities).toEqual({close: false, focus: false, position: false, resize: false});

        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: {...geometry, nativeRoute},
            windowId
        });

        const connected = WindowManager.get(windowId);

        expect(WindowManager.items).toHaveLength(1);
        expect(connected).toBe(provisional);
        expect(connected.appName).toBe('DockDemo');
        expect(connected.nativeRoute).toBe(nativeRoute);
        expect(connected.capabilities).toBe(nativeRoute.capabilities)
    });

    test('position publication after connect updates geometry without erasing native authority', () => {
        const
            windowId    = 'connect-first-window',
            nativeRoute = createNativeRoute(windowId),
            geometry    = createGeometry();

        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: {...geometry, nativeRoute},
            windowId
        });

        WindowManager.onWindowPositionChange({
            ...createGeometry({screenLeft: 420, screenTop: 240}),
            windowId
        });

        const connected = WindowManager.get(windowId);

        expect(WindowManager.items).toHaveLength(1);
        expect(connected.nativeRoute).toBe(nativeRoute);
        expect(connected.capabilities).toBe(nativeRoute.capabilities);
        // `screenLeft/Top` is the frame origin; the viewport sits inside the 10 px side border and
        // the 30 px title bar this geometry reports (620−600 → 10 each side; 540−500−10 → 30 on top)
        expect(connected.outerRect.x).toBe(420);
        expect(connected.outerRect.y).toBe(240);
        expect(connected.innerRect.x).toBe(430);
        expect(connected.innerRect.y).toBe(270)
    });

    test('a route-less reconnect revokes authority instead of inheriting the previous document route', () => {
        const
            windowId    = 'reloaded-window',
            nativeRoute = createNativeRoute(windowId),
            geometry    = createGeometry();

        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: {...geometry, nativeRoute},
            windowId
        });
        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: geometry,
            windowId
        });

        const reconnected = WindowManager.get(windowId);

        expect(WindowManager.items).toHaveLength(1);
        expect(reconnected.nativeRoute).toBeNull();
        expect(reconnected.capabilities).toEqual({close: false, focus: false, position: false, resize: false})
    })
});
