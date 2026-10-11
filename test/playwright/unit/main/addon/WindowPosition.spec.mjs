import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WindowPositionTest'
    },
    neoConfig: {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import WindowPosition from '../../../../../src/main/addon/WindowPosition.mjs';

/**
 * @summary Geometry-publication witnesses for movement and fixed-origin resize.
 *
 * The App Worker owns the live window map consumed by cross-window conversion. A resize that does
 * not move the OS frame must therefore publish the same complete snapshot as a movement; otherwise
 * the next conversion frame combines a current pointer with stale target extents.
 */
test.describe('Neo.main.addon.WindowPosition — live geometry publication', () => {
    let originalGetWindowData,
        originalSendMessage,
        originalWindowId,
        originalWindow,
        sent;

    test.beforeEach(() => {
        sent                  = [];
        originalGetWindowData = Neo.Main.getWindowData;
        originalSendMessage   = Neo.worker.Manager.sendMessage;
        originalWindowId      = Neo.worker.Manager.windowId;
        originalWindow        = globalThis.window;

        globalThis.window = {
            outerHeight: 740,
            outerWidth : 1016,
            screenLeft : 120,
            screenTop  : 80
        };

        Neo.Main.getWindowData = () => ({
            innerHeight: 700,
            innerWidth : 1000,
            outerHeight: 740,
            outerWidth : 1016,
            screenLeft : 120,
            screenTop  : 80
        });
        Neo.worker.Manager.windowId    = 'popup-a';
        Neo.worker.Manager.sendMessage = (dest, message) => sent.push([dest, message])
    });

    test.afterEach(() => {
        Neo.Main.getWindowData          = originalGetWindowData;
        Neo.worker.Manager.sendMessage = originalSendMessage;
        Neo.worker.Manager.windowId    = originalWindowId;

        originalWindow === undefined ? delete globalThis.window : globalThis.window = originalWindow
    });

    test('a fixed-origin resize publishes the complete window snapshot', () => {
        // A resize is also the only event that can invalidate the measured viewport offset, so the
        // double records the re-arm rather than pretending the collaborator is absent.
        const rearmed = [],
              addon   = {
                  adjustWindowPositions: false,
                  armViewportProbe     : () => rearmed.push(true),
                  publishGeometry      : WindowPosition.prototype.publishGeometry,
                  windows              : {}
              };

        WindowPosition.prototype.onResize.call(addon, {});

        expect(rearmed, 'a resize re-measures where the viewport starts inside the frame').toEqual([true]);

        expect(sent).toEqual([['app', {
            action: 'windowPositionChange',
            data  : {
                appName    : Neo.worker.Manager.appName,
                innerHeight: 700,
                innerWidth : 1000,
                outerHeight: 740,
                outerWidth : 1016,
                screenLeft : 120,
                screenTop  : 80,
                windowId   : 'popup-a'
            }
        }]])
    });

    test('a tagged native publication advances the poll baseline without losing the next independent move', () => {
        let nativeEffect = {transactionId: 'transaction-1', effectId: 'effect-1'};
        Neo.Main.getWindowData = () => ({screenLeft: window.screenLeft, screenTop: window.screenTop, nativeEffect});
        const addon = {
            adjustWindowPositions: false,
            publishGeometry      : WindowPosition.prototype.publishGeometry,
            screenLeft           : window.screenLeft - 20,
            screenTop            : window.screenTop,
            set(config) { Object.assign(this, config) }
        };
        addon.publishGeometry();
        nativeEffect = null;
        WindowPosition.prototype.checkMovement.call(addon);
        expect(sent).toHaveLength(1);
        window.screenLeft++;
        WindowPosition.prototype.checkMovement.call(addon);
        expect(sent).toHaveLength(2);
        expect(sent[1][1].data.nativeEffect).toBeNull()
    });

    test('movement remains change-driven and shares the same publication authority', () => {
        const addon = {
            adjustWindowPositions: false,
            publishGeometry      : WindowPosition.prototype.publishGeometry,
            screenLeft           : window.screenLeft,
            screenTop            : window.screenTop
        };

        WindowPosition.prototype.checkMovement.call(addon);
        expect(sent).toEqual([]);

        addon.screenLeft = window.screenLeft - 1;
        WindowPosition.prototype.checkMovement.call(addon);

        expect(sent).toHaveLength(1);
        expect(addon.screenLeft).toBe(window.screenLeft);
        expect(addon.screenTop).toBe(window.screenTop)
    });

    /**
     * A pointer that leaves page content arms the poll and a pointer moving between elements clears
     * it. That is the whole trigger contract without `observeMovement`, and it is why a titlebar
     * grabbed from outside the content never publishes.
     */
    test('pointer-owned polling arms on a document-leaving mouseout and clears on element travel', () => {
        const addon = {
            checkMovement  : () => {},
            intervalId     : null,
            intervalTime   : 20,
            observeMovement: false,
            startPolling   : WindowPosition.prototype.startPolling,
            stopPolling    : WindowPosition.prototype.stopPolling
        };

        WindowPosition.prototype.onMouseOut.call(addon, {toElement: {}});
        expect(addon.intervalId, 'element travel never arms').toBeNull();

        WindowPosition.prototype.onMouseOut.call(addon, {toElement: null});
        expect(addon.intervalId, 'leaving the document arms').toBeTruthy();

        WindowPosition.prototype.onMouseOut.call(addon, {toElement: {}});
        expect(addon.intervalId, 'element travel clears').toBeNull()
    });

    test('observeMovement owns the poll: armed without any pointer event, immune to element travel', () => {
        let published = 0;

        const addon = {
            checkMovement  : () => {},
            intervalId     : null,
            intervalTime   : 20,
            observeMovement: true,
            publishGeometry: () => published++,
            startPolling   : WindowPosition.prototype.startPolling,
            stopPolling    : WindowPosition.prototype.stopPolling
        };

        WindowPosition.prototype.afterSetObserveMovement.call(addon, true, false);

        const armedId = addon.intervalId;

        expect(armedId, 'the config arms the poll with no mouseout at all').toBeTruthy();
        // The poll is change-driven against the origin captured at construction, so arming
        // publishes the current snapshot once — a window that never moves is still known.
        expect(published, 'arming opens the stream with its current value').toBe(1);

        WindowPosition.prototype.onMouseOut.call(addon, {toElement: {}});
        expect(addon.intervalId, 'element travel cannot clear a config-owned poll').toBe(armedId);

        WindowPosition.prototype.onMouseOut.call(addon, {toElement: null});
        expect(addon.intervalId, 'a document-leaving mouseout does not re-arm a second interval').toBe(armedId);
        expect(published, 'pointer travel publishes nothing by itself').toBe(1);

        addon.observeMovement = false;
        WindowPosition.prototype.afterSetObserveMovement.call(addon, false, true);
        expect(addon.intervalId, 'switching off releases the poll').toBeNull();
        expect(published, 'switching off publishes nothing').toBe(1)
    });

    /**
     * The two witnesses above call the hook directly, so they cannot see whether the config is wired
     * to it. Reactivity rides on the trailing underscore alone: without it `afterSetObserveMovement`
     * never fires and the poll is silently never armed by config — the same silent non-arming this
     * feature exists to end, one layer up. The class-level accessor is the witness that survives the
     * mock's missing `addEventListener`, and the non-reactive sibling is the control that proves the
     * assertion discriminates.
     */
    test('observeMovement is wired as a reactive config on the class, not a plain field', () => {
        const
            reactive = Object.getOwnPropertyDescriptor(WindowPosition.prototype, 'observeMovement'),
            plain    = Object.getOwnPropertyDescriptor(WindowPosition.prototype, 'intervalTime');

        expect(typeof reactive?.set, 'observeMovement_ installs a prototype setter').toBe('function');
        expect(typeof reactive?.get, 'observeMovement_ installs a prototype getter').toBe('function');
        expect(typeof plain?.set, 'the non-reactive intervalTime config installs no setter (control)').not.toBe('function')
    });

    test('remote routing metadata is stripped before configs reach the addon', () => {
        let configs;
        const data  = {appName: 'WindowPositionTest', observeResize: true, windowId: 'popup-a'};
        const addon = {set: value => configs = {...value}};

        WindowPosition.prototype.setConfigs.call(addon, data);

        expect(configs).toEqual({observeResize: true});
        expect(data).toEqual({observeResize: true})
    })
});

/**
 * @summary The viewport-origin probe: one pointer sample, taken because the numbers cannot be
 * inferred.
 *
 * `outerWidth - innerWidth` says how much width the viewport lost and never to which edge, so a
 * devtools panel docked left and one docked right are byte-identical to
 * {@link Neo.manager.Window#calculateGeometry}. `event.screenX - event.clientX` is the viewport's
 * screen-space left edge as the browser states it, and carries the side for free.
 */
test.describe('Neo.main.addon.WindowPosition — the viewport-origin probe', () => {
    let addon, listeners, originalWindow;

    /** @returns {Object} A window double that records listener traffic and owns a frame origin. */
    const makeWindow = () => ({
        addEventListener   : (type, fn, opts) => listeners.push({fn, opts, type}),
        removeEventListener: (type, fn) => {
            const index = listeners.findIndex(entry => entry.fn === fn && entry.type === type);
            index > -1 && listeners.splice(index, 1)
        },
        screenLeft: 100,
        screenTop : 50
    });

    /**
     * Dispatches to the outstanding pointer listener the way a browser does: a `once` listener is
     * removed BEFORE it is invoked. Modelling that is the point — the probe relies on `once` for
     * its removal and nulls its own handle, so a double that kept the entry could not witness the
     * one-shot contract at all.
     * @param {Object} event
     */
    const firePointer = event => {
        const index = listeners.findIndex(entry => entry.type === 'pointermove'),
              entry = listeners[index];

        entry.opts?.once && listeners.splice(index, 1);
        entry.fn(event)
    };

    test.beforeEach(() => {
        listeners      = [];
        originalWindow = globalThis.window;
        globalThis.window = makeWindow();

        addon = {
            armViewportProbe: WindowPosition.prototype.armViewportProbe,
            published       : 0,
            publishGeometry() { this.published++ },
            viewportProbe   : null
        }
    });

    test.afterEach(() => {
        originalWindow === undefined ? delete globalThis.window : globalThis.window = originalWindow
    });

    test('one sample measures the offset from the frame, publishes it, and does not stay attached', () => {
        addon.armViewportProbe();

        expect(listeners).toHaveLength(1);
        expect(listeners[0].type).toBe('pointermove');
        // `once` is what makes this a sample rather than a subscription; `passive` keeps it off the
        // scroll-blocking path of a gesture that is already moving a window.
        expect(listeners[0].opts).toEqual({capture: true, once: true, passive: true});

        // A pointer at client (40, 20) sitting at screen (140, 187) on a frame whose origin is
        // (100, 50): the viewport starts 0 px in from the frame's left and 117 px below its top.
        firePointer({clientX: 40, clientY: 20, screenX: 140, screenY: 187});

        expect(globalThis.window.neoViewportOffset).toEqual({x: 0, y: 117});
        expect(addon.published, 'the correction reaches the worker on the sample, not on the next resize').toBe(1);
        expect(addon.viewportProbe, 'the probe releases itself once it has its answer').toBeNull();
        expect(listeners, 'and the browser removed the one-shot listener').toHaveLength(0)
    });

    test('a panel on the left is measured as a left offset, which is the whole reason to measure', () => {
        addon.armViewportProbe();
        // Same frame, same window size — but the viewport now starts 479 px in from the left.
        firePointer({clientX: 40, clientY: 20, screenX: 619, screenY: 187});

        expect(globalThis.window.neoViewportOffset).toEqual({x: 479, y: 117})
    });

    test('re-arming while a sample is outstanding does not attach a second listener', () => {
        addon.armViewportProbe();
        addon.armViewportProbe();
        addon.armViewportProbe();

        expect(listeners, 'one outstanding sample is enough').toHaveLength(1);

        firePointer({clientX: 0, clientY: 0, screenX: 100, screenY: 137});

        // Only after the sample lands may a new one be armed — that is what a resize does.
        addon.armViewportProbe();
        expect(listeners).toHaveLength(1);
        expect(addon.viewportProbe).not.toBeNull()
    });

    test('a non-finite reading is discarded rather than published', () => {
        addon.armViewportProbe();
        firePointer({clientX: NaN, clientY: 20, screenX: 140, screenY: 187});

        expect(globalThis.window.neoViewportOffset, 'nothing is written').toBeUndefined();
        expect(addon.published, 'and nothing is published').toBe(0);
        expect(addon.viewportProbe, 'the sample is still spent — a bad reading is not a retry loop').toBeNull()
    });

    test('observing arms the probe and UNobserving releases it, so no window carries a standing listener', () => {
        const pointerListeners = () => listeners.filter(entry => entry.type === 'pointermove'),
              observed         = {
                  armViewportProbe   : WindowPosition.prototype.armViewportProbe,
                  disarmViewportProbe: WindowPosition.prototype.disarmViewportProbe,
                  onResize           : () => {},
                  resizeListener     : null,
                  viewportProbe      : null
              };

        WindowPosition.prototype.afterSetObserveResize.call(observed, true, false);
        expect(pointerListeners(), 'observing takes a sample').toHaveLength(1);

        // The half that matters, and that an assert-on-an-empty-array cannot reach: the outstanding
        // sample must not outlive observation. A probe left attached writes an offset and publishes
        // geometry for a window that stopped observing.
        WindowPosition.prototype.afterSetObserveResize.call(observed, false, true);
        expect(pointerListeners(), 'unobserving releases the outstanding sample').toHaveLength(0);
        expect(observed.viewportProbe).toBeNull()
    });

    test('a sample that confirms the offset we already hold does not publish', () => {
        // A publication is a worker round trip. Publishing on every pointer sample would inject a
        // message into whatever gesture happens to be running — which is not free in a fixture that
        // drives pointer interactions, and is not news either.
        addon.armViewportProbe();
        firePointer({clientX: 40, clientY: 20, screenX: 140, screenY: 187});
        expect(addon.published, 'the first sample is news').toBe(1);

        addon.armViewportProbe();
        firePointer({clientX: 10, clientY: 90, screenX: 110, screenY: 257});
        expect(globalThis.window.neoViewportOffset, 'same offset, read through different coordinates').toEqual({x: 0, y: 117});
        expect(addon.published, 'and confirming it is not').toBe(1);

        addon.armViewportProbe();
        firePointer({clientX: 40, clientY: 20, screenX: 619, screenY: 187});
        expect(addon.published, 'a CHANGED origin is news again').toBe(2)
    })
});
