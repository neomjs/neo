import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainGridRowScrollPinningUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * The row scroll addon's handling of content-sized scroll corrections. A height change above the visible rows
 * arrives as `scrollCorrection` in the View's update meta: the addon moves the actual scroll offset by it once
 * the deltas resized the bodies, then pins, so the pin offset (`actual - worker`) keeps its value, and it ignores
 * an acknowledgement older than the last correction. The race arms hold that under the worst order: while
 * pinning is active, a correction and an older acknowledgement arrive in either order, then the thumb is released.
 *
 * DOM nodes are stand-ins: the wrapper holds `scrollTop` and clamps it to its extent as a scroll container does,
 * a body holds the `--grid-row-pin-offset` property.
 */
const
    originalDeltaUpdates = Neo.main.DeltaUpdates,
    originalDocument     = globalThis.document,
    originalDomAccess    = Neo.main.DomAccess,
    originalWindow       = globalThis.window,
    documentRef          = new EventTarget(),
    windowRef            = new EventTarget(),
    viewId               = 'grid-view',
    nodes                = {};

documentRef.body           = {};
documentRef.getElementById = () => null;
documentRef.querySelector  = () => null;

/**
 * @returns {Object} A body stand-in that records its style properties
 */
const createBody = () => ({style: {
    values: {},
    getPropertyValue(name)  {return this.values[name] ?? ''},
    setProperty(name, value) {this.values[name] = value}
}});

/**
 * @param {Number} scrollTop
 * @returns {Object} A wrapper stand-in whose scroll offset stays inside `0…maxScroll`, also when the extent shrinks
 */
const createWrapper = scrollTop => ({
    max: 1e6,
    top: scrollTop,
    get maxScroll()      {return this.max},
    set maxScroll(value) {this.max = value; this.top = Math.min(this.top, value)},
    get scrollTop()      {return this.top},
    set scrollTop(value) {this.top = Math.max(0, Math.min(value, this.max))},
    addEventListener()    {},
    removeEventListener() {}
});

test.describe('Neo.main.addon.GridRowScrollPinning — content-sized scroll corrections', () => {
    let addon, DomAccess, getElement, GridRowScrollPinning, originalApp, scrollbar, thumbDrags, wrapper;

    // Inside the hook, not at the top level: collecting this file must leave the globals of the other files alone
    test.beforeAll(async () => {
        globalThis.document = documentRef;
        globalThis.window   = windowRef;

        Neo.main.DeltaUpdates ??= {on() {}, un() {}};

        // The App worker's remote proxy holds the namespace; the addon imports the real main-thread class
        delete Neo.main.DomAccess;

        ({default: DomAccess}            = await import('../../../../../src/main/DomAccess.mjs'));
        ({default: GridRowScrollPinning} = await import('../../../../../src/main/addon/GridRowScrollPinning.mjs'))
    });

    /**
     * Delivers one update the View rendered, with its meta, as `Neo.main.DeltaUpdates` does: the `update` event,
     * the deltas, the `updated` event
     * @param {Object} viewMeta
     * @param {Function} [applyDeltas] Stands in for the deltas
     */
    const deliver = (viewMeta, applyDeltas) => {
        let data = {deltas: [], meta: {[viewId]: viewMeta}};

        addon.onDeltaUpdate(data);
        applyDeltas?.();
        addon.onDeltaUpdated(data)
    };

    /**
     * @returns {String} The pin offset the bodies carry
     */
    const pinOffset = () => nodes.body.style.getPropertyValue('--grid-row-pin-offset');

    test.beforeEach(() => {
        globalThis.window = windowRef;

        wrapper   = createWrapper(1000);
        scrollbar = {addEventListener() {}, removeEventListener() {}};

        Object.assign(nodes, {body: createBody(), scrollbar, [viewId]: wrapper});

        getElement           = DomAccess.getElement;
        DomAccess.getElement = id => id === 'body' ? nodes.body : id === 'scrollbar' ? scrollbar : nodes[id] ?? null;

        thumbDrags  = [];
        Neo.worker ??= {};
        originalApp = Neo.worker.App;
        Neo.worker.App = {setConfigs: async opts => {thumbDrags.push(opts); return {success: true}}};

        addon = Neo.create(GridRowScrollPinning, {});
        addon.register({bodyIds: ['body'], id: 'grid', verticalScrollbarId: 'scrollbar', viewId});

        // The worker rendered for the current scroll offset
        deliver({scrollEpoch: 0, scrollTop: 1000})
    });

    test.afterEach(() => {
        addon.unregister({id: 'grid'});
        addon.destroy?.();

        DomAccess.getElement = getElement;
        Neo.worker.App       = originalApp
    });

    test.afterAll(() => {
        originalDeltaUpdates === undefined ? delete Neo.main.DeltaUpdates : Neo.main.DeltaUpdates = originalDeltaUpdates;
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDocument  === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow    === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test('a correction moves the scroll offset by the distance the rows moved, and keeps scrolling done meanwhile', () => {
        // The user scrolled 200px further while the worker computed
        wrapper.scrollTop = 1200;

        // Rows above the anchor grew by 80px: the worker renders for 1080
        deliver({scrollCorrection: 80, scrollEpoch: 1, scrollTop: 1080});

        expect(wrapper.scrollTop).toBe(1280)
    });

    test('at the end of the list, a correction past the old end lands once the deltas grew the bodies', () => {
        wrapper.maxScroll = 1000;

        // Rows above the anchor grew by 80px, and so do the bodies
        deliver({scrollCorrection: 80, scrollEpoch: 1, scrollTop: 1080}, () => {wrapper.maxScroll = 1080});

        expect(wrapper.scrollTop).toBe(1080)
    });

    test('at the end of the list, a correction that shrinks the bodies moves the offset once', () => {
        wrapper.maxScroll = 1000;

        // Rows above the anchor shrank by 80px: the smaller extent already clamps the offset by that distance
        deliver({scrollCorrection: -80, scrollEpoch: 1, scrollTop: 920}, () => {wrapper.maxScroll = 920});

        expect(wrapper.scrollTop).toBe(920)
    });

    test('a target left by a batch whose deltas failed does not move the view', () => {
        addon.onDeltaUpdate({deltas: [], meta: {[viewId]: {scrollCorrection: 80, scrollEpoch: 1, scrollTop: 1080}}});

        // The deltas threw, so no `updated` event followed. The next batch carries no correction.
        deliver({scrollEpoch: 1, scrollTop: 1080});

        expect(wrapper.scrollTop).toBe(1000)
    });

    test('unregister detaches the drag listeners from the scrollbar it attached them to', () => {
        let removed = [];

        scrollbar.removeEventListener = (type, listener) => removed.push([type, listener === addon.boundOnMouseDown]);
        addon.unregister({id: 'grid'});

        expect(removed).toEqual([['mousedown', true], ['touchstart', true]]);

        // afterEach unregisters again
        addon.register({bodyIds: ['body'], id: 'grid', verticalScrollbarId: 'scrollbar', viewId})
    });

    test('a thumb drag reaches the view at its start and its end', () => {
        addon.onMouseDown({currentTarget: scrollbar});
        addon.onMouseUp({});

        expect(thumbDrags).toEqual([{id: viewId, isThumbDragging: true}, {id: viewId, isThumbDragging: false}])
    });

    for (const order of ['correction first', 'older acknowledgement first']) {
        test(`pinning converges when a correction and an older acknowledgement arrive ${order}`, () => {
            addon.onMouseDown({currentTarget: scrollbar});

            // The thumb drag moved the offset 300px ahead of the worker: pinning holds the rows in view
            wrapper.scrollTop = 1300;
            addon.onScroll({target: wrapper});
            expect(pinOffset()).toBe('300px');

            let correction = {scrollCorrection: 80, scrollEpoch: 1, scrollTop: 1080},
                older      = {scrollEpoch: 0, scrollTop: 1150};

            if (order === 'correction first') {
                deliver(correction);
                deliver(older)
            } else {
                deliver(older);
                deliver(correction)
            }

            // The rows moved by 80px and so did the offset: no second displacement
            expect(wrapper.scrollTop).toBe(1380);
            expect(pinOffset()).toBe(`${1380 - 1080}px`);

            // Release, and the worker catches up with the offset the drag left: the pin lets go
            addon.onMouseUp({});
            deliver({scrollEpoch: 1, scrollTop: 1380});

            expect(pinOffset()).toBe('0px');
            expect(addon.registrations.get('grid').isPinningActive).toBe(false)
        })
    }

    test('without pinning, a registration still applies corrections and never pins', () => {
        addon.unregister({id: 'grid'});
        addon.register({bodyIds: ['body'], id: 'grid', pin: false, verticalScrollbarId: 'scrollbar', viewId});
        deliver({scrollEpoch: 0, scrollTop: 1000});

        addon.onMouseDown({currentTarget: scrollbar});
        wrapper.scrollTop = 1300;
        addon.onScroll({target: wrapper});

        expect(pinOffset()).not.toBe('300px');

        deliver({scrollCorrection: 40, scrollEpoch: 1, scrollTop: 1040});
        expect(wrapper.scrollTop).toBe(1340);

        addon.onMouseUp({})
    })
});
