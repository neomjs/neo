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
 * Unit tests for synchronizing --grid-scroll-left onto follower rows outside grid.body, and for a registration that
 * comes before its nodes or outlives one of them.
 *
 * A mock element's `trigger()` delivers an event in a browser's order: the document's capture listeners, then each
 * node on the path from the target up, then the document's bubble listeners. A `scroll` stops at its target, and
 * `stopPropagation()` stops the rest.
 * @see Neo.grid.ScrollManager
 * @see Neo.main.addon.GridHorizontalScrollSync
 * @see https://github.com/neomjs/neo/issues/20966
 */

/**
 * @summary A document that keeps each listener's phase, so a spec can run the capture and bubble listeners apart.
 */
class PhasedDocument extends EventTarget {
    phased = []

    addEventListener(type, fn, options) {
        this.phased.push({capture: options === true || !!options?.capture, fn, type});
        super.addEventListener(type, fn, options)
    }

    removeEventListener(type, fn, options) {
        const capture = options === true || !!options?.capture;

        this.phased = this.phased.filter(item => !(item.type === type && item.fn === fn && item.capture === capture));
        super.removeEventListener(type, fn, options)
    }

    /**
     * @param {Event}   event
     * @param {Boolean} capture True for the capture listeners, false for the bubble listeners
     */
    fire(event, capture) {
        this.phased.filter(item => item.type === event.type && item.capture === capture).forEach(item => item.fn(event))
    }
}

const
    originalDocument  = globalThis.document,
    originalDomAccess = Neo.main?.DomAccess,
    originalWindow    = globalThis.window,
    documentRef       = new PhasedDocument(),
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
                trigger(type, eventObj = {}, path = [this]) {
                    const event = Object.assign(new Event(type, {bubbles: type !== 'scroll'}), eventObj);
                    let stopped = false;

                    // As a browser reports it: the node the event reached, its path, and whether a node consumed it
                    Object.defineProperties(event, {
                        composedPath   : {value: () => path},
                        stopPropagation: {value: () => {stopped = true}},
                        target         : {value: this}
                    });

                    documentRef.fire(event, true);

                    for (const node of path) {
                        (node._listeners[type] || []).forEach(fn => fn(event));
                        if (stopped || !event.bubbles) return
                    }

                    documentRef.fire(event, false)
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

        test('a registration made before its nodes are in the document syncs once they are', () => {
            const present = {};

            DomAccess.getElement = id => present[id] || null;

            addon.register({
                id         : 'test-grid__h_scroll',
                scrollerId : 'grid-scroller',
                bodyId     : 'grid-body',
                headerId   : 'grid-header',
                viewId     : 'grid-view',
                followerIds: ['follower-row-1']
            });

            // The VDom worker's delta lands after the App worker's registration
            Object.assign(present, elements);

            elements['grid-scroller'].scrollLeft = 120;
            elements['grid-scroller'].trigger('scroll');

            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('120px');
            expect(elements['grid-header'].scrollLeft).toBe(120);
            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).toBe('120px');

            elements['grid-view'].trigger('wheel', {deltaX: 30});
            expect(elements['grid-scroller'].scrollLeft, 'the view\'s wheel moves the scrollbar').toBe(150)
        });

        test('a node replaced after the registration keeps the sync', () => {
            addon.register({
                id        : 'test-grid__h_scroll',
                scrollerId: 'grid-scroller',
                bodyId    : 'grid-body',
                headerId  : 'grid-header',
                viewId    : 'grid-view'
            });

            // A re-render puts a new scrollbar under the same id
            elements['grid-scroller'] = createElement('grid-scroller', 80);
            elements['grid-scroller'].trigger('scroll');

            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('80px')
        });

        test('a wheel a nested control consumes leaves the scrollbar, and one it passes on moves it', () => {
            addon.register({
                id        : 'test-grid__h_scroll',
                scrollerId: 'grid-scroller',
                bodyId    : 'grid-body',
                headerId  : 'grid-header',
                viewId    : 'grid-view'
            });

            const control = createElement('nested-control', 0),
                  path    = [control, elements['grid-view']];

            control.trigger('wheel', {deltaX: 40}, path);
            expect(elements['grid-scroller'].scrollLeft, 'control: a wheel inside the view moves the scrollbar').toBe(40);

            control.addEventListener('wheel', event => event.stopPropagation());
            control.trigger('wheel', {deltaX: 40}, path);
            expect(elements['grid-scroller'].scrollLeft, 'a consumed wheel').toBe(40)
        });

        test('nodes keyed by data-neo-id sync while useDomIds is false', () => {
            const {useDomIds} = Neo.config;

            Neo.config.useDomIds = false;

            try {
                // The ids live in data-neo-id, as the renderer writes them in this mode
                for (const element of Object.values(elements)) {
                    element.dataset = {neoId: element.id};
                    element.id      = ''
                }

                addon.register({
                    id        : 'test-grid__h_scroll',
                    scrollerId: 'grid-scroller',
                    bodyId    : 'grid-body',
                    headerId  : 'grid-header',
                    viewId    : 'grid-view'
                });

                elements['grid-scroller'].scrollLeft = 70;
                elements['grid-scroller'].trigger('scroll');
                expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('70px');
                expect(elements['grid-header'].scrollLeft).toBe(70);

                elements['grid-view'].trigger('wheel', {deltaX: 10});
                expect(elements['grid-scroller'].scrollLeft, 'the view\'s wheel moves the scrollbar').toBe(80)
            } finally {
                Neo.config.useDomIds = useDomIds
            }
        });

        test('unregister ends the sync of its grid, and another grid keeps its own', () => {
            Object.assign(elements, {
                'second-scroller': createElement('second-scroller', 0),
                'second-body'    : createElement('second-body', 0),
                'second-header'  : createElement('second-header', 0),
                'second-view'    : createElement('second-view', 0)
            });

            addon.register({id: 'test-grid__h_scroll',   scrollerId: 'grid-scroller',   bodyId: 'grid-body',   headerId: 'grid-header',   viewId: 'grid-view'});
            addon.register({id: 'second-grid__h_scroll', scrollerId: 'second-scroller', bodyId: 'second-body', headerId: 'second-header', viewId: 'second-view'});

            addon.unregister({id: 'test-grid__h_scroll'});

            elements['grid-scroller'].scrollLeft = 90;
            elements['grid-scroller'].trigger('scroll');
            elements['second-scroller'].scrollLeft = 60;
            elements['second-scroller'].trigger('scroll');

            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left'), 'the unregistered grid keeps its registered position').toBe('0px');
            expect(elements['second-body'].style.getPropertyValue('--grid-scroll-left'), 'the other grid').toBe('60px')
        });

        test('sync re-applies the live scroller scrollLeft without triggering onHeaderScroll rollback (#22245)', () => {
            addon.register({
                id         : 'test-grid__h_scroll',
                scrollerId : 'grid-scroller',
                bodyId     : 'grid-body',
                headerId   : 'grid-header',
                viewId     : 'grid-view',
                followerIds: ['follower-row-1']
            });

            elements['grid-scroller'].scrollLeft = 230;
            elements['grid-scroller'].trigger('scroll');
            expect(elements['grid-header'].scrollLeft).toBe(230);

            // Reflow clamps header to 0 while scroller stays at 230; sync restores 230 cleanly
            elements['grid-header'].scrollLeft = 0;
            addon.sync({id: 'test-grid__h_scroll'});
            elements['grid-header'].trigger('scroll');

            expect(elements['grid-header'].scrollLeft).toBe(230);
            expect(elements['grid-scroller'].scrollLeft).toBe(230);

            // Scroller moved to 0 before late drag-end sync arrives; sync preserves 0
            elements['grid-scroller'].scrollLeft = 0;
            elements['grid-scroller'].trigger('scroll');
            expect(elements['grid-header'].scrollLeft).toBe(0);

            addon.sync({id: 'test-grid__h_scroll'});
            elements['grid-header'].trigger('scroll');

            expect(elements['grid-header'].scrollLeft).toBe(0);
            expect(elements['grid-scroller'].scrollLeft).toBe(0);
            expect(elements['grid-body'].style.getPropertyValue('--grid-scroll-left')).toBe('0px');
            expect(elements['follower-row-1'].style.getPropertyValue('--grid-scroll-left')).toBe('0px');
        });
    });

    test.describe('Neo.grid.ScrollManager follower registration API', () => {
        let manager, addonCalls, originalGetAddon;

        const fakeAddon = {
            register(payload)           { addonCalls.push({method: 'register', payload}); },
            registerFollower(payload)   { addonCalls.push({method: 'registerFollower', payload}); },
            sync(payload)               { addonCalls.push({method: 'sync', payload}); },
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
            if (manager && !manager.isDestroyed) {
                manager.destroy();
            }
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

        test('registerHorizontalScrollFollower while mounted attaches the follower live', async () => {
            manager.mounted = true;
            await manager.timeout(0);

            addonCalls.length = 0;

            await manager.registerHorizontalScrollFollower('summary-row-id');

            expect(manager.horizontalScrollFollowerIds.has('summary-row-id')).toBe(true);

            const regFollowerCall = addonCalls.find(c => c.method === 'registerFollower');
            expect(regFollowerCall).toBeDefined();
            expect(regFollowerCall.payload).toEqual({
                id        : manager.id + '__h_scroll',
                followerId: 'summary-row-id',
                windowId  : 'win-1'
            });
        });

        test('moving windowId while mounted carries followers over to the new window', async () => {
            manager.mounted = true;
            await manager.timeout(0);

            await manager.registerHorizontalScrollFollower('summary-row-id');

            addonCalls.length = 0;

            manager.windowId = 'win-2';
            await manager.timeout(0);

            const unregCall = addonCalls.find(c => c.method === 'unregister' && c.payload.id === manager.id + '__h_scroll');
            expect(unregCall).toBeDefined();
            expect(unregCall.payload.windowId).toBe('win-1');

            const reRegCall = addonCalls.find(c => c.method === 'register' && c.payload.id === manager.id + '__h_scroll');
            expect(reRegCall).toBeDefined();
            expect(reRegCall.payload.windowId).toBe('win-2');
            expect(reRegCall.payload.followerIds).toContain('summary-row-id');

            // The transfer re-registers with the follower set; it never detaches the follower itself
            expect(addonCalls.some(c => c.method === 'unregisterFollower')).toBe(false);
            expect(manager.horizontalScrollFollowerIds.has('summary-row-id')).toBe(true);
        });

        test('unmounting unregisters cleanly while keeping follower ids for remount', async () => {
            manager.mounted = true;
            await manager.timeout(0);

            await manager.registerHorizontalScrollFollower('summary-row-id');

            addonCalls.length = 0;

            manager.mounted = false;
            await manager.timeout(0);

            const unregCall = addonCalls.find(c => c.method === 'unregister' && c.payload.id === manager.id + '__h_scroll');
            expect(unregCall).toBeDefined();
            expect(unregCall.payload.windowId).toBe('win-1');

            // The id set survives the unmount, so a remount re-attaches the follower
            expect(manager.horizontalScrollFollowerIds.has('summary-row-id')).toBe(true);

            manager.mounted = true;
            await manager.timeout(0);

            const reRegCall = addonCalls.filter(c => c.method === 'register' && c.payload.id === manager.id + '__h_scroll').pop();
            expect(reRegCall).toBeDefined();
            expect(reRegCall.payload.followerIds).toContain('summary-row-id');
        });

        test('a manager destroyed mid-registration never dispatches registerFollower', async () => {
            manager.mounted = true;
            await manager.timeout(0);

            addonCalls.length = 0;

            let resolvers = [];
            Neo.currentWorker.getAddon = (name, windowId) => {
                addonCalls.push({method: 'getAddon', name, windowId});
                return new Promise(resolve => { resolvers.push(() => resolve(fakeAddon)); });
            };

            // The addon lookup suspends; destruction lands before it resolves
            const pending = manager.registerHorizontalScrollFollower('summary-row-id');
            manager.destroy();

            resolvers.forEach(r => r());
            await pending;

            expect(addonCalls.some(c => c.method === 'registerFollower')).toBe(false);
        });

        test('syncHorizontalScroll dispatches GridHorizontalScrollSync.sync when mounted and skips when unmounted or destroyed (#22245)', async () => {
            await manager.syncHorizontalScroll();
            expect(addonCalls.some(c => c.method === 'sync'), 'unmounted manager skips sync').toBe(false);

            manager.mounted = true;
            await manager.timeout(0);
            addonCalls.length = 0;

            await manager.syncHorizontalScroll();
            expect(addonCalls.filter(c => c.method === 'sync')).toEqual([{
                method : 'sync',
                payload: {id: manager.id + '__h_scroll', windowId: 'win-1'}
            }]);

            addonCalls.length = 0;
            const resolvers = [];
            Neo.currentWorker.getAddon = () => new Promise(resolve => {resolvers.push(() => resolve(fakeAddon))});
            const pending = manager.syncHorizontalScroll();
            manager.destroy();
            resolvers.forEach(r => r());
            await pending;

            expect(addonCalls.some(c => c.method === 'sync'), 'destroyed mid-await skips sync').toBe(false);
        });
    });
});
