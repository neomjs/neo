import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainDragDropTest'
    },
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

// DragDrop imports the eager DomEvents main-thread singleton. Install the two native listener
// surfaces before that dynamic import; unlike a hand-written mock, EventTarget preserves real
// add/remove/dispatch semantics while the tests drive only the addon's own prototype methods.
const originalDocument  = globalThis.document,
      originalDomAccess = Neo.main.DomAccess,
      originalDragDrop  = Neo.main.addon.DragDrop,
      originalWindow    = globalThis.window,
      documentRef       = new EventTarget(),
      windowRef         = new EventTarget();

documentRef.body            = {};
documentRef.documentElement = {};
windowRef.screenX           = 0;
windowRef.screenY           = 0;

globalThis.document = documentRef;
globalThis.window   = windowRef;

Neo.Main ??= {};

delete Neo.main.DomAccess;
delete Neo.main.addon.DragDrop;

const {default: DomEvents} = await import('../../../../../src/main/DomEvents.mjs'),
      {default: DragDrop}  = await import('../../../../../src/main/addon/DragDrop.mjs');

/**
 * @summary Physical pointer-follow lifecycle witnesses for popup park/re-show.
 *
 * Parking pauses only OS-window moves: logical drag frames must keep reaching the App Worker so
 * target claims and out-conversion remain pointer-owned. Park/re-show drain the prior name-based
 * move and then address the exact opener-minted native handle generation. Reset invalidates every
 * late completion, preventing a predecessor gesture from moving a successor's same-name popup.
 */
test.describe('Neo.main.addon.DragDrop — generation-scoped physical window drag', () => {
    let originalMoveTo,
        originalNativeMoveTo,
        originalSend;

    test.beforeEach(() => {
        originalMoveTo       = Neo.Main.windowMoveTo;
        originalNativeMoveTo = Neo.Main.windowNativeMoveTo;
        originalSend         = DomEvents.sendMessageToApp
    });

    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDragDrop  === undefined ? delete Neo.main.addon.DragDrop : Neo.main.addon.DragDrop = originalDragDrop;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test.afterEach(() => {
        Neo.Main.windowMoveTo       = originalMoveTo;
        Neo.Main.windowNativeMoveTo = originalNativeMoveTo;
        DomEvents.sendMessageToApp  = originalSend
    });

    test('a parked physical vessel emits logical drag frames but performs zero pointer-follow moves', () => {
        const moved = [],
              sent  = [],
              addon = {
                  dragCancelled   : false,
                  dragZoneId      : 'zone-a',
                  getEventData    : () => ({clientX: 10, clientY: 20}),
                  isWindowDragging: true,
                  offsetX         : 20,
                  offsetY         : 10,
                  popupHeight     : 240,
                  popupName       : 'tearout-graph',
                  popupWidth      : 320,
                  windowDragParked: true
              };

        Neo.Main.windowMoveTo      = data => moved.push(data);
        DomEvents.sendMessageToApp = data => sent.push(data);

        DragDrop.prototype.onDragMove.call(addon, {
            detail: {originalEvent: {screenX: 500, screenY: 300}}
        });

        expect(moved).toEqual([]);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            dragZoneId: 'zone-a',
            screenX   : 500,
            screenY   : 300,
            type      : 'drag:move'
        })
    });

    test('park pauses immediately, drains prior follow, then moves only the exact native generation', async () => {
        let releasePrior;

        const prior = new Promise(resolve => releasePrior = resolve),
              calls = [],
              addon = {
                  dragCancelled         : false,
                  dragZoneId            : 'zone-a',
                  getEventData          : () => ({}),
                  isWindowDragging      : true,
                  offsetX               : 0,
                  offsetY               : 0,
                  popupHeight           : 240,
                  popupName             : 'tearout-graph',
                  popupWidth            : 320,
                  windowDragGeneration  : 7,
                  windowDragMovePromises: new Set(),
                  windowDragParked      : false
              };

        Neo.Main.windowMoveTo = () => prior;
        DomEvents.sendMessageToApp = () => {};

        DragDrop.prototype.onDragMove.call(addon, {
            detail: {originalEvent: {screenX: 500, screenY: 300}}
        });

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, {
                  nativeHandleKey: 'native-7',
                  targetWindowId : 'popup-7',
                  windowName     : 'tearout-graph',
                  x              : -10000,
                  y              : -10000
              });

        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(data);
            return true
        };

        expect(addon.windowDragParked, 'new pointer frames stop physical follow immediately').toBe(true);
        expect(calls).toEqual([]);

        releasePrior(true);

        await expect(parked).resolves.toBe(true);
        expect(calls).toEqual([{
            nativeHandleKey: 'native-7',
            targetWindowId : 'popup-7',
            x              : -10000,
            y              : -10000
        }])
    });

    test('re-show refusal keeps the exact vessel parked; strict success resumes pointer-follow', async () => {
        let admit = false;

        const calls = [],
              addon = {
                  isWindowDragging    : true,
                  popupName           : 'tearout-graph',
                  windowDragGeneration: 9,
                  windowDragParked    : true
              },
              data = {
                  nativeHandleKey: 'native-9',
                  targetWindowId : 'popup-9',
                  windowName     : 'tearout-graph',
                  x              : 420,
                  y              : 240
              };

        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(request);
            return admit
        };

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, data)).resolves.toBe(false);
        expect(addon.windowDragParked).toBe(true);

        admit = true;

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, data)).resolves.toBe(true);
        expect(addon.windowDragParked).toBe(false);
        expect(calls).toEqual([
            {nativeHandleKey: 'native-9', targetWindowId: 'popup-9', x: 420, y: 240},
            {nativeHandleKey: 'native-9', targetWindowId: 'popup-9', x: 420, y: 240}
        ])
    });

    test('a reset makes the older native completion inert', async () => {
        let resolveMove;

        const move  = new Promise(resolve => resolveMove = resolve),
              addon = {
                  isWindowDragging      : true,
                  popupName             : 'tearout-graph',
                  windowDragGeneration  : 3,
                  windowDragMovePromises: new Set(),
                  windowDragParked      : false
              };

        Neo.Main.windowNativeMoveTo = () => move;

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, {
            nativeHandleKey: 'native-3',
            targetWindowId : 'popup-3',
            windowName     : 'tearout-graph',
            x              : -10000,
            y              : -10000
        });

        DragDrop.prototype.resetDragState.call(addon);
        resolveMove(true);

        await expect(parked).resolves.toBe(false);
        expect(addon.isWindowDragging).toBe(false);
        expect(addon.windowDragParked).toBe(false)
    })
});
