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

function lifecycle(type, originalEvent) {
    const event = new Event(type);

    event.detail = {originalEvent};
    documentRef.dispatchEvent(event)
}

test.describe('Neo.main.addon.EventSimulator.driveDrag', () => {
    test.afterAll(() => {
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess;
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument
    });

    test('the raw dispatch contract still returns false for a missing target', () => {
        expect(EventSimulator.dispatch({id: 'missing-node', type: 'click'})).toBe(false)
    });

    test('a second executor is refused before touching the live sensor', async () => {
        const outcome = await EventSimulator.constructor.prototype.driveDrag.call({driveActive: true}, {});

        expect(outcome).toMatchObject({
            success: false,
            phase  : 'busy',
            error  : {code: 'DRAG_BUSY'}
        })
    });

    test('owns one correlated start, post-arm move series and terminal end after source removal', async () => {
        let downEvent,
            moveIndex = 0,
            sourceAvailable = true,
            thresholdReads = 0;

        const
            calls  = [],
            sensor = {currentElement: null, dragging: false},
            host   = Object.create(EventSimulator.constructor.prototype);

        Object.defineProperties(sensor, {
            delay      : {get() {thresholdReads++; return 37}},
            minDistance: {get() {thresholdReads++; return 6}}
        });

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
                return sensor
            },
            async timeout() {},
            dispatchNative(data, onCreate) {
                if (data.id === 'source' && !sourceAvailable) {
                    return {event: null, success: false}
                }

                const event = {type: data.type};

                onCreate?.(event);
                calls.push({id: data.id, type: data.type});

                if (data.type === 'mousedown') {
                    downEvent       = event;
                    sourceAvailable = false
                } else if (data.type === 'mousemove') {
                    moveIndex++;
                    lifecycle(moveIndex === 1 ? 'drag:start' : 'drag:move', moveIndex === 1 ? downEvent : event)
                } else if (data.type === 'mouseup') {
                    lifecycle('drag:end', event)
                }

                return {event, success: true}
            }
        });

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
        expect(sourceAvailable, 'the source is gone after mousedown; body owns every later event').toBe(false);
        expect(thresholdReads).toBe(2);
        expect(calls).toEqual([
            {id: 'source',        type: 'mousedown'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'mousemove'},
            {id: 'document.body', type: 'mouseup'}
        ])
    });

    test('an unrelated document lifecycle cannot arm the transaction, and cleanup releases once', async () => {
        let downEvent,
            upCount = 0;

        const
            calls = [],
            host  = Object.create(EventSimulator.constructor.prototype);

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            async timeout() {},
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);
                calls.push(data.type);

                if (data.type === 'mousedown') {
                    downEvent = event
                } else if (data.type === 'mousemove') {
                    lifecycle('drag:start', {foreign: true})
                } else if (data.type === 'mouseup') {
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
        expect(calls).toEqual(['mousedown', 'mousemove', 'mouseup'])
    });

    test('a missing source fails dispatch before arming and needs no cleanup release', async () => {
        const host = Object.assign(Object.create(EventSimulator.constructor.prototype), {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
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
            error  : {code: 'MOUSEDOWN_DISPATCH_FAILED'},
            cleanup: {attempted: false}
        })
    });

    test('a failed best-effort mouseup reports cleanup failure without greening the gesture', async () => {
        const host = Object.assign(Object.create(EventSimulator.constructor.prototype), {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            async timeout() {},
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                return {event, success: data.type !== 'mouseup'}
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

        const host = Object.create(EventSimulator.constructor.prototype);

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
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

        expect(outcome).toMatchObject({success: false, phase: 'busy', error: {code: 'MOUSE_SENSOR_BUSY'}});
        expect(dispatches).toBe(0)
    });

    test('a path shorter than the live threshold fails without inventing an overshoot', async () => {
        let dispatches = 0;

        const host = Object.create(EventSimulator.constructor.prototype);

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
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

        const host = Object.create(EventSimulator.constructor.prototype);

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            async timeout() {},
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                if (data.type === 'mousedown') {
                    downEvent = event
                } else if (data.type === 'mousemove') {
                    moveIndex++;
                    moveIndex === 1 && lifecycle('drag:start', downEvent)
                } else if (data.type === 'mouseup') {
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

    test('a missing correlated drag:end stays a release failure after mouseup dispatch', async () => {
        let downEvent,
            moveIndex = 0,
            upCount   = 0;

        const host = Object.create(EventSimulator.constructor.prototype);

        Object.assign(host, {
            driveActive     : false,
            getDriveDocument: () => documentRef,
            async resolveMouseSensor() {
                return {currentElement: null, delay: 0, dragging: false, minDistance: 5}
            },
            async timeout() {},
            dispatchNative(data, onCreate) {
                const event = {type: data.type};

                onCreate?.(event);

                if (data.type === 'mousedown') {
                    downEvent = event
                } else if (data.type === 'mousemove') {
                    moveIndex++;
                    lifecycle(moveIndex === 1 ? 'drag:start' : 'drag:move', moveIndex === 1 ? downEvent : event)
                } else if (data.type === 'mouseup') {
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
        expect(upCount, 'terminal up plus one best-effort cleanup release').toBe(2)
    })
});
