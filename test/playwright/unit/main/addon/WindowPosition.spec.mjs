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
        const addon = {
            adjustWindowPositions: false,
            publishGeometry      : WindowPosition.prototype.publishGeometry,
            windows              : {}
        };

        WindowPosition.prototype.onResize.call(addon, {});

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
