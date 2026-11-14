import {setup} from '../../setup.mjs';

setup({
    appConfig       : {name: 'NeoGridHorizontalScrollSyncFollowersTest'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ScrollManager  from '../../../../src/grid/ScrollManager.mjs';

/**
 * Unit tests for synchronizing --grid-scroll-left onto follower rows outside grid.body.
 * @see Neo.grid.ScrollManager
 * @see Neo.main.addon.GridHorizontalScrollSync
 * @see https://github.com/neomjs/neo/issues/20966
 */
const
    originalDocument  = globalThis.document,
    originalDomAccess = Neo.main?.DomAccess,
    originalWindow    = globalThis.window,
    documentRef       = new EventTarget(),
    windowRef         = new EventTarget();

documentRef.body           = {};
documentRef.getElementById = () => null;
documentRef.querySelector  = () => null;

test.describe('GridHorizontalScrollSync & ScrollManager follower rows', () => {
    let DomAccess, GridHorizontalScrollSync;

    test.beforeAll(async () => {
        globalThis.document = documentRef;
        globalThis.window   = windowRef;

        delete Neo.main?.DomAccess;

        ({default: DomAccess}              = await import('../../../../src/main/DomAccess.mjs'));
        ({default: GridHorizontalScrollSync} = await import('../../../../src/main/addon/GridHorizontalScrollSync.mjs'));
    });

    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDocument  === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow    === undefined ? delete globalThis.window   : globalThis.window   = originalWindow;
    });

    test.describe('Neo.main.addon.GridHorizontalScrollSync follower sync', () => {
        let addon, elements, originalGetElement;

        const createElement = (id, scrollLeft = 0) => {
            const styles    = {};
            const listeners = {};
            return {
                id,
                scrollLeft,
                scrollWidth: 1000,
                clientWidth: 500,
                style      : {
                    setProperty(name, value) { styles[name] = value; },
                    getPropertyValue(name) { return styles[name] ?? ''; },
                    _styles: styles
                },
                addEventListener(type, fn) {
                    listeners[type] = listeners[type] || [];
                    listeners[type].push(fn);
                },
                removeEventListener(type, fn) {
                    if (listeners[type]) {
                        listeners[type] = listeners[type].filter(l => l !== fn);
                    }
                },
                _listeners: listeners,
                trigger(type, eventObj = {}) {
                    (listeners[type] || []).forEach(fn => fn({target: this, ...eventObj}));
                }
            };
        };

        test.beforeEach(() => {
            originalGetElement = DomAccess.getElement;
            elements = {
                'grid-scroller' : createElement('grid-scroller', 0),
                'grid-body'     : createElement('grid-body', 0),
                'grid-header'   : createElement('grid-header', 0),
                'grid-view'     : createElement('grid-view', 0),
                'follower-row-1': createElement('follower-row-1', 0),
                'follower-row-2': createElement('follower-row-2', 0)
            };

            DomAccess.getElement = id => elements[id] || null;

            addon = Neo.create(GridHorizontalScrollSync);
        });

        test.afterEach(() => {
            DomAccess.getElement = originalGetElement;
            addon.destroy();
            addon = null;
        });

        test('follower elements receive --grid-scroll-left on scroller onScroll', () => {
            addon.register({
                id         : 'test-grid__h_scroll',
                scrollerId : 'grid-scroller',
                bodyId     : 'grid-body',
                headerId   : 'grid-header',
                viewId     : 'grid-view',
                followerIds: ['follower-row-1', 'follower-row-2']
            });

            // Simulate scroller movement to 120px
            elements['grid-scroller'].scrollLeft = 120;
            elements['grid-scroller'].trigger('scroll');

            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('120px');
            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).toBe('120px');
            expect(elements['follower-row-2'].style.getPropertyValue('--grid-scroll-left')).toBe('120px');
        });

        test('registerFollower mid-scroll immediately seeds --grid-scroll-left from current scroller', () => {
            elements['grid-scroller'].scrollLeft = 250;

            addon.register({
                id        : 'test-grid__h_scroll',
                scrollerId: 'grid-scroller',
                bodyId    : 'grid-body',
                headerId  : 'grid-header',
                viewId    : 'grid-view'
            });

            // Follower row mounts after scrollbar has already scrolled
            addon.registerFollower({
                id        : 'test-grid__h_scroll',
                followerId: 'follower-row-1'
            });

            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).toBe('250px');
        });

        test('unregisterFollower stops --grid-scroll-left updates on scroller onScroll', () => {
            addon.register({
                id         : 'test-grid__h_scroll',
                scrollerId : 'grid-scroller',
                bodyId     : 'grid-body',
                headerId   : 'grid-header',
                viewId     : 'grid-view',
                followerIds: ['follower-row-1']
            });

            addon.unregisterFollower({
                id        : 'test-grid__h_scroll',
                followerId: 'follower-row-1'
            });

            elements['grid-scroller'].scrollLeft = 300;
            elements['grid-scroller'].trigger('scroll');

            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('300px');
            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).toBe('0px');
            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).not.toBe('300px');
        });
    });

    test.describe('Neo.grid.ScrollManager follower registration API', () => {
        let manager, addonCalls, originalGetAddon;

        const fakeAddon = {
            register(payload)           { addonCalls.push({method: 'register', payload}); },
            registerFollower(payload)   { addonCalls.push({method: 'registerFollower', payload}); },
            unregister(payload)         { addonCalls.push({method: 'unregister', payload}); },
            unregisterFollower(payload) { addonCalls.push({method: 'unregisterFollower', payload}); }
        };

        test.beforeEach(() => {
            addonCalls = [];
            originalGetAddon = Neo.currentWorker.getAddon;
            Neo.currentWorker.getAddon = async (name, windowId) => {
                addonCalls.push({method: 'getAddon', name, windowId});
                return fakeAddon;
            };

            const gridContainer = {
                body               : {id: 'g-body', isScrolling: false},
                bodyEnd            : null,
                bodyStart          : null,
                headerToolbar      : {id: 'g-header'},
                horizontalScrollbar: {id: 'g-scroller'},
                view               : {id: 'g-view'},
                getGroupHeaderPartId(part) { return null; }
            };

            const gridBody = {
                addCls() {},
                removeCls() {}
            };

            manager = Neo.create(ScrollManager, {
                gridBody,
                gridContainer,
                windowId: 'win-1'
            });
        });

        test.afterEach(() => {
            manager.destroy();
            manager = null;
            Neo.currentWorker.getAddon = originalGetAddon;
        });

        test('ScrollManager exposes follower registration and sends followerIds in register', async () => {
            expect(typeof manager.registerHorizontalScrollFollower).toBe('function');
            expect(typeof manager.unregisterHorizontalScrollFollower).toBe('function');

            await manager.registerHorizontalScrollFollower('summary-row-id');
            expect(manager.horizontalScrollFollowerIds.has('summary-row-id')).toBe(true);

            // Mount manager to register addon
            manager.mounted = true;
            await manager.timeout(0);

            const regCall = addonCalls.find(c => c.method === 'register' && c.payload.id?.endsWith('__h_scroll'));
            expect(regCall).toBeDefined();
            expect(regCall.payload.followerIds).toContain('summary-row-id');

            // Unregister follower
            await manager.unregisterHorizontalScrollFollower('summary-row-id');
            expect(manager.horizontalScrollFollowerIds.has('summary-row-id')).toBe(false);

            const unregFollowerCall = addonCalls.find(c => c.method === 'unregisterFollower');
            expect(unregFollowerCall).toBeDefined();
            expect(unregFollowerCall.payload.followerId).toBe('summary-row-id');
        });
    });
});
