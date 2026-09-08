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

test.describe.serial('Neo.manager.Window native route authority (#18501)', () => {
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
     * @summary A route granting every axis, so each test falsifies exactly one of them.
     * @param {Object} [overrides]
     * @returns {Object}
     */
    function grantingRoute(overrides={}) {
        return {
            capabilities   : {close: true, focus: true, position: true, resize: true},
            nativeHandleKey: 'handle-popup-window',
            ownerWindowId  : 'owner-window',
            targetWindowId : 'popup-window',
            ...overrides
        }
    }

    /**
     * @summary Asks for `position` as the asserted owner of the exact popup, unless overridden.
     * @param {Object} [overrides]
     * @returns {Object}
     */
    function ask(overrides={}) {
        return WindowManager.resolveNativeRoute({
            capability    : 'position',
            ownerWindowId : 'owner-window',
            route         : grantingRoute(),
            targetWindowId: 'popup-window',
            ...overrides
        })
    }

    test('a route granting every axis is granted, and only then is the route handed back', () => {
        const route  = grantingRoute(),
              result = ask({route});

        expect(result.granted).toBe(true);
        expect(result.route).toBe(route)
    });

    test('an owner mismatch refuses on that axis alone, and withholds the route', () => {
        const result = ask({route: grantingRoute({ownerWindowId: 'someone-else'})});

        expect(result.ownerMatches).toBe(false);
        expect(result.granted).toBe(false);
        expect(result.route).toBeNull();
        expect(result).toMatchObject({capable: true, hasHandle: true, hasTarget: true, present: true, targetMatches: true})
    });

    test('a target mismatch refuses on that axis alone', () => {
        const result = ask({route: grantingRoute({targetWindowId: 'a-different-popup'})});

        expect(result.targetMatches).toBe(false);
        expect(result.granted).toBe(false);
        expect(result).toMatchObject({capable: true, hasHandle: true, hasTarget: true, ownerMatches: true, present: true})
    });

    test('an ungranted capability refuses on that axis alone', () => {
        const result = ask({route: grantingRoute({capabilities: {close: true, focus: true, position: false, resize: true}})});

        expect(result.capable).toBe(false);
        expect(result.granted).toBe(false);
        expect(result).toMatchObject({hasHandle: true, hasTarget: true, ownerMatches: true, present: true, targetMatches: true})
    });

    test('a route without its opaque handle refuses on that axis alone', () => {
        const result = ask({route: grantingRoute({nativeHandleKey: null})});

        expect(result.hasHandle).toBe(false);
        expect(result.granted).toBe(false);
        expect(result).toMatchObject({capable: true, hasTarget: true, ownerMatches: true, present: true, targetMatches: true})
    });

    test('a route naming no target refuses on that axis alone', () => {
        const result = ask({route: grantingRoute({targetWindowId: null}), targetWindowId: null});

        expect(result.hasTarget).toBe(false);
        expect(result.granted).toBe(false);
        expect(result).toMatchObject({capable: true, hasHandle: true, ownerMatches: true, present: true})
    });

    test('an absent route and an unknown window both fail closed, and neither invents an axis', () => {
        const absent  = ask({route: null}),
              unknown = ask({route: null, windowId: 'never-connected'});

        for (const result of [absent, unknown]) {
            expect(result.granted).toBe(false);
            expect(result.route).toBeNull();
            expect(result).toMatchObject({
                capable: false, hasHandle: false, hasTarget: false, ownerMatches: false, present: false, targetMatches: false
            })
        }
    });

    test('a connected window carrying no native route is refused, not treated as unrestricted', () => {
        const windowId = 'routeless-window';

        WindowManager.onWindowConnect({appName: 'DockDemo', windowData: {}, windowId});

        // Distinct from the unknown-window arm above: the entry exists and is merely routeless.
        expect(WindowManager.get(windowId).nativeRoute).toBeNull();

        const result = ask({route: null, windowId});

        expect(result.present).toBe(false);
        expect(result.granted).toBe(false);
        expect(result.route).toBeNull()
    });

    test('a caller that asserts no owner is granted whatever the route owner is, and the result says so', () => {
        const route = grantingRoute({ownerWindowId: 'some-other-window'});

        // Omitting the key is the opt-out; the runtime that dispatches AS the route owner uses it.
        const result = WindowManager.resolveNativeRoute({capability: 'close', route});

        expect(result.granted).toBe(true);
        expect(result.ownerAsserted).toBe(false);
        expect(result.route).toBe(route);
        expect(ask({route}).ownerAsserted).toBe(true)
    });

    test('a route naming no owning main thread is refused even when the caller asserts no owner', () => {
        const result = WindowManager.resolveNativeRoute({
            capability: 'close', route: grantingRoute({ownerWindowId: undefined})
        });

        // Unasserted ownership is not an unaddressable route: there would be no main thread to
        // forward the dispatch to, and the caller would pass that absence straight through.
        expect(result.hasOwner).toBe(false);
        expect(result.granted).toBe(false);
        expect(result.route).toBeNull();
        expect(result).toMatchObject({capable: true, hasHandle: true, hasTarget: true, ownerAsserted: false})
    });

    test('a nullish asserted identity refuses, where an omitted one waives the check', () => {
        const route = grantingRoute();

        for (const missing of [null, undefined]) {
            expect(WindowManager.resolveNativeRoute({capability: 'position', ownerWindowId: missing, route}))
                .toMatchObject({granted: false, ownerAsserted: true, ownerMatches: false});
            expect(WindowManager.resolveNativeRoute({capability: 'position', targetWindowId: missing, route}))
                .toMatchObject({granted: false, targetMatches: false})
        }

        // The same call with both keys absent is the waived-check case, and it grants.
        expect(WindowManager.resolveNativeRoute({capability: 'position', route}).granted).toBe(true)
    });

    test('resolving by windowId requires the entry route to address that same window', () => {
        const route = grantingRoute({targetWindowId: 'popup-window'});

        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: {nativeRoute: route},
            windowId  : 'requested-popup'
        });

        // The entry supplies a route, but it addresses a different window than the one asked about.
        const result = WindowManager.resolveNativeRoute({capability: 'focus', windowId: 'requested-popup'});

        expect(result.present).toBe(true);
        expect(result.targetMatches).toBe(false);
        expect(result.granted).toBe(false);
        expect(result.route).toBeNull()
    });

    test('the route resolves from a connected window entry when the caller passes only a windowId', () => {
        const
            windowId = 'popup-window',
            route    = grantingRoute();

        WindowManager.onWindowConnect({
            appName   : 'DockDemo',
            windowData: {nativeRoute: route},
            windowId
        });

        expect(ask({route: null, windowId}).route).toBe(route)
    })
});
