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
 * @summary Pointer-follow for a popup window drag.
 *
 * Every pointer frame moves the dragged popup by name and still reaches the App Worker as a
 * logical drag frame, so target claims stay pointer-owned while the OS window follows.
 */
test.describe('Neo.main.addon.DragDrop — physical window drag', () => {
    let originalMoveTo,
        originalSend;

    test.beforeEach(() => {
        originalMoveTo = Neo.Main.windowMoveTo;
        originalSend   = DomEvents.sendMessageToApp
    });

    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDragDrop  === undefined ? delete Neo.main.addon.DragDrop : Neo.main.addon.DragDrop = originalDragDrop;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test.afterEach(() => {
        Neo.Main.windowMoveTo      = originalMoveTo;
        DomEvents.sendMessageToApp = originalSend
    });

    test('a window drag moves the popup under the pointer and still emits the logical drag frame', () => {
        const moved = [],
              sent  = [],
              addon = {
                  dragCancelled: false,
                  dragZoneId   : 'zone-a',
                  getEventData : () => ({clientX: 10, clientY: 20}),
                  offsetX      : 20,
                  offsetY      : 10
              };

        Neo.Main.windowMoveTo      = async data => {moved.push(data); return true};
        DomEvents.sendMessageToApp = data => sent.push(data);

        DragDrop.prototype.startWindowDrag.call(addon, {popupHeight: 240, popupName: 'tearout-graph', popupWidth: 320});
        DragDrop.prototype.onDragMove.call(addon, {
            detail: {originalEvent: {screenX: 500, screenY: 300}}
        });

        const {proxyRect} = sent[0];

        expect(moved).toEqual([{windowName: 'tearout-graph', x: 480, y: 290}]);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
            dragZoneId: 'zone-a',
            screenX   : 500,
            screenY   : 300,
            type      : 'drag:move'
        });
        expect({height: proxyRect.height, width: proxyRect.width, x: proxyRect.x, y: proxyRect.y})
            .toEqual({height: 240, width: 320, x: 480, y: 290})
    });

    test('a refused native move skips only that move: the drag frame still flows and nothing goes unhandled', async () => {
        const sent    = [],
              seen    = [],
              observe = reason => seen.push(String(reason)),
              // The runner fails a test on an unhandled rejection, which would kill the positive
              // control, so take the listener slot exclusively and hand it back in `finally`.
              borrowed = process.listeners('unhandledRejection'),
              drain    = async () => {
                  await new Promise(resolve => setImmediate(resolve));
                  await new Promise(resolve => setTimeout(resolve, 0))
              },
              addon    = {
                  dragCancelled: false,
                  dragZoneId   : 'zone-a',
                  getEventData : () => ({clientX: 10, clientY: 20}),
                  offsetX      : 20,
                  offsetY      : 10
              };

        Neo.Main.windowMoveTo      = async () => {throw new Error('SecurityError: the popup navigated away')};
        DomEvents.sendMessageToApp = data => sent.push(data);
        process.removeAllListeners('unhandledRejection');
        process.on('unhandledRejection', observe);

        try {
            // Positive control first: an inert observer would make the final assertion vacuous.
            Promise.reject(new Error('observer-control'));
            await drain();
            expect(seen, 'the observer itself works').toEqual(['Error: observer-control']);
            seen.length = 0;

            DragDrop.prototype.startWindowDrag.call(addon, {popupHeight: 240, popupName: 'tearout-graph', popupWidth: 320});
            DragDrop.prototype.onDragMove.call(addon, {detail: {originalEvent: {screenX: 500, screenY: 300}}});
            await drain()
        } finally {
            process.off('unhandledRejection', observe);
            borrowed.forEach(listener => process.on('unhandledRejection', listener))
        }

        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({dragZoneId: 'zone-a', type: 'drag:move'});
        expect(seen).toEqual([])
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
        expect(addon.isWindowDragging).toBe(false);
        expect(addon.popupName).toBe(null)
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
            resolvePressedElement : DragDrop.prototype.resolvePressedElement,
            resolveSensorPath     : DragDrop.prototype.resolveSensorPath,
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
                        dragResize           : {start: (...args) => starts.push(args)},
                        getEventData         : () => ({}),
                        resolveDragZoneId    : () => 'splitter-zone',
                        resolvePressedElement: DragDrop.prototype.resolvePressedElement,
                        resolveSensorPath    : DragDrop.prototype.resolveSensorPath
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
            dragProxyRect   : {height: 20, width: 80},
            dragZoneId      : 'dock-tab-sort-zone',
            getEventData    : event => ({clientX: event.detail.clientX, clientY: event.detail.clientY}),
            isWindowDragging: false,
            moveHorizontal  : true,
            moveVertical    : true,
            offsetX         : 5,
            offsetY         : 5
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

/**
 * @summary Escape reaches a drag wherever the keyboard focus is. The gesture owner cancels its own drag as
 * before; a window without a gesture of its own (the vessel or the target of a cross-window drag) asks the
 * App Worker, which asks the owner through `cancelDrag`.
 */
test.describe('Neo.main.addon.DragDrop — Escape across windows', () => {
    let originalKeyData, originalSend, sent;

    test.beforeEach(() => {
        originalKeyData = DomEvents.getKeyboardEventData;
        originalSend    = DomEvents.sendMessageToApp;
        sent            = [];

        DomEvents.getKeyboardEventData = event => ({key: event.key});
        DomEvents.sendMessageToApp     = data  => sent.push(data)
    });

    test.afterEach(() => {
        DomEvents.getKeyboardEventData = originalKeyData;
        DomEvents.sendMessageToApp     = originalSend
    });

    test('Escape in a window without its own gesture asks the App Worker once to cancel a cross-window one', () => {
        let prevented = false;

        const addon = {dragCancelled: false, dragZoneId: null};

        DragDrop.prototype.onKeyDown.call(addon, {key: 'Escape', preventDefault: () => {prevented = true}});
        DragDrop.prototype.onKeyDown.call(addon, {key: 'Enter',  preventDefault: () => {prevented = true}});

        expect(sent).toEqual([{crossWindow: true, key: 'Escape', type: 'drag:cancel'}]);
        expect(prevented, 'a window that owns no gesture leaves Escape to its own UI').toBe(false)
    });

    test('the gesture owner still cancels its own drag on Escape, once', () => {
        let prevented = 0;

        const
            addon = {cancelDrag: DragDrop.prototype.cancelDrag, dragCancelled: false, dragZoneId: 'zone-a'},
            event = {key: 'Escape', preventDefault: () => prevented++};

        DragDrop.prototype.onKeyDown.call(addon, event);
        DragDrop.prototype.onKeyDown.call(addon, event);

        expect(sent).toEqual([{dragZoneId: 'zone-a', key: 'Escape', type: 'drag:cancel'}]);
        expect(addon.dragCancelled).toBe(true);
        expect(prevented, 'only the Escape that cancelled keeps its default from the page').toBe(1)
    });

    test('cancelDrag cancels the gesture this window owns, once; without one it sends nothing', () => {
        let resizeCancels = 0;

        const
            owner = {dragCancelled: false, dragResize: {cancel: () => resizeCancels++}, dragZoneId: 'zone-a'},
            idle  = {dragCancelled: false, dragZoneId: null};

        DragDrop.prototype.cancelDrag.call(owner);
        DragDrop.prototype.cancelDrag.call(owner);
        DragDrop.prototype.cancelDrag.call(idle);

        expect(sent).toEqual([{dragZoneId: 'zone-a', type: 'drag:cancel'}]);
        expect(owner.dragCancelled).toBe(true);
        expect(resizeCancels).toBe(1);
        expect(idle.dragCancelled).toBe(false)
    })
});

/**
 * @summary A re-render can replace the pressed node inside the sensor's start delay; the sensor then
 * dispatches `drag:start` on `document`, and the addon must read the press from `detail`.
 */
test.describe('Neo.main.addon.DragDrop — a drag start whose pressed node a re-render replaced', () => {
    const
        rectOf  = (left, top, width, height) => () => ({height, left, top, width}),
        toolbar = {id: 'neo-tab-header-toolbar-4'},
        createAddon = () => ({
            dragResize           : null,
            getEventData         : DragDrop.prototype.getEventData,
            resolveDragZoneId    : DragDrop.prototype.resolveDragZoneId,
            resolvePressedElement: DragDrop.prototype.resolvePressedElement,
            resolveSensorPath    : DragDrop.prototype.resolveSensorPath,
            zoneRegistrations    : {'neo-tab-header-toolbar-4': 'neo-dock-tab-sortzone-4'}
        }),
        start = (addon, event) => {
            const
                sent         = [],
                activeDoc    = globalThis.document,
                originalSend = DomEvents.sendMessageToApp;

            globalThis.document        = documentRef;
            DomEvents.sendMessageToApp = data => sent.push(data);

            try {
                DragDrop.prototype.onDragStart.call(addon, event)
            } finally {
                globalThis.document        = activeDoc;
                DomEvents.sendMessageToApp = originalSend
            }

            return sent
        };

    test('dispatched from document, it measures the replacement node and resolves the zone from the press path', () => {
        const
            pressed     = {getBoundingClientRect: rectOf(0, 0, 0, 0), id: 'neo-tab-header-button-17', isConnected: false},
            replacement = {getBoundingClientRect: rectOf(1100, 121, 48, 32), id: 'neo-tab-header-button-17', isConnected: true},
            addon       = createAddon();

        documentRef.getElementById = id => id === replacement.id ? replacement : null;

        let sent;

        try {
            sent = start(addon, {
                composedPath: () => [documentRef, windowRef],
                detail      : {
                    clientX      : 1112,
                    clientY      : 131,
                    element      : pressed,
                    originalEvent: {composedPath: () => [pressed, toolbar], target: pressed, timeStamp: 0, type: 'mousedown'},
                    path         : [pressed, toolbar]
                },
                target: documentRef
            })
        } finally {
            delete documentRef.getElementById
        }

        expect(addon.dragZoneId).toBe('neo-dock-tab-sortzone-4');
        expect(addon.dragProxyRect).toEqual({height: 32, left: 1100, top: 121, width: 48});
        expect([addon.offsetX, addon.offsetY]).toEqual([12, 10]);
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({dragZoneId: 'neo-dock-tab-sortzone-4', type: 'drag:start'});
        expect(sent[0].path.map(node => node.id), 'the App routes drag:start by this path').toEqual(['neo-tab-header-button-17', 'neo-tab-header-toolbar-4']);
        expect(sent[0].path[0].isConnected, 'the App sizes its proxy from the live replacement').toBe(true)
    });

    test('dispatched on the connected node, it keeps the dispatch target and path', () => {
        const
            pressed = {getBoundingClientRect: rectOf(40, 8, 60, 30), id: 'neo-tab-header-button-3', isConnected: true},
            moved   = {id: 'neo-tab-header-toolbar-9'},
            addon   = createAddon();

        addon.zoneRegistrations = {'neo-tab-header-toolbar-9': 'neo-dock-tab-sortzone-9'};

        const sent = start(addon, {
            detail: {
                clientX      : 50,
                clientY      : 20,
                element      : pressed,
                originalEvent: {composedPath: () => [pressed, toolbar], target: pressed, timeStamp: 0, type: 'mousedown'},
                path         : [pressed, toolbar]
            },
            path  : [pressed, moved],
            target: pressed
        });

        expect(addon.dragZoneId, 'the live ancestors, not the press path, own a connected node').toBe('neo-dock-tab-sortzone-9');
        expect([addon.offsetX, addon.offsetY]).toEqual([10, 12]);
        expect(sent[0].path.map(node => node.id)).toEqual(['neo-tab-header-button-3', 'neo-tab-header-toolbar-9'])
    })
});
