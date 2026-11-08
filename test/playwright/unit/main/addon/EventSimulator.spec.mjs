import {setup} from '../../../setup.mjs';

setup({
    appConfig       : {name: 'MainEventSimulatorAtomicDragUnit'},
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {unitTestMode: true}
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

const
    originalDocument  = globalThis.document,
    originalDomAccess = Neo.main.DomAccess,
    documentRef       = new EventTarget();

documentRef.body = {};
documentRef.getElementById = () => null;
documentRef.querySelector  = () => null;
globalThis.document = documentRef;

delete Neo.main.DomAccess;

const {default: EventSimulator} = await import('../../../../../src/main/addon/EventSimulator.mjs');

const syntheticPointerId = 2_147_483_647;

function lifecycle(type, originalEvent) {
    const event = new Event(type);

    event.detail = {originalEvent};
    documentRef.dispatchEvent(event)
}

/**
 * @summary A construct-less simulator whose native dispatch is the given stub.
 * @param {Object} members
 * @returns {Object}
 */
function createHost(members) {
    return Object.assign(Object.create(EventSimulator.constructor.prototype), {
        driveActive     : false,
        getDriveDocument: () => documentRef,
        syntheticPointerId,
        async timeout() {}
    }, members)
}

test.afterAll(() => {
    originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
    originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
});

test.describe('Neo.main.addon.EventSimulator — simulated input', () => {
    test('the raw dispatch contract still returns false for a missing target', () => {
        expect(EventSimulator.dispatch({id: 'missing-node', type: 'click'})).toBe(false)
    });

    test('a simulated mouse press, move and release each dispatch their pointer event first, as one pointer', () => {
        const calls = [],
              host  = createHost({
                  dispatchNative(data) {
                      calls.push({id: data.id, options: data.options, type: data.type});
                      return {event: {type: data.type}, success: true}
                  }
              }),
              dispatch = data => EventSimulator.constructor.prototype.dispatchMouseAction.call(host, data).success;

        expect(dispatch({id: 'source', options: {button: 0, buttons: 1, clientX: 3, clientY: 4}, type: 'mousedown'})).toBe(true);
        expect(dispatch({id: 'document.body', options: {button: 0, buttons: 1, clientX: 9, clientY: 4}, type: 'mousemove'})).toBe(true);
        expect(dispatch({id: 'document.body', options: {button: 0, buttons: 0, clientX: 9, clientY: 4}, type: 'mouseup'})).toBe(true);

        expect(calls.map(call => `${call.type}@${call.id}`)).toEqual([
            'pointerdown@source',        'mousedown@source',
            'pointermove@document.body', 'mousemove@document.body',
            'pointerup@document.body',   'mouseup@document.body'
        ]);

        const [down, , move, , up] = calls;

        expect(down.options).toEqual({button: 0, buttons: 1, clientX: 3, clientY: 4, isPrimary: true, pointerId: syntheticPointerId, pointerType: 'mouse'});
        expect(move.options, 'a move changes no button: -1 on the pointer event').toMatchObject({button: -1, buttons: 1, pointerId: syntheticPointerId});
        expect(up.options).toMatchObject({button: 0, buttons: 0, pointerId: syntheticPointerId});
        expect(calls[1].options, 'the compatibility mouse event is exactly the requested one').toEqual({button: 0, buttons: 1, clientX: 3, clientY: 4})
    });

    test('raw dispatch sends a mouse press, move or release through its pointer event; other types alone', () => {
        const calls = [],
              host  = createHost({
                  dispatchNative(data) {
                      calls.push(`${data.type}:${data.options?.pointerId ?? '-'}`);
                      return {event: null, success: true}
                  }
              }),
              dispatch = data => EventSimulator.constructor.prototype.dispatch.call(host, data);

        ['mousedown', 'mousemove', 'mouseup', 'click', 'mouseover', 'keydown'].forEach(type => {
            expect(dispatch({id: 'source', options: {}, type}), type).toBe(true)
        });

        expect(calls).toEqual([
            `pointerdown:${syntheticPointerId}`, 'mousedown:-',
            `pointermove:${syntheticPointerId}`, 'mousemove:-',
            `pointerup:${syntheticPointerId}`,   'mouseup:-',
            'click:-',
            'mouseover:-',
            'keydown:-'
        ])
    });

    test('a failed pointer event withholds its mouse event', () => {
        const calls = [],
              host  = createHost({
                  dispatchNative(data) {
                      calls.push(data.type);
                      return {event: null, success: data.type !== 'pointerdown'}
                  }
              });

        expect(EventSimulator.constructor.prototype.dispatchMouseAction.call(host, {id: 'source', type: 'mousedown'}).success).toBe(false);
        expect(calls).toEqual(['pointerdown'])
    })
});

test.describe('Neo.main.addon.EventSimulator.driveDrag', () => {
    test('a second executor is refused before touching the live sensor', async () => {
        const outcome = await EventSimulator.constructor.prototype.driveDrag.call({driveActive: true}, {});

        expect(outcome).toMatchObject({
            success: false,
            phase  : 'busy',
            error  : {code: 'DRAG_BUSY'}
        })
    });

    test('a source window without a live Pointer sensor is refused as unavailable', async () => {
        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(createHost({
            async resolvePointerSensor() {
                return null
            }
        }), {});

        expect(outcome).toMatchObject({success: false, phase: 'busy', error: {code: 'POINTER_SENSOR_UNAVAILABLE'}})
    });

    test('owns one correlated start, post-arm move series and terminal end after source removal, as one pointer', async () => {
        let downEvent,
            moveIndex = 0,
            sourceAvailable = true,
            thresholdReads = 0;

        const
            calls  = [],
            sensor = {currentElement: null, dragging: false};

        Object.defineProperties(sensor, {
            delay      : {get() {thresholdReads++; return 37}},
            minDistance: {get() {thresholdReads++; return 6}}
        });

        const host = createHost({
            async resolvePointerSensor() {
                return sensor
            },
            dispatchNative(data, onCreate) {
                if (data.id === 'source' && !sourceAvailable) {
                    return {event: null, success: false}
                }

                const event = {pointerId: data.options.pointerId, type: data.type};

                onCreate?.(event);
                calls.push({id: data.id, type: data.type});

                // the sensor hears the pointer events; the compatibility mouse events follow them
                if (data.type === 'pointerdown') {
                    downEvent = event
                } else if (data.type === 'mousedown') {
                    sourceAvailable = false
                } else if (data.type === 'pointermove') {
                    moveIndex++;
                    lifecycle(moveIndex === 1 ? 'drag:start' : 'drag:move', moveIndex === 1 ? downEvent : event)
                } else if (data.type === 'pointerup') {
                    lifecycle('drag:end', event)
                }

                return {event, success: true}
            }
        });

        const pointerIds = new Set(),
              track      = host.dispatchNative;

        host.dispatchNative = (data, onCreate) => {
            data.type.startsWith('pointer') && pointerIds.add(data.options.pointerId);
            return track(data, onCreate)
        };

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {
                screen           : {x: 120, y: 20},
                sourceEventClient: {x: 120, y: 20},
                targetClient     : {x: 120, y: 20},
                windowId         : 'main'
            },
            durationMs: 40,
            path      : [{screen: {x: 120, y: 20}, sourceEventClient: {x: 120, y: 20}}],
            source    : {
                screen           : {x: 20, y: 20},
                sourceEventClient: {x: 20, y: 20},
                targetClient     : {x: 20, y: 20},
                targetId         : 'source',
                windowId         : 'main'
            },
            steps: 2
        });

        expect(outcome.success).toBe(true);
        expect(outcome.phase).toBe('complete');
        expect(outcome.sensor).toEqual({delayMs: 37, minDistance: 6});
        expect(outcome.dispatch).toEqual({down: true, moveCount: 3, up: true});
        expect(outcome.observed).toEqual({ended: true, moveCount: 2, started: true});
        expect(outcome.released).toBe(true);
        expect(sourceAvailable, 'the source is gone after the press; body owns every later event').toBe(false);
        expect(thresholdReads).toBe(2);
        expect([...pointerIds], 'one stable synthetic pointer for the whole drive').toEqual([syntheticPointerId]);
        expect(calls).toEqual([
            {id: 'source',        type: 'pointerdown'},
            {id: 'source',        type: 'mousedown'},
            {id: 'document.body', type: 'pointermove'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'pointermove'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'pointermove'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'pointerup'},
            {id: 'document.body', type: 'mouseup'}
        ])
    });

    test('an unrelated document lifecycle cannot arm the transaction, and cleanup releases once', async () => {
        let downEvent,
            upCount = 0;

        const
            calls = [],
            host  = createHost({
                async resolvePointerSensor() {
                    return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
                },
                dispatchNative(data, onCreate) {
                    const event = {type: data.type};

                    onCreate?.(event);
                    calls.push(data.type);

                    if (data.type === 'pointerdown') {
                        downEvent = event
                    } else if (data.type === 'pointermove') {
                        lifecycle('drag:start', {foreign: true})
                    } else if (data.type === 'pointerup') {
                        upCount++;
                        lifecycle('drag:end', event)
                    }

                    return {event, success: true}
                }
            });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 32,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 2
        });

        expect(downEvent).toBeTruthy();
        expect(outcome).toMatchObject({
            success : false,
            phase   : 'arming',
            error   : {code: 'DRAG_NOT_ARMED'},
            cleanup : {attempted: true, succeeded: true},
            observed: {started: false}
        });
        expect(upCount).toBe(1);
        expect(calls).toEqual(['pointerdown', 'mousedown', 'pointermove', 'mousemove', 'pointerup', 'mouseup'])
    });

    test('a missing source fails dispatch before arming and needs no cleanup release', async () => {
        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            dispatchNative() {
                return {event: null, success: false}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 16,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'missing'},
            steps      : 1
        });

        expect(outcome).toMatchObject({
            success: false,
            phase  : 'dispatch',
            error  : {code: 'POINTERDOWN_DISPATCH_FAILED'},
            cleanup: {attempted: false}
        })
    });

    test('a failed best-effort release reports cleanup failure without greening the gesture', async () => {
        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                return {event, success: data.type !== 'pointerup'}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 16,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 1
        });

        expect(outcome).toMatchObject({
            success: false,
            phase  : 'cleanup',
            error  : {code: 'CLEANUP_RELEASE_FAILED'},
            cleanup: {attempted: true, succeeded: false}
        })
    });

    test('an already-engaged source sensor is refused before dispatch', async () => {
        let dispatches = 0;

        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: {}, delay: 0, dragging: false, minDistance: 5}
            },
            dispatchNative() {
                dispatches++;
                return {event: {}, success: true}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 20,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 1
        });

        expect(outcome).toMatchObject({success: false, phase: 'busy', error: {code: 'POINTER_SENSOR_BUSY'}});
        expect(dispatches).toBe(0)
    });

    test('a path shorter than the live threshold fails without inventing an overshoot', async () => {
        let dispatches = 0;

        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 20}
            },
            dispatchNative() {
                dispatches++;
                return {event: {}, success: true}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 10, y: 0}, sourceEventClient: {x: 10, y: 0}},
            durationMs : 20,
            path       : [{screen: {x: 10, y: 0}, sourceEventClient: {x: 10, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 1
        });

        expect(outcome).toMatchObject({success: false, phase: 'arming', error: {code: 'PATH_TOO_SHORT'}});
        expect(dispatches).toBe(0)
    });

    test('arming without a correlated post-arm move fails movement and releases once', async () => {
        let downEvent,
            moveIndex = 0,
            upCount   = 0;

        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                if (data.type === 'pointerdown') {
                    downEvent = event
                } else if (data.type === 'pointermove') {
                    moveIndex++;
                    moveIndex === 1 && lifecycle('drag:start', downEvent)
                } else if (data.type === 'pointerup') {
                    upCount++;
                    lifecycle('drag:end', event)
                }

                return {event, success: true}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 32,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 2
        });

        expect(outcome).toMatchObject({
            success : false,
            phase   : 'movement',
            error   : {code: 'DRAG_MOVE_NOT_OBSERVED'},
            cleanup : {attempted: true, succeeded: true},
            observed: {started: true, moveCount: 0}
        });
        expect(upCount).toBe(1)
    });

    test('a missing correlated drag:end stays a release failure after pointerup dispatch', async () => {
        let downEvent,
            moveIndex = 0,
            upCount   = 0;

        const host = createHost({
            async resolvePointerSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                if (data.type === 'pointerdown') {
                    downEvent = event
                } else if (data.type === 'pointermove') {
                    moveIndex++;
                    lifecycle(moveIndex === 1 ? 'drag:start' : 'drag:move', moveIndex === 1 ? downEvent : event)
                } else if (data.type === 'pointerup') {
                    upCount++
                }

                return {event, success: true}
            }
        });

        const outcome = await EventSimulator.constructor.prototype.driveDrag.call(host, {
            destination: {screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}},
            durationMs : 16,
            path       : [{screen: {x: 100, y: 0}, sourceEventClient: {x: 100, y: 0}}],
            source     : {screen: {x: 0, y: 0}, sourceEventClient: {x: 0, y: 0}, targetId: 'source'},
            steps      : 1
        });

        expect(outcome).toMatchObject({
            success : false,
            phase   : 'release',
            error   : {code: 'DRAG_END_NOT_OBSERVED'},
            dispatch: {up: true},
            cleanup : {attempted: true, succeeded: true},
            released: false
        });
        expect(upCount, 'terminal release plus one best-effort cleanup release').toBe(2)
    })
});
