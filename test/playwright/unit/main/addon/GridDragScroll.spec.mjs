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

    for (const [motion, endY] of [['stationary', 300], ['moving', 260]]) {
        test(`a ${motion} touch release with same-millisecond samples keeps the scroll position and schedules no frame`, () => {
            const registration = fakeRegistration('grid-1'),
                  time         = Date.now();

            addon.startDrag({id: registration.id, registration}, 100, 300, 'touch');
            addon.activeDrag.history = [{time, x: 100, y: 300}, {time, x: 100, y: endY}];
            addon.onDragEnd({type: 'touchend'});

            expect(frames.queue.size).toBe(0);
            expect(addon.activeDrag).toBeNull();
            expect(registration.bodyElement.scrollTop).toBe(500);
            expect(registration.containerElement.scrollLeft).toBe(0)
        })
    }

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

/**
 * A stand-in element: only `classList.contains` is read from the event path.
 * @param {String[]} cls
 * @returns {Object}
 */
const fakeElement = (...cls) => ({classList: {contains: name => cls.includes(name)}});

/**
 * A grid view registration whose `bodyElement` carries the `neo-grid-view` class, as the real view does.
 * @param {String} id
 * @returns {Object}
 */
const viewRegistration = id => ({
    id,
    bodyElement     : {...fakeElement('neo-grid-view'), scrollTop: 0, addEventListener() {}, removeEventListener() {}},
    containerElement: {scrollLeft: 0}
});

/**
 * Delivers one press the way the browser does: the capture listener of every registered view in the path runs, from
 * the outermost inwards, with the same event.
 * @param {Neo.main.addon.GridDragScroll} addon
 * @param {Object[]} path from the target outwards
 */
const press = (addon, path) => {
    const event = {type: 'mousedown', button: 0, clientX: 100, clientY: 100, composedPath: () => path};

    [...path].reverse().forEach(el => {
        for (const reg of addon.registrations.values()) {
            if (reg.bodyElement === el) {
                event.currentTarget = el;
                addon.onDragStart(event)
            }
        }
    })
};

test.describe('Neo.main.addon.GridDragScroll — a grid nested in another grid\'s view', () => {
    let addon, inner, outer, timers;

    test.beforeEach(() => {
        installGlobals();

        addon  = Neo.create(GridDragScroll, {});
        timers = 0;

        // Counts the press timers the addon arms: each one is stored here.
        let timeout = null;

        Object.defineProperty(addon, 'mouseDownTimeout', {
            configurable: true,
            get()      { return timeout },
            set(value) { timers++; timeout = value }
        });

        outer = viewRegistration('outer');
        inner = viewRegistration('inner');

        // The outer grid registers first, as it renders first.
        addon.registrations.set('outer', outer);
        addon.registrations.set('inner', inner)
    });

    test.afterEach(() => {
        addon.monitorDrag && addon.onMonitorEnd({type: 'mouseup'});
        addon.destroy?.()
    });

    /**
     * cell > row > inner view > outer cell > outer row > outer view
     * @param {Object} target
     * @returns {Object[]}
     */
    const innerPath = (target = fakeElement('neo-grid-cell')) => [
        target, fakeElement('neo-grid-row'), inner.bodyElement,
        fakeElement('neo-grid-cell'), fakeElement('neo-grid-row'), outer.bodyElement
    ];

    test('a press on the inner grid\'s rows tracks the inner grid, with one timer', () => {
        press(addon, innerPath());

        expect(addon.monitorDrag?.id, 'the grid pressed is the grid scrolled').toBe('inner');
        expect(timers, 'one press arms one timer').toBe(1)
    });

    test('control: a press on the outer grid\'s rows still tracks the outer grid', () => {
        press(addon, [fakeElement('neo-grid-cell'), fakeElement('neo-grid-row'), outer.bodyElement]);

        expect(addon.monitorDrag?.id).toBe('outer');
        expect(timers).toBe(1)
    });

    test('a click inside the inner grid released within the delay leaves no timer to throw', async () => {
        const errors  = [],
              onError = error => errors.push(error);

        process.on('uncaughtException', onError);

        press(addon, innerPath());
        addon.onMonitorEnd({type: 'mouseup'});

        await new Promise(resolve => setTimeout(resolve, addon.delay + 50));

        process.off('uncaughtException', onError);

        expect(errors).toEqual([]);
        expect(addon.monitorDrag).toBeNull()
    });

    test('a press on the grid body itself, outside any row, still tracks the grid', () => {
        press(addon, [fakeElement('neo-grid-body'), outer.bodyElement]);

        expect(addon.monitorDrag?.id, 'a press the body receives directly drag-scrolls its grid').toBe('outer');
        expect(timers).toBe(1)
    });

    test('a press on a nested grid\'s body tracks the nested grid', () => {
        press(addon, [fakeElement('neo-grid-body'), inner.bodyElement, fakeElement('neo-grid-cell'), fakeElement('neo-grid-row'), outer.bodyElement]);

        expect(addon.monitorDrag?.id).toBe('inner');
        expect(timers).toBe(1)
    });

    test('a press in an input a view hosts outside its rows starts nothing', () => {
        press(addon, [fakeElement(), fakeElement('neo-textfield'), outer.bodyElement]);

        expect(addon.monitorDrag, 'text selection in the input stays native').toBeNull();
        expect(timers).toBe(0)
    });

    test('a press on the rows of a nested grid that is not registered does not scroll the outer grid', () => {
        addon.registrations.delete('inner');

        press(addon, innerPath());

        expect(addon.monitorDrag).toBeNull();
        expect(timers).toBe(0)
    })
});

test.describe('Neo.main.addon.GridDragScroll — touch cancellation and multi-contact interruption', () => {
    let addon, grid, previousHasTouch;

    const touch = (identifier, clientX, clientY) => ({identifier, clientX, clientY});

    const dispatchDoc = (type, init = {}) => {
        const event = Object.assign(new Event(type, {bubbles: true, cancelable: true}), init);
        documentRef.dispatchEvent(event);
        return event
    };

    const startTouchOnGrid = (touches, changedTouches = touches) => {
        const path  = [fakeElement('neo-grid-cell'), fakeElement('neo-grid-row'), grid.bodyElement],
              event = {
                  type         : 'touchstart',
                  touches,
                  changedTouches,
                  currentTarget: grid.bodyElement,
                  composedPath : () => path
              };

        addon.onDragStart(event);
        return event
    };

    test.beforeEach(() => {
        installGlobals();
        frames.queue.clear();
        frames.cancelled.length = 0;

        previousHasTouch          = Neo.config.hasTouchEvents;
        Neo.config.hasTouchEvents = true;

        addon = Neo.create(GridDragScroll, {delay: 50, minDistance: 5});
        grid  = viewRegistration('touch-grid');
        grid.bodyElement.scrollTop = 100;
        addon.registrations.set('touch-grid', grid)
    });

    test.afterEach(() => {
        addon.monitorDrag && addon.onMonitorEnd({type: 'touchcancel', touches: [], changedTouches: []});
        addon.activeDrag  && addon.cancelActiveDrag();
        addon.destroy?.();
        Neo.config.hasTouchEvents = previousHasTouch
    });

    test('touchcancel during monitoring clears the timer and document listeners without arming an outside touch', async () => {
        startTouchOnGrid([touch(13, 120, 200)]);
        expect(addon.monitorDrag?.id).toBe('touch-grid');

        dispatchDoc('touchcancel', {touches: [], changedTouches: [touch(13, 120, 200)]});
        expect(addon.monitorDrag).toBeNull();

        await new Promise(resolve => setTimeout(resolve, 70));

        const outsideMove = dispatchDoc('touchmove', {
            touches       : [touch(31, 120, 140)],
            changedTouches: [touch(31, 120, 140)]
        });

        expect(outsideMove.defaultPrevented).toBe(false);
        expect(addon.activeDrag).toBeNull();
        expect(grid.bodyElement.scrollTop).toBe(100)
    });

    test('touchcancel during an active drag stops tracking without starting momentum and leaves outside moves untouched', async () => {
        startTouchOnGrid([touch(13, 120, 260)]);
        await new Promise(resolve => setTimeout(resolve, 65));

        dispatchDoc('touchmove', {
            touches       : [touch(13, 120, 220)],
            changedTouches: [touch(13, 120, 220)]
        });
        dispatchDoc('touchmove', {
            touches       : [touch(13, 120, 180)],
            changedTouches: [touch(13, 120, 180)]
        });

        expect(addon.activeDrag?.listeners).toBeTruthy();
        expect(grid.bodyElement.scrollTop).toBe(140);

        dispatchDoc('touchcancel', {touches: [], changedTouches: [touch(13, 120, 180)]});

        expect(addon.activeDrag).toBeNull();
        expect(frames.queue.size, 'cancellation never schedules momentum').toBe(0);

        const outsideMove = dispatchDoc('touchmove', {
            touches       : [touch(31, 120, 120)],
            changedTouches: [touch(31, 120, 120)]
        });

        expect(outsideMove.defaultPrevented).toBe(false);
        expect(grid.bodyElement.scrollTop).toBe(140)
    });

    test('a second contact cannot replace bookkeeping, and partial lift releases listeners without flinging or leaking', async () => {
        startTouchOnGrid([touch(13, 120, 260)]);
        await new Promise(resolve => setTimeout(resolve, 65));

        dispatchDoc('touchmove', {
            touches       : [touch(13, 120, 220)],
            changedTouches: [touch(13, 120, 220)]
        });
        const ownerListeners = addon.activeDrag?.listeners;
        expect(ownerListeners).toBeTruthy();
        expect(addon.activeDrag.touchId).toBe(13);

        dispatchDoc('touchmove', {
            touches       : [touch(13, 120, 190)],
            changedTouches: [touch(13, 120, 190)]
        });
        expect(grid.bodyElement.scrollTop).toBe(130);

        // Second contact 27 joins on the grid, waits past arming delay, both move, then 13 lifts while 27 remains down
        startTouchOnGrid([touch(13, 120, 190), touch(27, 240, 260)], [touch(27, 240, 260)]);
        expect(addon.monitorDrag, 'second contact never arms a competing monitor').toBeNull();
        expect(addon.activeDrag?.listeners, 'owning drag bookkeeping is preserved').toBe(ownerListeners);

        await new Promise(resolve => setTimeout(resolve, 65));

        dispatchDoc('touchmove', {
            touches       : [touch(13, 120, 160), touch(27, 240, 220)],
            changedTouches: [touch(13, 120, 160), touch(27, 240, 220)]
        });
        expect(grid.bodyElement.scrollTop, 'owner contact 13 continues driving scroll without jumping to 27').toBe(160);

        // Partial lift: 13 lifts while 27 stays down -> releases listeners without starting momentum
        dispatchDoc('touchend', {
            touches       : [touch(27, 240, 220)],
            changedTouches: [touch(13, 120, 160)]
        });
        expect(addon.activeDrag, 'partial lift clears activeDrag').toBeNull();
        expect(frames.queue.size, 'partial lift starts no momentum while contact 27 stays down').toBe(0);

        expect(() => {
            const remainingMove = dispatchDoc('touchmove', {
                touches       : [touch(27, 240, 180)],
                changedTouches: [touch(27, 240, 180)]
            });
            expect(remainingMove.defaultPrevented).toBe(false);

            dispatchDoc('touchend', {
                touches       : [],
                changedTouches: [touch(27, 240, 180)]
            })
        }).not.toThrow();

        const outsideMove = dispatchDoc('touchmove', {
            touches       : [touch(31, 40, 40)],
            changedTouches: [touch(31, 40, 40)]
        });
        expect(outsideMove.defaultPrevented).toBe(false);
        expect(grid.bodyElement.scrollTop).toBe(160);

        // Fresh one-finger drag and ordinary release still scroll and fling
        startTouchOnGrid([touch(41, 120, 260)]);
        await new Promise(resolve => setTimeout(resolve, 65));

        dispatchDoc('touchmove', {
            touches       : [touch(41, 120, 230)],
            changedTouches: [touch(41, 120, 230)]
        });
        await new Promise(resolve => setTimeout(resolve, 20));
        dispatchDoc('touchmove', {
            touches       : [touch(41, 120, 180)],
            changedTouches: [touch(41, 120, 180)]
        });
        expect(grid.bodyElement.scrollTop).toBe(210);

        dispatchDoc('touchend', {
            touches       : [],
            changedTouches: [touch(41, 120, 180)]
        });

        expect(grid.bodyElement.scrollTop).toBeGreaterThan(210);
        expect(addon.activeDrag?.animation, 'ordinary single-finger release still starts momentum').toBeTruthy();
        pumpFrames();
        expect(addon.activeDrag).toBeNull()
    });

    test('pointercancel and uncancelable compositor touchmove release monitoring and active drag without double-scrolling', async () => {
        // 1. pointercancel during monitoring clears timer and listeners
        startTouchOnGrid([touch(13, 120, 200)]);
        expect(addon.monitorDrag?.id).toBe('touch-grid');

        dispatchDoc('pointercancel', {pointerType: 'touch'});
        expect(addon.monitorDrag).toBeNull();

        await new Promise(resolve => setTimeout(resolve, 70));
        expect(addon.activeDrag).toBeNull();

        // 2. Uncancelable touchmove during monitoring releases monitor so timeout cannot arm a parallel drag
        startTouchOnGrid([touch(14, 120, 200)]);
        expect(addon.monitorDrag?.id).toBe('touch-grid');

        const uncancelableMonitorMove = Object.assign(new Event('touchmove', {bubbles: true, cancelable: false}), {
            touches       : [touch(14, 120, 160)],
            changedTouches: [touch(14, 120, 160)]
        });
        documentRef.dispatchEvent(uncancelableMonitorMove);
        expect(addon.monitorDrag).toBeNull();

        await new Promise(resolve => setTimeout(resolve, 70));
        expect(addon.activeDrag).toBeNull();
        expect(grid.bodyElement.scrollTop).toBe(100);

        // 3. pointercancel during active drag clears activeDrag without momentum
        startTouchOnGrid([touch(15, 120, 260)]);
        await new Promise(resolve => setTimeout(resolve, 65));
        dispatchDoc('touchmove', {
            touches       : [touch(15, 120, 220)],
            changedTouches: [touch(15, 120, 220)]
        });
        dispatchDoc('touchmove', {
            touches       : [touch(15, 120, 180)],
            changedTouches: [touch(15, 120, 180)]
        });
        expect(addon.activeDrag?.listeners).toBeTruthy();
        expect(grid.bodyElement.scrollTop).toBe(140);

        dispatchDoc('pointercancel', {pointerType: 'touch'});
        expect(addon.activeDrag).toBeNull();
        expect(frames.queue.size).toBe(0);

        // 4. Uncancelable touchmove mid-drag releases activeDrag instead of mutating scrollTop alongside native scroll
        startTouchOnGrid([touch(16, 120, 260)]);
        await new Promise(resolve => setTimeout(resolve, 65));
        dispatchDoc('touchmove', {
            touches       : [touch(16, 120, 220)],
            changedTouches: [touch(16, 120, 220)]
        });
        expect(addon.activeDrag?.listeners).toBeTruthy();

        const uncancelableDragMove = Object.assign(new Event('touchmove', {bubbles: true, cancelable: false}), {
            touches       : [touch(16, 120, 170)],
            changedTouches: [touch(16, 120, 170)]
        });
        documentRef.dispatchEvent(uncancelableDragMove);
        expect(addon.activeDrag).toBeNull();
        expect(grid.bodyElement.scrollTop).toBe(140)
    })
});
