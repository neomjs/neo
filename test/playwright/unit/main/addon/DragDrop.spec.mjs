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
      {default: Resize}    = await import('../../../../../src/main/draggable/Resize.mjs'),
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
        originalNativeGetGeometry,
        originalNativeMoveTo,
        originalNativeResizeTo,
        originalSend;

    test.beforeEach(() => {
        originalMoveTo            = Neo.Main.windowMoveTo;
        originalNativeGetGeometry = Neo.Main.windowNativeGetGeometry;
        originalNativeMoveTo      = Neo.Main.windowNativeMoveTo;
        originalNativeResizeTo    = Neo.Main.windowNativeResizeTo;
        originalSend              = DomEvents.sendMessageToApp;

        Neo.Main.windowNativeGetGeometry = async ({nativeHandleKey}) => {
            if (nativeHandleKey === 'native-11') {
                return {height: 560, width: 760, x: 1155, y: 215}
            }

            if (nativeHandleKey === 'native-25-b') {
                return {height: 300, width: 400, x: 80, y: 100}
            }

            if (['native-12', 'native-15', 'native-23', 'native-121', 'native-122']
                .includes(nativeHandleKey)) {
                return {height: 546, width: 640, x: 40, y: 60}
            }

            return {height: 300, width: 400, x: 40, y: 60}
        }
    });

    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDragDrop  === undefined ? delete Neo.main.addon.DragDrop : Neo.main.addon.DragDrop = originalDragDrop;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test.afterEach(() => {
        Neo.Main.windowMoveTo            = originalMoveTo;
        Neo.Main.windowNativeGetGeometry = originalNativeGetGeometry;
        Neo.Main.windowNativeMoveTo      = originalNativeMoveTo;
        Neo.Main.windowNativeResizeTo    = originalNativeResizeTo;
        DomEvents.sendMessageToApp       = originalSend
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

    test('a clamped best-effort pre-position anchors resize before the final exact cover move', async () => {
        let
            physicalWidth = 760,
            physicalX     = 1155;

        const
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 11,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            route = {
                nativeHandleKey: 'native-11',
                targetWindowId : 'popup-11'
            };

        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);

            // A resize-first implementation can re-home this boundary-straddling frame. The
            // best-effort pre-position must have established Chrome's same-display safe anchor.
            physicalX === 1155 && (physicalX = 1728);
            physicalWidth = data.width;

            return true
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);

            // Chrome cannot place the still-wide frame at x=1040 on a 1728px display. It clamps
            // to x=968 and returns false; once resized, that same exact target becomes reachable.
            if (physicalWidth === 760 && data.x === 1040) {
                physicalX = 968;
                return false
            }

            if (physicalX === 1728 && data.x === 1040) return false;

            physicalX = data.x;

            return true
        };

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, {
            ...route,
            parkSize   : {height: 300, width: 360},
            restoreRect: {height: 560, width: 760, x: 1155, y: 215},
            windowName : 'tearout-graph',
            x          : 1040,
            y          : 215
        })).resolves.toBe(true);

        expect(calls).toEqual([
            ['move',   {...route, x: 1040, y: 215}],
            ['resize', {...route, height: 300, width: 360}],
            ['move',   {...route, x: 1040, y: 215}]
        ]);
        expect(physicalX).toBe(1040);
        expect(addon.windowDragParked).toBe(true);
        expect(addon.windowDragParkedGeometry).toEqual({
            park   : {height: 300, width: 360, x: 1040, y: 215},
            resize : true,
            restore: {height: 560, width: 760, x: 1155, y: 215}
        })
    });

    test('park samples the exact route origin after draining pointer-follow', async () => {
        let releasePrior;

        const
            prior = new Promise(resolve => releasePrior = resolve),
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 111,
                windowDragMovePromises  : new Set([prior]),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            route = {
                nativeHandleKey: 'native-111',
                targetWindowId : 'popup-111'
            };

        Neo.Main.windowNativeGetGeometry = async data => {
            calls.push(['geometry', data]);
            return {height: 560, width: 760, x: 1728, y: 215}
        };
        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);
            return true
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);
            return data.x === 1728
        };

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, {
            ...route,
            parkSize   : {height: 300, width: 360},
            // This Worker snapshot predates the pending physical move and must never win recovery.
            restoreRect: {height: 560, width: 760, x: 1355, y: 215},
            windowName : 'tearout-graph',
            x          : 1240,
            y          : 215
        });

        expect(calls).toEqual([]);

        releasePrior(true);

        await expect(parked).resolves.toBe(false);
        expect(calls).toEqual([
            ['geometry', route],
            ['move',   {...route, x: 1240, y: 215}],
            ['resize', {...route, height: 300, width: 360}],
            ['move',   {...route, x: 1240, y: 215}],
            ['resize', {...route, height: 560, width: 760}],
            ['move',   {...route, x: 1728, y: 215}]
        ]);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull();
        expect(addon.windowDragParkRecovery).toBeNull()
    });

    test('park resize refusal restores the original full rect before releasing physical follow', async () => {
        let resizeCall = 0;

        const
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 12,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            route = {
                nativeHandleKey: 'native-12',
                targetWindowId : 'popup-12'
            };

        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);
            return ++resizeCall > 1
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);
            return true
        };

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, {
            ...route,
            parkSize   : {height: 260, width: 360},
            restoreRect: {height: 546, width: 640, x: 40, y: 60},
            windowName : 'tearout-graph',
            x          : 800,
            y          : 120
        })).resolves.toBe(false);

        expect(calls).toEqual([
            ['move',   {...route, x: 800, y: 120}],
            ['resize', {...route, height: 260, width: 360}],
            ['resize', {...route, height: 546, width: 640}],
            ['move',   {...route, x: 40, y: 60}]
        ]);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull();
        expect(addon.windowDragParkRecovery).toBeNull()
    });

    test('double resize-compensation refusal retains a same-generation recovery path', async () => {
        let resizeCall = 0;

        const
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 121,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null,
                windowDragParkRecovery  : null
            },
            data = {
                nativeHandleKey: 'native-121',
                parkSize       : {height: 260, width: 360},
                restoreRect    : {height: 546, width: 640, x: 40, y: 60},
                targetWindowId : 'popup-121',
                windowName     : 'tearout-graph',
                x              : 800,
                y              : 120
            };

        Neo.Main.windowNativeResizeTo = async request => {
            calls.push(['resize', request]);
            return ++resizeCall > 2
        };
        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(['move', request]);
            return true
        };

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, data)).resolves.toBe(false);
        expect(addon.windowDragParked).toBe(true);
        expect(addon.windowDragParkRecovery).toMatchObject({
            generation: 121,
            restore   : {height: 546, width: 640, x: 40, y: 60}
        });

        // The next proposal first completes exact recovery and intentionally does not combine
        // that restoration with a fresh park in the same platform-effect turn.
        await expect(DragDrop.prototype.parkWindowDrag.call(addon, data)).resolves.toBe(false);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkRecovery).toBeNull();
        expect(calls).toEqual([
            ['move', {
                nativeHandleKey: 'native-121', targetWindowId: 'popup-121', x: 800, y: 120
            }],
            ['resize', {
                nativeHandleKey: 'native-121', targetWindowId: 'popup-121', height: 260, width: 360
            }],
            ['resize', {
                nativeHandleKey: 'native-121', targetWindowId: 'popup-121', height: 546, width: 640
            }],
            ['resize', {
                nativeHandleKey: 'native-121', targetWindowId: 'popup-121', height: 546, width: 640
            }],
            ['move', {
                nativeHandleKey: 'native-121', targetWindowId: 'popup-121', x: 40, y: 60
            }]
        ])
    });

    test('failed park move and double compensation stay retryable instead of wedging parked state', async () => {
        let
            moveCall   = 0,
            resizeCall = 0;

        const
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 122,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null,
                windowDragParkRecovery  : null
            },
            data = {
                nativeHandleKey: 'native-122',
                parkSize       : {height: 260, width: 360},
                restoreRect    : {height: 546, width: 640, x: 40, y: 60},
                targetWindowId : 'popup-122',
                windowName     : 'tearout-graph',
                x              : 800,
                y              : 120
            };

        Neo.Main.windowNativeResizeTo = async () => ++resizeCall !== 2;
        Neo.Main.windowNativeMoveTo   = async () => ++moveCall !== 2;

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, data)).resolves.toBe(false);
        expect(addon.windowDragParked).toBe(true);
        expect(addon.windowDragParkRecovery).toMatchObject({
            generation: 122,
            restore   : {height: 546, width: 640, x: 40, y: 60}
        });

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, data)).resolves.toBe(false);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull();
        expect(addon.windowDragParkRecovery).toBeNull()
    });

    test('re-show restores exact extent before pointer position and clears park only after both succeed', async () => {
        const
            calls    = [],
            geometry = {
                park   : {height: 260, width: 360, x: 800, y: 120},
                resize : true,
                restore: {height: 546, width: 640, x: 40, y: 60}
            },
            addon    = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 13,
                windowDragParked        : true,
                windowDragParkedGeometry: geometry
            },
            route = {
                nativeHandleKey: 'native-13',
                targetWindowId : 'popup-13'
            };

        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);
            return true
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);
            return true
        };

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, {
            ...route,
            windowName: 'tearout-graph',
            x         : 420,
            y         : 240
        })).resolves.toBe(true);

        expect(calls).toEqual([
            ['resize', {...route, height: 546, width: 640}],
            ['move',   {...route, x: 420, y: 240}]
        ]);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull()
    });

    test('a display-edge clamp rebases the held pointer before physical follow resumes', async () => {
        const
            geometry = {
                park   : {height: 260, width: 360, x: 1040, y: 215},
                resize : true,
                restore: {height: 560, width: 760, x: 1155, y: 223}
            },
            addon    = {
                isWindowDragging        : true,
                offsetX                 : 36,
                offsetY                 : 24,
                popupName               : 'tearout-audit',
                windowDragGeneration    : 131,
                windowDragParked        : true,
                windowDragParkedGeometry: geometry
            },
            route = {
                nativeHandleKey: 'native-131',
                targetWindowId : 'popup-131'
            };

        Neo.Main.windowNativeGetGeometry = async () => ({
            height: 560,
            width : 760,
            x     : 968,
            y     : 316
        });
        Neo.Main.windowNativeMoveTo   = async () => false;
        Neo.Main.windowNativeResizeTo = async () => true;

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, {
            ...route,
            windowName: 'tearout-audit',
            x         : 1195,
            y         : 316
        })).resolves.toBe(true);

        expect(addon.offsetX).toBe(263);
        expect(addon.offsetY).toBe(24);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull()
    });

    test('re-show move refusal shrinks and returns to cover geometry without resuming follow', async () => {
        let moveCall = 0;

        const
            calls    = [],
            geometry = {
                park   : {height: 260, width: 360, x: 800, y: 120},
                resize : true,
                restore: {height: 546, width: 640, x: 40, y: 60}
            },
            addon    = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 14,
                windowDragParked        : true,
                windowDragParkedGeometry: geometry
            },
            route = {
                nativeHandleKey: 'native-14',
                targetWindowId : 'popup-14'
            };

        Neo.Main.windowNativeResizeTo = async data => {
            calls.push(['resize', data]);
            return true
        };
        Neo.Main.windowNativeMoveTo = async data => {
            calls.push(['move', data]);
            return ++moveCall > 1
        };

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, {
            ...route,
            windowName: 'tearout-graph',
            x         : 420,
            y         : 240
        })).resolves.toBe(false);

        expect(calls).toEqual([
            ['resize', {...route, height: 546, width: 640}],
            ['move',   {...route, x: 420, y: 240}],
            ['resize', {...route, height: 260, width: 360}],
            ['move',   {...route, x: 800, y: 120}]
        ]);
        expect(addon.windowDragParked).toBe(true);
        expect(addon.windowDragParkedGeometry).toBe(geometry)
    });

    test('a reset during the initial drain invalidates park before any native effect', async () => {
        let resolveResize;

        const
            resize = new Promise(resolve => resolveResize = resolve),
            moves  = [],
            addon  = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 15,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            };

        Neo.Main.windowNativeResizeTo = () => resize;
        Neo.Main.windowNativeMoveTo   = data => {
            moves.push(data);
            return true
        };

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, {
            nativeHandleKey: 'native-15',
            parkSize       : {height: 260, width: 360},
            restoreRect    : {height: 546, width: 640, x: 40, y: 60},
            targetWindowId : 'popup-15',
            windowName     : 'tearout-graph',
            x              : 800,
            y              : 120
        });

        DragDrop.prototype.resetDragState.call(addon);
        resolveResize(true);

        await expect(parked).resolves.toBe(false);
        expect(moves).toEqual([]);
        expect(addon.windowDragParked).toBe(false);
        expect(addon.windowDragParkedGeometry).toBeNull()
    });

    test('a reset completes safely when no document exists at all', () => {
        // Deterministic pin for the full-suite ordering failure: resetDragState must no-op its
        // class-list side effect when globalThis.document is entirely ABSENT — a bare
        // `document` root reference throws ReferenceError before any optional chain engages.
        const addon         = {},
              savedDocument = globalThis.document,
              hadDocument   = 'document' in globalThis;

        try {
            delete globalThis.document;

            DragDrop.prototype.resetDragState.call(addon)
        } finally {
            hadDocument ? globalThis.document = savedDocument : delete globalThis.document
        }

        // The between-gestures baseline is applied unchanged: the document guard protects only
        // the side effect, never the state-reset semantics.
        expect(addon.dragCancelled).toBe(false);
        expect(addon.dragZoneId).toBe(null);
        expect(addon.windowDragGeneration).toBe(1);
        expect(addon.windowDragMovePromises).toBeInstanceOf(Set)
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

    test('reset and successor start both promote a position-only in-flight route before clearing it', async () => {
        for (const invalidation of ['reset', 'start']) {
            let resolveMove;

            const
                move  = new Promise(resolve => resolveMove = resolve),
                calls = [],
                addon = {
                    isWindowDragging        : true,
                    popupName               : 'tearout-graph',
                    windowDragGeneration    : 20,
                    windowDragMovePromises  : new Set(),
                    windowDragParked        : false,
                    windowDragParkedGeometry: null
                },
                data  = {
                    nativeHandleKey: `native-20-${invalidation}`,
                    restoreRect    : {height: 300, width: 400, x: 40, y: 60},
                    targetWindowId : `popup-20-${invalidation}`,
                    windowName     : 'tearout-graph',
                    x              : 800,
                    y              : 120
                };

            Neo.Main.windowNativeResizeTo = async () => {
                throw new Error('position-only recovery must not resize')
            };
            Neo.Main.windowNativeMoveTo = request => {
                calls.push(request);
                return calls.length === 1 ? move : Promise.resolve(true)
            };

            const parked = DragDrop.prototype.parkWindowDrag.call(addon, data);

            await expect.poll(() => calls.length).toBe(1);

            if (invalidation === 'reset') {
                DragDrop.prototype.resetDragState.call(addon)
            } else {
                DragDrop.prototype.startWindowDrag.call(addon, {
                    popupHeight: 240,
                    popupName  : 'successor',
                    popupWidth : 320
                })
            }

            resolveMove(true);

            await expect(parked).resolves.toBe(false);
            expect(calls).toEqual([
                {
                    nativeHandleKey: data.nativeHandleKey,
                    targetWindowId : data.targetWindowId,
                    x              : 800,
                    y              : 120
                },
                {
                    nativeHandleKey: data.nativeHandleKey,
                    targetWindowId : data.targetWindowId,
                    x              : 40,
                    y              : 60
                }
            ]);
            expect(addon.windowDragOrphanRecoveries).toBeNull()
        }
    });

    test('terminal restore joins a stale position move and advances the one serialized destination', async () => {
        let resolveMove;

        const
            move  = new Promise(resolve => resolveMove = resolve),
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 21,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            data  = {
                nativeHandleKey: 'native-21',
                restoreRect    : {height: 300, width: 400, x: 40, y: 60},
                targetWindowId : 'popup-21',
                windowName     : 'tearout-graph',
                x              : 800,
                y              : 120
            };

        Neo.Main.windowNativeResizeTo = async () => {
            throw new Error('position-only recovery must not resize')
        };
        Neo.Main.windowNativeMoveTo = request => {
            calls.push(request);
            return calls.length === 1 ? move : Promise.resolve(true)
        };

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, data);

        await expect.poll(() => calls.length).toBe(1);
        DragDrop.prototype.resetDragState.call(addon);

        const terminal = DragDrop.prototype.resumeWindowDrag.call(addon, {
            nativeHandleKey: data.nativeHandleKey,
            targetWindowId : data.targetWindowId,
            windowName     : data.windowName,
            x              : 420,
            y              : 240
        });

        resolveMove(true);

        await expect(parked).resolves.toBe(false);
        await expect(terminal).resolves.toBe(true);
        expect(calls).toEqual([
            {
                nativeHandleKey: 'native-21',
                targetWindowId : 'popup-21',
                x              : 800,
                y              : 120
            },
            {
                nativeHandleKey: 'native-21',
                targetWindowId : 'popup-21',
                x              : 420,
                y              : 240
            }
        ]);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('a newer terminal revision arriving during resize suppresses the stale position effect', async () => {
        let resolveResize;

        const
            resize       = new Promise(resolve => resolveResize = resolve),
            resizeCalls  = [],
            moveCalls    = [],
            addon        = {},
            recoveryData = {
                nativeHandleKey: 'native-22',
                park           : {height: 260, width: 360, x: 800, y: 120},
                resize         : true,
                restore        : {height: 546, width: 640, x: 100, y: 150},
                targetWindowId : 'popup-22',
                windowName     : 'tearout-graph'
            };

        Neo.Main.windowNativeResizeTo = request => {
            resizeCalls.push(request);
            return resizeCalls.length === 1 ? resize : Promise.resolve(true)
        };
        Neo.Main.windowNativeMoveTo = async request => {
            moveCalls.push(request);
            return true
        };

        DragDrop.prototype.retainWindowDragOrphanRecovery.call(addon, recoveryData);

        const first = DragDrop.prototype.retryWindowDragOrphanRecovery.call(addon, recoveryData);

        await expect.poll(() => resizeCalls.length).toBe(1);

        const latest = DragDrop.prototype.resumeWindowDrag.call(addon, {
            nativeHandleKey: 'native-22',
            targetWindowId : 'popup-22',
            windowName     : 'tearout-graph',
            x              : 200,
            y              : 250
        });

        resolveResize(true);

        await expect(first).resolves.toBe(true);
        await expect(latest).resolves.toBe(true);
        expect(resizeCalls).toHaveLength(2);
        expect(moveCalls).toEqual([{
            nativeHandleKey: 'native-22',
            targetWindowId : 'popup-22',
            x              : 200,
            y              : 250
        }]);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('reset during park resize retains a refused compensation for terminal retry', async () => {
        let resolveResize;

        const
            resize      = new Promise(resolve => resolveResize = resolve),
            resizeCalls = [],
            moveCalls   = [],
            addon       = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 23,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            data        = {
                nativeHandleKey: 'native-23',
                parkSize       : {height: 260, width: 360},
                restoreRect    : {height: 546, width: 640, x: 40, y: 60},
                targetWindowId : 'popup-23',
                windowName     : 'tearout-graph',
                x              : 800,
                y              : 120
            };

        Neo.Main.windowNativeResizeTo = request => {
            resizeCalls.push(request);

            if (resizeCalls.length === 1) return resize;

            return Promise.resolve(resizeCalls.length > 2)
        };
        Neo.Main.windowNativeMoveTo = async request => {
            moveCalls.push(request);
            return true
        };

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, data);

        await expect.poll(() => resizeCalls.length).toBe(1);
        DragDrop.prototype.resetDragState.call(addon);
        resolveResize(true);

        await expect(parked).resolves.toBe(false);
        expect(resizeCalls).toHaveLength(2);
        expect(moveCalls).toEqual([{
            nativeHandleKey: 'native-23',
            targetWindowId : 'popup-23',
            x              : 800,
            y              : 120
        }]);
        expect(DragDrop.prototype.hasWindowDragOrphanRecovery.call(addon, data)).toBe(true);

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, {
            nativeHandleKey: 'native-23',
            targetWindowId : 'popup-23',
            windowName     : 'tearout-graph',
            x              : 420,
            y              : 240
        })).resolves.toBe(true);

        expect(resizeCalls).toHaveLength(3);
        expect(moveCalls).toEqual([
            {
                nativeHandleKey: 'native-23',
                targetWindowId : 'popup-23',
                x              : 800,
                y              : 120
            },
            {
                nativeHandleKey: 'native-23',
                targetWindowId : 'popup-23',
                x              : 420,
                y              : 240
            }
        ]);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('orphan restore returns to exact cover after its full-size move is refused', async () => {
        let moveCall = 0;

        const
            calls        = [],
            addon        = {},
            recoveryData = {
                nativeHandleKey: 'native-241',
                park           : {height: 260, width: 360, x: 800, y: 120},
                resize         : true,
                restore        : {height: 546, width: 640, x: 420, y: 240},
                targetWindowId : 'popup-241',
                windowName     : 'tearout-graph'
            };

        Neo.Main.windowNativeResizeTo = async request => {
            calls.push(['resize', request]);
            return true
        };
        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(['move', request]);
            return ++moveCall > 1
        };

        DragDrop.prototype.retainWindowDragOrphanRecovery.call(addon, recoveryData);

        await expect(DragDrop.prototype.retryWindowDragOrphanRecovery.call(addon, recoveryData))
            .resolves.toBe(false);
        expect(calls).toEqual([
            ['resize', {
                height         : 546,
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                width          : 640
            }],
            ['move', {
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                x              : 420,
                y              : 240
            }],
            ['resize', {
                height         : 260,
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                width          : 360
            }],
            ['move', {
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                x              : 800,
                y              : 120
            }]
        ]);
        expect(DragDrop.prototype.hasWindowDragOrphanRecovery.call(addon, recoveryData)).toBe(true);

        await expect(DragDrop.prototype.retryWindowDragOrphanRecovery.call(addon, recoveryData))
            .resolves.toBe(true);
        expect(calls.slice(-2)).toEqual([
            ['resize', {
                height         : 546,
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                width          : 640
            }],
            ['move', {
                nativeHandleKey: 'native-241',
                targetWindowId : 'popup-241',
                x              : 420,
                y              : 240
            }]
        ]);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('orphan acknowledgement waits for pending effects and source-route operations', () => {
        const
            addon        = {},
            sourceRoute  = {operationCount: 1},
            recoveryData = {
                nativeHandleKey: 'native-242',
                pendingEffect  : Promise.resolve(true),
                resize         : false,
                restore        : {x: 420, y: 240},
                sourceRoute,
                targetWindowId : 'popup-242',
                windowName     : 'tearout-graph'
            },
            recovery = DragDrop.prototype.retainWindowDragOrphanRecovery.call(addon, recoveryData);

        expect(DragDrop.prototype.acknowledgeWindowDragOrphanRecovery.call(addon, recoveryData)).toBe(false);

        recovery.pendingEffect = null;
        expect(DragDrop.prototype.acknowledgeWindowDragOrphanRecovery.call(addon, recoveryData)).toBe(false);

        sourceRoute.operationCount = 0;
        expect(DragDrop.prototype.acknowledgeWindowDragOrphanRecovery.call(addon, recoveryData)).toBe(true);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('reset during cover compensation prevents its stale move from racing exact recovery', async () => {
        let resolveCoverResize;

        const
            coverResize = new Promise(resolve => resolveCoverResize = resolve),
            calls       = [],
            geometry    = {
                park   : {height: 260, width: 360, x: 800, y: 120},
                resize : true,
                restore: {height: 546, width: 640, x: 40, y: 60}
            },
            route       = {
                generation     : 24,
                key            : JSON.stringify(['native-24', 'popup-24', 'tearout-graph']),
                nativeHandleKey: 'native-24',
                operationCount : 0,
                pendingEffect  : null,
                resize         : true,
                restore        : {...geometry.restore},
                retired        : false,
                revision       : 1,
                targetWindowId : 'popup-24',
                windowName     : 'tearout-graph'
            },
            addon       = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 24,
                windowDragParked        : true,
                windowDragParkedGeometry: geometry,
                windowDragParkRoute     : route,
                windowDragParkRecovery  : null
            };

        let resizeCall = 0,
            moveCall   = 0;

        Neo.Main.windowNativeResizeTo = request => {
            calls.push(['resize', request]);
            return ++resizeCall === 2 ? coverResize : Promise.resolve(true)
        };
        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(['move', request]);
            return ++moveCall > 1
        };

        const resumed = DragDrop.prototype.resumeWindowDrag.call(addon, {
            nativeHandleKey: 'native-24',
            targetWindowId : 'popup-24',
            windowName     : 'tearout-graph',
            x              : 420,
            y              : 240
        });

        await expect.poll(() => resizeCall).toBe(2);
        DragDrop.prototype.resetDragState.call(addon);
        resolveCoverResize(true);

        await expect(resumed).resolves.toBe(false);
        expect(calls.filter(([type, request]) => (
            type === 'move' && request.x === 800 && request.y === 120
        ))).toEqual([]);
        expect(calls.at(-1)).toEqual(['move', {
            nativeHandleKey: 'native-24',
            targetWindowId : 'popup-24',
            x              : 420,
            y              : 240
        }]);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    });

    test('an orphan on route A never blocks a same-name park through opaque route B', async () => {
        const
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 25,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            };

        DragDrop.prototype.retainWindowDragOrphanRecovery.call(addon, {
            nativeHandleKey: 'native-25-a',
            resize         : false,
            restore        : {x: 40, y: 60},
            targetWindowId : 'popup-25-a',
            windowName     : 'tearout-graph'
        });

        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(request);
            return true
        };

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, {
            nativeHandleKey: 'native-25-b',
            restoreRect    : {height: 300, width: 400, x: 80, y: 100},
            targetWindowId : 'popup-25-b',
            windowName     : 'tearout-graph',
            x              : 900,
            y              : 160
        })).resolves.toBe(true);

        expect(calls).toEqual([{
            nativeHandleKey: 'native-25-b',
            targetWindowId : 'popup-25-b',
            x              : 900,
            y              : 160
        }]);
        expect(DragDrop.prototype.hasWindowDragOrphanRecovery.call(addon, {
            nativeHandleKey: 'native-25-a',
            targetWindowId : 'popup-25-a',
            windowName     : 'tearout-graph'
        })).toBe(true)
    });

    test('active resume refuses a same-name request for a different opaque native route', async () => {
        const
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 251,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            };

        Neo.Main.windowNativeMoveTo = async request => {
            calls.push(request);
            return true
        };

        await expect(DragDrop.prototype.parkWindowDrag.call(addon, {
            nativeHandleKey: 'native-251-a',
            restoreRect    : {height: 300, width: 400, x: 40, y: 60},
            targetWindowId : 'popup-251-a',
            windowName     : 'tearout-graph',
            x              : 800,
            y              : 120
        })).resolves.toBe(true);

        await expect(DragDrop.prototype.resumeWindowDrag.call(addon, {
            nativeHandleKey: 'native-251-b',
            targetWindowId : 'popup-251-b',
            windowName     : 'tearout-graph',
            x              : 420,
            y              : 240
        })).resolves.toBe(false);

        expect(calls).toEqual([{
            nativeHandleKey: 'native-251-a',
            targetWindowId : 'popup-251-a',
            x              : 800,
            y              : 120
        }]);
        expect(addon.windowDragParked).toBe(true);
        expect(addon.windowDragParkRoute).toMatchObject({
            nativeHandleKey: 'native-251-a',
            targetWindowId : 'popup-251-a'
        })
    });

    test('strict close tombstones an in-flight route until its stale continuation drains', async () => {
        let resolveMove;

        const
            move  = new Promise(resolve => resolveMove = resolve),
            calls = [],
            addon = {
                isWindowDragging        : true,
                popupName               : 'tearout-graph',
                windowDragGeneration    : 26,
                windowDragMovePromises  : new Set(),
                windowDragParked        : false,
                windowDragParkedGeometry: null
            },
            data  = {
                nativeHandleKey: 'native-26',
                restoreRect    : {height: 300, width: 400, x: 40, y: 60},
                targetWindowId : 'popup-26',
                windowName     : 'tearout-graph',
                x              : 800,
                y              : 120
            };

        Neo.Main.windowNativeMoveTo = request => {
            calls.push(request);
            return calls.length === 1 ? move : Promise.resolve(true)
        };

        const parked = DragDrop.prototype.parkWindowDrag.call(addon, data);

        await expect.poll(() => calls.length).toBe(1);
        DragDrop.prototype.resetDragState.call(addon);

        expect(DragDrop.prototype.retireWindowDragOrphanRecovery.call(addon, data)).toBe(true);
        expect(DragDrop.prototype.hasWindowDragOrphanRecovery.call(addon, data)).toBe(true);

        resolveMove(true);

        await expect(parked).resolves.toBe(false);
        expect(calls).toHaveLength(1);
        expect(DragDrop.prototype.hasWindowDragOrphanRecovery.call(addon, data)).toBe(false);
        expect(addon.windowDragOrphanRecoveries).toBeNull()
    })
});

test.describe('Neo.main.addon.DragDrop — main-thread resize preview', () => {
    const createStyle = initial => {
        const values = new Map(Object.entries(initial));

        return {
            getPropertyPriority: () => '',
            getPropertyValue   : key => values.get(key) || '',
            removeProperty     : key => values.delete(key),
            setProperty        : (key, value) => values.set(key, value)
        }
    };

    const createState = ({axis='width', awaitWorkerSettlement=false, preview=true, resizeNext=true}={}) => {
        const style  = createStyle({flex: '1 1 0%'}),
              target = {style};

        const resize = new Resize();

        resize.state = {
            axis,
            awaitWorkerSettlement,
            coordinate   : axis === 'width' ? 'clientX' : 'clientY',
            dragZoneId   : 'splitter-zone',
            lastSize     : 300,
            maxSize      : 590,
            minSize      : 0,
            originalStyle: {
                [axis]: {priority: '', value: ''},
                flex  : {priority: '', value: '1 1 0%'}
            },
            preview,
            parentId       : 'parent-wrapper',
            resizeNext,
            startCoordinate: 100,
            startSize      : 300,
            target,
            targetId       : 'target-wrapper'
        };

        return {
            resize,
            style
        }
    };

    test('lands path-owned DockFlip on Main before resize or proxy state and an immediate move', () => {
        const
            originalDockFlip = Neo.main.addon.DockFlip,
            originalSend     = DomEvents.sendMessageToApp,
            appEvents        = [],
            order            = [],
            host             = {id: 'dock-host'},
            root             = {id: 'splitter-root'},
            target           = {
                getBoundingClientRect() {
                    return {height: 6, left: 300, top: 0, width: 6}
                }
            };

        let presentationActive = true;

        const dragResize = {
            active: false,
            apply() {
                expect(presentationActive, 'a native move cannot mutate while FLIP still owns geometry').toBe(false);
                order.push('resize:apply')
            },
            start(path, data, dragZoneId) {
                expect(presentationActive, 'presentation lands before Resize captures state').toBe(false);
                expect(dragZoneId).toBe('splitter-zone');
                this.active = true;
                order.push('resize:start')
            }
        };

        const addon = {
            alwaysFireDragMove    : false,
            boundaryContainerRect : null,
            dragCancelled         : false,
            dragProxyElement      : null,
            dragProxyRect         : null,
            dragResize,
            getEventData          : () => ({}),
            isWindowDragging      : false,
            resolveDragZoneId     : () => 'splitter-zone',
            scrollContainerElement: null
        };

        Neo.main.addon.DockFlip = {
            landFromPath(path) {
                expect(path).toEqual([target, root, host]);
                presentationActive = false;
                order.push('dockFlip:land');

                return true
            }
        };
        // Deliberately retain the App event: the physical owner must be correct without an ack.
        DomEvents.sendMessageToApp = data => {
            appEvents.push(data);
            order.push('app:queued')
        };

        try {
            DragDrop.prototype.onDragStart.call(addon, {
                detail: {clientX: 300, clientY: 0},
                path  : [target, root, host],
                target
            });
            DragDrop.prototype.onDragMove.call(addon, {
                detail: {
                    clientX      : 340,
                    clientY      : 0,
                    originalEvent: {screenX: 340, screenY: 0}
                }
            })
        } finally {
            originalDockFlip === undefined
                ? delete Neo.main.addon.DockFlip
                : Neo.main.addon.DockFlip = originalDockFlip;
            DomEvents.sendMessageToApp = originalSend
        }

        expect(appEvents).toHaveLength(1);
        expect(appEvents[0].type).toBe('drag:start');
        expect(order).toEqual(['dockFlip:land', 'resize:start', 'app:queued', 'resize:apply'])
    });

    test('a missing DockFlip addon or path-owned host leaves native admission synchronous', () => {
        const
            originalDockFlip = Neo.main.addon.DockFlip,
            originalSend     = DomEvents.sendMessageToApp,
            scenarios        = [
                {dockFlip: undefined, name: 'missing addon'},
                {
                    dockFlip: {
                        landFromPath() {
                            return false
                        }
                    },
                    name: 'no path-owned host'
                }
            ];

        try {
            DomEvents.sendMessageToApp = () => {};

            scenarios.forEach(({dockFlip, name}) => {
                const
                    starts = [],
                    target = {getBoundingClientRect: () => ({height: 6, left: 0, top: 0, width: 6})},
                    addon  = {
                        dragResize       : {start: (...args) => starts.push(args)},
                        getEventData     : () => ({}),
                        resolveDragZoneId: () => 'splitter-zone'
                    };

                dockFlip === undefined
                    ? delete Neo.main.addon.DockFlip
                    : Neo.main.addon.DockFlip = dockFlip;

                expect(() => DragDrop.prototype.onDragStart.call(addon, {
                    detail: {clientX: 0, clientY: 0},
                    path  : [target],
                    target
                }), name).not.toThrow();
                expect(starts, name).toHaveLength(1)
            })
        } finally {
            originalDockFlip === undefined
                ? delete Neo.main.addon.DockFlip
                : Neo.main.addon.DockFlip = originalDockFlip;
            DomEvents.sendMessageToApp = originalSend
        }
    });

    test('live pointer frames resize the real target and terminal resolution keeps that DOM preview', () => {
        const {resize, style} = createState();

        expect(resize.apply({clientX: 180, clientY: 0})).toBe(220);
        expect(style.getPropertyValue('flex')).toBe('none');
        expect(style.getPropertyValue('width')).toBe('220px');

        expect(resize.finish({clientX: 190, clientY: 0})).toEqual({
            axis: 'width', size: 210, targetId: 'target-wrapper'
        });
        expect(resize.state).toBeNull();
        expect(style.getPropertyValue('width')).toBe('210px')
    });

    test('previous/horizontal math is symmetric and deferred mode computes without mutating', () => {
        let state = createState({axis: 'height', resizeNext: false});

        expect(state.resize.apply({clientX: 0, clientY: 160})).toBe(360);
        expect(state.style.getPropertyValue('height')).toBe('360px');

        state = createState({preview: false});

        expect(state.resize.finish({clientX: 180, clientY: 0})).toEqual({
            axis: 'width', size: 220, targetId: 'target-wrapper'
        });
        expect(state.style.getPropertyValue('width')).toBe('');
        expect(state.style.getPropertyValue('flex')).toBe('1 1 0%')
    });

    test('CSS min/max bounds clamp both live preview and terminal output', () => {
        const {resize, style} = createState();

        Object.assign(resize.state, {minSize: 180, maxSize: 420});

        expect(resize.apply({clientX: 500, clientY: 0})).toBe(180);
        expect(style.getPropertyValue('width')).toBe('180px');

        expect(resize.finish({clientX: -500, clientY: 0})).toEqual({
            axis: 'width', size: 420, targetId: 'target-wrapper'
        });
        expect(style.getPropertyValue('width')).toBe('420px')
    });

    test('worker settlement keeps accepted pixels, restores rejected pixels, and rejects stale generations', () => {
        let state = createState({awaitWorkerSettlement: true}),
            terminal;

        terminal = state.resize.finish({clientX: 190, clientY: 0});

        expect(terminal).toEqual({
            axis      : 'width',
            generation: 1,
            size      : 210,
            targetId  : 'target-wrapper'
        });
        expect(state.style.getPropertyValue('width')).toBe('210px');
        expect(state.resize.settle({
            dragZoneId: 'splitter-zone',
            generation: 2,
            restore   : true,
            targetId  : 'target-wrapper'
        }), 'a stale verdict cannot touch the current terminal').toBe(false);
        expect(state.style.getPropertyValue('width')).toBe('210px');
        expect(state.resize.settle({
            dragZoneId: 'splitter-zone',
            generation: 1,
            restore   : true,
            targetId  : 'target-wrapper'
        })).toBe(true);
        expect(state.style.getPropertyValue('width')).toBe('');
        expect(state.style.getPropertyValue('flex')).toBe('1 1 0%');
        expect(state.resize.pendingTerminal).toBeNull();

        state    = createState({awaitWorkerSettlement: true});
        terminal = state.resize.finish({clientX: 180, clientY: 0});

        expect(state.resize.settle({
            dragZoneId: 'splitter-zone',
            generation: terminal.generation,
            targetId  : 'target-wrapper'
        })).toBe(true);
        expect(state.style.getPropertyValue('width'), 'acceptance retains terminal pixels until projection owns them')
            .toBe('220px');
        expect(state.resize.pendingTerminal).toBeNull()
    });

    test('a same-gesture registration replaces a retired target and replays the latest pointer frame', () => {
        const
            first             = createState(),
            replacementStyle  = createStyle({flex: '1 1 0%'}),
            replacementTarget = {style: replacementStyle};

        first.resize.apply({clientX: 150, clientY: 0});
        first.resize.gesture = {
            clientX      : 100,
            clientY      : 0,
            dragZoneId   : 'splitter-zone',
            latestClientX: 180,
            latestClientY: 0
        };
        first.resize.createState = config => ({
            ...first.resize.state,
            axis         : config.axis,
            dragZoneId   : config.dragZoneId,
            lastSize     : 300,
            originalStyle: {
                flex : {priority: '', value: '1 1 0%'},
                width: {priority: '', value: ''}
            },
            parentId       : config.parentId,
            startCoordinate: 100,
            startSize      : 300,
            target         : replacementTarget,
            targetId       : config.targetId
        });

        first.resize.register({
            dragElementRootId: 'splitter-root',
            dragZoneId       : 'splitter-zone',
            resizeConfig     : {
                axis      : 'width',
                parentId  : 'current-parent',
                preview   : true,
                resizeNext: true,
                targetId  : 'current-target'
            }
        });

        expect(first.style.getPropertyValue('width'), 'the retired target regains its original authority').toBe('');
        expect(first.style.getPropertyValue('flex')).toBe('1 1 0%');
        expect(first.resize.state.targetId).toBe('current-target');
        expect(replacementStyle.getPropertyValue('width'), 'the latest frame is replayed on the current target')
            .toBe('220px')
    });

    test('createState derives pixel bounds from the target computed style', () => {
        const originalGetElement       = Neo.main.DomAccess.getElement,
              originalGetLayoutRect    = Neo.main.DomAccess.getLayoutRect,
              originalGetComputedStyle = globalThis.getComputedStyle,
              parent                   = {},
              target                   = {style: createStyle({flex: '1 1 0%'})};

        Neo.main.DomAccess.getElement = id => id === 'parent' ? parent : target;
        Neo.main.DomAccess.getLayoutRect = element => element === parent
            ? {width: 600, height: 400}
            : {width: 300, height: 200};
        globalThis.getComputedStyle = () => ({
            getPropertyValue: key => ({'min-width': '120px', 'max-width': '440px'})[key] || 'none'
        });

        try {
            const state = new Resize().createState({
                axis        : 'width',
                parentId    : 'parent',
                preview     : true,
                resizeNext  : true,
                splitterSize: 6,
                targetId    : 'target'
            }, {clientX: 100});

            expect(state.minSize).toBe(120);
            expect(state.maxSize).toBe(440)
        } finally {
            Neo.main.DomAccess.getElement    = originalGetElement;
            Neo.main.DomAccess.getLayoutRect = originalGetLayoutRect;
            originalGetComputedStyle === undefined
                ? delete globalThis.getComputedStyle
                : globalThis.getComputedStyle = originalGetComputedStyle
        }
    });

    test('createState resolves percentage bounds against the parent layout axis', () => {
        const originalGetElement       = Neo.main.DomAccess.getElement,
              originalGetLayoutRect    = Neo.main.DomAccess.getLayoutRect,
              originalGetComputedStyle = globalThis.getComputedStyle,
              parent                   = {},
              target                   = {style: createStyle({flex: '1 1 0%'})};

        Neo.main.DomAccess.getElement = id => id === 'parent' ? parent : target;
        Neo.main.DomAccess.getLayoutRect = element => element === parent
            ? {width: 800, height: 600}
            : {width: 240, height: 180};
        globalThis.getComputedStyle = () => ({
            getPropertyValue: key => ({'min-width': '120px', 'max-width': '50%'})[key] || 'none'
        });

        try {
            const state = new Resize().createState({
                axis        : 'width',
                parentId    : 'parent',
                preview     : true,
                resizeNext  : true,
                splitterSize: 6,
                targetId    : 'target'
            }, {clientX: 100});

            expect(state.minSize).toBe(120);
            expect(state.maxSize, '50% is half the 800px parent, not the literal number 50').toBe(400)
        } finally {
            Neo.main.DomAccess.getElement    = originalGetElement;
            Neo.main.DomAccess.getLayoutRect = originalGetLayoutRect;
            originalGetComputedStyle === undefined
                ? delete globalThis.getComputedStyle
                : globalThis.getComputedStyle = originalGetComputedStyle
        }
    });

    test('cancel restores exact inline authority and a live move emits no App-Worker frame', () => {
        const {resize, style} = createState(),
              addon           = {dragResize: resize},
              sent            = [],
              originalSend    = DomEvents.sendMessageToApp;

        Object.assign(addon, {
            alwaysFireDragMove    : false,
            boundaryContainerRect : null,
            dragCancelled         : false,
            dragProxyElement      : null,
            dragProxyRect         : null,
            isWindowDragging      : false,
            scrollContainerElement: null
        });

        DomEvents.sendMessageToApp = data => sent.push(data);

        try {
            DragDrop.prototype.onDragMove.call(addon, {
                detail: {
                    clientX      : 180,
                    clientY      : 0,
                    originalEvent: {screenX: 180, screenY: 0}
                }
            });

            expect(style.getPropertyValue('width')).toBe('220px');
            expect(sent, 'main-thread resize frames never cross into the App Worker').toEqual([]);
            expect(resize.cancel()).toBe(true);
            expect(style.getPropertyValue('width')).toBe('');
            expect(style.getPropertyValue('flex')).toBe('1 1 0%')
        } finally {
            DomEvents.sendMessageToApp = originalSend
        }
    })
});

test.describe('Neo.main.addon.DragDrop — the zone registry teardown contract', () => {
    test('unregisterZone removes by root key AND sweeps by zone id — a wrong root key cannot strand entries', () => {
        const addon = {zoneRegistrations: {}};

        DragDrop.prototype.registerZone.call(addon, {dragElementRootId: 'root-a', dragZoneId: 'zone-a'});
        DragDrop.prototype.registerZone.call(addon, {dragElementRootId: 'root-b', dragZoneId: 'zone-a'});

        // The wrapping-zone destroy shape: a WRONG root key with the correct zone id.
        // The sweep must still clear every registration pointing at the zone — a stale id
        // resolving to a destroyed zone is strictly worse than a zoneless resolve.
        DragDrop.prototype.unregisterZone.call(addon, {dragElementRootId: 'wrapper-never-registered', dragZoneId: 'zone-a'});

        expect(addon.zoneRegistrations).toEqual({})
    });

    test('registerZone guards partial data; unregisterZone by root key removes just that registration', () => {
        const addon = {zoneRegistrations: {}};

        DragDrop.prototype.registerZone.call(addon, {dragElementRootId: 'root-a', dragZoneId: 'zone-a'});
        DragDrop.prototype.registerZone.call(addon, {dragElementRootId: 'root-b'}); // partial: no zone id — ignored
        DragDrop.prototype.unregisterZone.call(addon, {dragElementRootId: 'root-a', dragZoneId: 'zone-a'});

        expect(addon.zoneRegistrations).toEqual({})
    });

    test('resolveDragZoneId walks the event path to the first registered root', () => {
        const addon = {zoneRegistrations: {'root-outer': 'zone-outer', 'root-inner': 'zone-inner'}};

        expect(DragDrop.prototype.resolveDragZoneId.call(addon, [{id: 'leaf'}, {id: 'root-inner'}, {id: 'root-outer'}])).toBe('zone-inner');
        expect(DragDrop.prototype.resolveDragZoneId.call(addon, [{id: 'unregistered'}])).toBeNull();
        expect(DragDrop.prototype.resolveDragZoneId.call(addon, null)).toBeNull()
    });

    test('resize registration resolves by the same root and is swept by zone identity', () => {
        const addon = {dragResize: new Resize(), zoneRegistrations: {}};

        DragDrop.prototype.registerZone.call(addon, {
            dragElementRootId: 'splitter-root',
            dragZoneId       : 'splitter-zone',
            resizeConfig     : {axis: 'width', targetId: 'target-wrapper'}
        });

        expect(addon.dragResize.resolve([{id: 'splitter-root'}])).toMatchObject({
            axis      : 'width',
            dragZoneId: 'splitter-zone',
            targetId  : 'target-wrapper'
        });

        DragDrop.prototype.unregisterZone.call(addon, {
            dragElementRootId: 'wrong-root',
            dragZoneId       : 'splitter-zone'
        });

        expect(addon.dragResize.registrations).toEqual({});
        expect(addon.zoneRegistrations).toEqual({})
    })
});

test.describe('Neo.main.addon.DragDrop — dock sort-first boundary motion (#17926)', () => {
    test('a sort-first move can leave the toolbar and keep following the pointer inside the workspace boundary', () => {
        const originalSend = DomEvents.sendMessageToApp,
              sent         = [];

        const createAddon = boundaryContainerRect => ({
            allowOverdrag       : false,
            alwaysFireDragMove  : true,
            boundaryContainerRect,
            dragCancelled       : false,
            dragProxyElement    : {
                getBoundingClientRect: () => ({height: 20, width: 80}),
                style                : {}
            },
            dragProxyRect       : {height: 20, width: 80},
            dragZoneId          : 'dock-tab-sort-zone',
            getEventData        : event => ({clientX: event.detail.clientX, clientY: event.detail.clientY}),
            isWindowDragging    : false,
            moveHorizontal      : true,
            moveVertical        : true,
            offsetX             : 5,
            offsetY             : 5,
            windowDragParked    : false
        });
        const move = (addon, clientY) => DragDrop.prototype.onDragMove.call(addon, {
            detail: {
                clientX      : 45,
                clientY,
                originalEvent: {screenX: 45, screenY: clientY}
            }
        });

        DomEvents.sendMessageToApp = data => sent.push(data);

        try {
            const toolbarBound = createAddon({bottom: 40, left: 0, right: 240, top: 0});

            // The user sorts inside the strip first, then exits it on a later frame.
            move(toolbarBound, 20);
            move(toolbarBound, 200);

            expect(sent.map(frame => frame.proxyRect.top)).toEqual([15, 20]);

            sent.length = 0;

            const workspaceBound = createAddon({bottom: 400, left: 0, right: 800, top: 0});

            move(workspaceBound, 20);
            move(workspaceBound, 200);

            // Same gesture, same non-overdrag policy: the workspace boundary keeps the proxy at
            // the pointer instead of parking it at the source toolbar's edge.
            expect(sent.map(frame => frame.proxyRect.top)).toEqual([15, 195]);
            expect(sent.at(-1)).toMatchObject({clientY: 200, type: 'drag:move'})
        } finally {
            DomEvents.sendMessageToApp = originalSend
        }
    })
});
