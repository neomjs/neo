import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainGridDragScrollUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * The drag-to-scroll addon's kinetic tail, and what a grid that leaves mid-gesture finds. A release
 * with velocity hands the gesture to `autoScroll`, which re-schedules itself per frame and stores
 * its frame handle as `activeDrag`. Before this contract the tail died by simply not re-scheduling,
 * leaving that handle behind for good: every later reader saw a drag that was not there, and
 * `unregister` — which ended a live drag through the mouse-release path — dereferenced listeners
 * the handle never had, so destroying a grid after a flick threw.
 *
 * The addon imports the eager `DomEvents` main-thread singleton (listeners on document and window at
 * construct) and installs its own document `dragstart` listener; `EventTarget` stand-ins keep the
 * add/remove semantics real. Frames are pumped by hand, so a tail runs to its velocity floor in one
 * synchronous call and the test reads the state it leaves.
 */
const
    originalDocument = globalThis.document,
    originalWindow   = globalThis.window,
    originalRaf      = globalThis.requestAnimationFrame,
    originalCaf      = globalThis.cancelAnimationFrame,
    documentRef      = new EventTarget(),
    windowRef        = new EventTarget(),
    frames           = {queue: new Map(), nextId: 1, cancelled: []};

documentRef.body = {
    classList: {add() {}, remove() {}, contains() { return false }},
    style    : {
        cursor: '',
        setProperty(name, value) { name === 'cursor' && (this.cursor = value) },
        removeProperty(name)     { name === 'cursor' && (this.cursor = '') }
    }
};
documentRef.documentElement = {};
windowRef.screenX     = 0;
windowRef.screenY     = 0;
windowRef.innerWidth  = 1024;
windowRef.innerHeight = 768;

const installGlobals = () => {
    globalThis.document              = documentRef;
    globalThis.window                = windowRef;
    globalThis.requestAnimationFrame = callback => {
        const id = frames.nextId++;
        frames.queue.set(id, callback);
        return id
    };
    globalThis.cancelAnimationFrame = id => {
        frames.cancelled.push(id);
        frames.queue.delete(id)
    }
};

installGlobals();

const {default: GridDragScroll} = await import('../../../../../src/main/addon/GridDragScroll.mjs');

/**
 * Runs queued frames until none re-schedule, or the limit trips.
 * @param {Number} limit
 * @returns {Number} frames run
 */
const pumpFrames = (limit = 2000) => {
    let ran = 0;

    while (frames.queue.size && ran < limit) {
        const [id, callback] = frames.queue.entries().next().value;

        frames.queue.delete(id);
        callback(performance.now());
        ran++
    }

    return ran
};

const fakeRegistration = id => ({
    id,
    bodyElement     : {scrollTop: 500, addEventListener() {}, removeEventListener() {}},
    containerElement: {scrollLeft: 0}
});

/**
 * Tracks a mouse drag on the registration and gives it the recent history a release flings on:
 * three points inside the addon's 100 ms velocity window, moving up 80 px.
 * @param {Neo.main.addon.GridDragScroll} addon
 * @param {Object} registration
 */
const trackedDragWithVelocity = (addon, registration) => {
    addon.startDrag({id: registration.id, registration}, 100, 300, 'mouse');

    const now = Date.now();

    addon.activeDrag.history = [
        {time: now - 40, x: 100, y: 300},
        {time: now - 20, x: 100, y: 260},
        {time: now,      x: 100, y: 220}
    ];
    addon.activeDrag.lastY = 220
};

test.describe('Neo.main.addon.GridDragScroll — the kinetic tail and a grid that leaves mid-gesture', () => {
    let addon;

    test.beforeEach(() => {
        // Re-assert the globals: under fully-parallel CI a sibling spec's teardown can replace them
        // between this file's tests.
        installGlobals();
        frames.queue.clear();
        frames.cancelled.length = 0;
        documentRef.body.style.cursor = '';

        addon = Neo.create(GridDragScroll, {})
    });

    test.afterEach(() => {
        addon.destroy?.()
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document              : globalThis.document              = originalDocument;
        originalWindow   === undefined ? delete globalThis.window                : globalThis.window                = originalWindow;
        originalRaf      === undefined ? delete globalThis.requestAnimationFrame : globalThis.requestAnimationFrame = originalRaf;
        originalCaf      === undefined ? delete globalThis.cancelAnimationFrame  : globalThis.cancelAnimationFrame  = originalCaf
    });

    test('a fling clears activeDrag once its velocity dies', () => {
        const registration = fakeRegistration('grid-1'),
              before       = registration.bodyElement.scrollTop;

        addon.registrations.set('grid-1', registration);
        trackedDragWithVelocity(addon, registration);

        addon.onDragEnd({type: 'mouseup'});

        expect(addon.activeDrag?.animation, 'the release hands the gesture to the kinetic tail').toBeTruthy();
        expect(documentRef.body.style.cursor, 'the release restores the cursor').toBe('');

        const ran = pumpFrames();

        expect(ran, 'the tail ran frame by frame to its velocity floor').toBeGreaterThan(10);
        expect(registration.bodyElement.scrollTop, 'the tail scrolled the body').toBeGreaterThan(before);
        expect(addon.activeDrag, 'no drag state survives the tail').toBeNull()
    });

    test('unregister during a kinetic tail neither throws nor leaves state behind', () => {
        const registration = fakeRegistration('grid-1');

        addon.registrations.set('grid-1', registration);
        trackedDragWithVelocity(addon, registration);
        addon.onDragEnd({type: 'mouseup'});

        const pending = addon.activeDrag.animation;

        expect(() => addon.unregister({id: 'grid-1'}), 'a grid may leave in the middle of its tail').not.toThrow();
        expect(frames.cancelled, 'the pending frame is cancelled, not left to scroll a gone grid').toContain(pending);
        expect(addon.activeDrag).toBeNull();
        expect(addon.registrations.has('grid-1')).toBe(false)
    });

    test('control: unregister during a tracked drag restores the cursor and removes the document listeners', () => {
        const registration = fakeRegistration('grid-1'),
              removed      = [];

        // Own-property shadow over the prototype method; deleting it restores the original.
        documentRef.removeEventListener = function(type, listener, options) {
            removed.push(type);
            return EventTarget.prototype.removeEventListener.call(this, type, listener, options)
        };

        addon.registrations.set('grid-1', registration);
        addon.startDrag({id: 'grid-1', registration}, 100, 300, 'mouse');

        expect(documentRef.body.style.cursor, 'a tracked mouse drag grabs the cursor').toBe('grabbing');

        addon.unregister({id: 'grid-1'});
        delete documentRef.removeEventListener;

        expect(documentRef.body.style.cursor, 'the cursor override is gone').toBe('');
        expect(removed, 'both document listeners of the tracked drag are removed').toEqual(expect.arrayContaining(['mousemove', 'mouseup']));
        expect(addon.activeDrag).toBeNull()
    });

    test('a press during a kinetic tail cancels the tail before tracking the new gesture', () => {
        const registration = fakeRegistration('grid-1');

        addon.registrations.set('grid-1', registration);
        trackedDragWithVelocity(addon, registration);
        addon.onDragEnd({type: 'mouseup'});

        const pending = addon.activeDrag.animation;

        addon.startDrag({id: 'grid-1', registration}, 80, 80, 'mouse');

        expect(frames.cancelled, 'the tail\'s frame is cancelled by the new press').toContain(pending);
        expect(addon.activeDrag.listeners, 'the new gesture is a tracked drag').toBeTruthy();
        expect(addon.activeDrag.history, 'with a fresh history').toHaveLength(1)
    })
});
