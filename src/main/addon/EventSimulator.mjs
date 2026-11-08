import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Internal typed abort. It never crosses a worker boundary; {@link EventSimulator#driveDrag}
 * catches it and returns the public structured failure receipt.
 */
class DriveAbort extends Error {
    constructor(phase, code, message) {
        super(message);
        Object.assign(this, {code, phase})
    }
}

/**
 * The pointer event the platform fires ahead of the compatibility mouse event of a press, a move and
 * a release.
 * @type {Object<String,String>}
 */
const pointerTypeByMouseType = Object.freeze({
    mousedown: 'pointerdown',
    mousemove: 'pointermove',
    mouseup  : 'pointerup'
});

/**
 * @param {{x:Number,y:Number}} a
 * @param {{x:Number,y:Number}} b
 * @returns {Number}
 */
function pointDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * @param {{screen:Object,sourceEventClient:Object}} from
 * @param {{screen:Object,sourceEventClient:Object}} to
 * @param {Number} ratio
 * @returns {{screen:Object,sourceEventClient:Object}}
 */
function interpolatePoint(from, to, ratio) {
    const interpolate = (a, b) => a + (b - a) * ratio;

    return {
        screen: {
            x: interpolate(from.screen.x, to.screen.x),
            y: interpolate(from.screen.y, to.screen.y)
        },
        sourceEventClient: {
            x: interpolate(from.sourceEventClient.x, to.sourceEventClient.x),
            y: interpolate(from.sourceEventClient.y, to.sourceEventClient.y)
        }
    }
}

/**
 * @summary Samples one resolved polyline at a physical distance from its source.
 * @param {Object} source
 * @param {Object[]} path
 * @param {Number} distance
 * @returns {Object}
 */
function pointAtDistance(source, path, distance) {
    let prior     = source,
        traversed = 0;

    for (const point of path) {
        const segment = pointDistance(prior.sourceEventClient, point.sourceEventClient);

        if (traversed + segment >= distance) {
            return interpolatePoint(prior, point, segment === 0 ? 1 : (distance - traversed) / segment)
        }

        traversed += segment;
        prior      = point
    }

    return path.at(-1)
}

/**
 * @param {Object} source
 * @param {Object[]} path
 * @returns {Number}
 */
function pathLength(source, path) {
    let prior = source,
        total = 0;

    path.forEach(point => {
        total += pointDistance(prior.sourceEventClient, point.sourceEventClient);
        prior  = point
    });

    return total
}

/**
 * Main Thread Addon to simulate native DOM events.
 * Used by Neural Link for advanced E2E testing and automation.
 *
 * @class Neo.main.addon.EventSimulator
 * @extends Neo.main.addon.Base
 * @singleton
 */
class EventSimulator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.EventSimulator'
         * @protected
         */
        className: 'Neo.main.addon.EventSimulator',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: ['dispatch', 'driveDrag']
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * One Pointer sensor owns the source document. Overlapping automation transactions would both
     * observe the same physical lifecycle, so a second caller is refused rather than queued.
     * @member {Boolean} driveActive=false
     * @protected
     */
    driveActive = false

    /**
     * The one pointer identity every simulated mouse action carries. The drag sensor owns a gesture
     * by `pointerId`, so a press, its moves and its release must agree on one id, also across
     * separate `dispatch()` calls; and a real pointer, numbered upwards from 1 by the platform, must
     * never pass for the simulated one. The top of the platform's `long` range satisfies both.
     * @member {Number} syntheticPointerId=2147483647
     * @protected
     */
    syntheticPointerId = 2_147_483_647

    /**
     * @summary Dispatches a native DOM event on a target element.
     *
     * A mouse press, move or release arrives as the platform delivers a real one: its pointer event
     * first ({@link #dispatchMouseAction}). Callers that script raw `mousedown`/`mousemove`/`mouseup`
     * sequences (the Neural Link's `simulate_event`, tour and demo gesture drivers) thereby keep
     * driving the pointer-based drag sensor, and every mouse listener keeps its event.
     * @param {Object} data
     * @param {String} data.id - The DOM ID of the target element
     * @param {String} data.type - The event type (e.g., 'click', 'keydown', 'mousedown')
     * @param {Object} [data.options] - The event constructor options (e.g., {bubbles: true, key: 'Enter'})
     * @returns {Boolean} true if the event was dispatched successfully
     */
    dispatch(data) {
        return (pointerTypeByMouseType[data.type] ? this.dispatchMouseAction(data) : this.dispatchNative(data)).success
    }

    /**
     * @summary Dispatches one simulated mouse press, move or release the way the platform delivers a
     * real one: the pointer event, then its compatibility mouse event, on the same target.
     *
     * The drag sensor listens to Pointer Events, so a mouse event alone no longer reaches it, while
     * every mouse listener keeps receiving exactly the event it received before. The pointer event
     * carries {@link #syntheticPointerId} as a primary `mouse` pointer; a move changes no button, so
     * its pointer event reports `button` -1 where the mouse event reports 0.
     * @param {Object} data
     * @param {String|HTMLElement|Document} data.id
     * @param {Object} [data.options]
     * @param {String} data.type `mousedown`, `mousemove` or `mouseup`
     * @param {Function} [onCreate] Receives the pointer event, the one the sensor reports as `originalEvent`.
     * @returns {{event: PointerEvent|null, success: Boolean}} The pointer event, and whether both dispatched.
     * @protected
     */
    dispatchMouseAction({id, options={}, type}, onCreate) {
        let me      = this,
            pointer = me.dispatchNative({
                id,
                options: {
                    ...options,
                    button     : type === 'mousemove' ? -1 : (options.button ?? 0),
                    isPrimary  : true,
                    pointerId  : me.syntheticPointerId,
                    pointerType: 'mouse'
                },
                type: pointerTypeByMouseType[type]
            }, onCreate);

        if (!pointer.success) {
            return pointer
        }

        return {event: pointer.event, success: me.dispatchNative({id, options, type}).success}
    }

    /**
     * Constructs and dispatches one native event. The optional creation callback runs before
     * `dispatchEvent()`, allowing an atomic gesture transaction to correlate synchronous
     * `drag:*` lifecycle frames to this exact native Event object.
     * @param {Object} data
     * @param {String|HTMLElement|Document} data.id
     * @param {String} data.type
     * @param {Object} [data.options]
     * @param {Function} [onCreate]
     * @returns {{event: Event|null, success: Boolean}}
     * @protected
     */
    dispatchNative(data, onCreate) {
        const
            {id, type, options = {}} = data,
            node = DomAccess.getElement(id);

        if (!node) {
            console.warn(`EventSimulator: Target node with id '${id}' not found.`);
            return {event: null, success: false}
        }

        let event, ctor;

        // Default bubbling/cancelable if not specified
        if (options.bubbles === undefined)    options.bubbles    = true;
        if (options.cancelable === undefined) options.cancelable = true;

        // Determine the correct Event constructor based on the event type
        switch (type) {
            case 'click':
            case 'dblclick':
            case 'mousedown':
            case 'mouseenter':
            case 'mouseleave':
            case 'mousemove':
            case 'mouseout':
            case 'mouseover':
            case 'mouseup':
            case 'contextmenu':
                ctor = MouseEvent;
                break;
            case 'gotpointercapture':
            case 'lostpointercapture':
            case 'pointercancel':
            case 'pointerdown':
            case 'pointerenter':
            case 'pointerleave':
            case 'pointermove':
            case 'pointerout':
            case 'pointerover':
            case 'pointerup':
                ctor = PointerEvent;
                break;
            case 'keydown':
            case 'keypress':
            case 'keyup':
                ctor = KeyboardEvent;
                break;
            case 'focus':
            case 'blur':
            case 'focusin':
            case 'focusout':
                ctor = FocusEvent;
                break;
            case 'input':
            case 'change': // Change is technically a generic Event but InputEvent is often used for input
            case 'beforeinput':
                ctor = InputEvent;
                break;
            case 'wheel':
                ctor = WheelEvent;
                break;
            case 'touchstart':
            case 'touchend':
            case 'touchmove':
            case 'touchcancel':
                ctor = typeof TouchEvent !== 'undefined' ? TouchEvent : Event;
                break;
            case 'drag':
            case 'dragstart':
            case 'dragend':
            case 'dragenter':
            case 'dragover':
            case 'dragleave':
            case 'drop':
                ctor = DragEvent;
                break;
            default:
                ctor = Event;
        }

        try {
            // Special handling for DataTransfer in DragEvents if needed,
            // but for now we trust the options object to be serializable or simple.
            // Note: DataTransfer itself is not easily serializable from the worker.
            // We might need a helper to construct it if advanced drag simulation is required.

            event = new ctor(type, options);
            onCreate?.(event);
            node.dispatchEvent(event);
            return {event, success: true}
        } catch (e) {
            console.error(`EventSimulator: Failed to dispatch event '${type}' on '${id}'`, e);
            return {event: event || null, success: false}
        }
    }

    /**
     * @summary Resolves the exact Pointer sensor retained by the source Main realm's DragDrop addon.
     * @returns {Promise<Neo.main.draggable.sensor.Pointer|null>}
     * @protected
     */
    async resolvePointerSensor() {
        return await Neo.main.addon.DragDrop?.getPointerSensor?.() || null
    }

    /**
     * @summary Returns this Main realm's document. Kept as a seam so single-thread unit specs can
     * pin one listener surface even when another spec installs a different global document.
     * @returns {Document}
     * @protected
     */
    getDriveDocument() {
        return document
    }

    /**
     * @summary Executes and observes one complete Pointer-sensor drag in this source Main realm.
     *
     * The App worker has already resolved every node/window descriptor into global screen and
     * source-realm client coordinates. This method owns the one atomic physical transaction:
     * it reads the live sensor's mouse thresholds, presses on the source node, then uses the
     * stable document body for every move/release (the source node may disappear mid-gesture),
     * and correlates `drag:start/move/end` by native Event object identity. Every action is a
     * pointer event carrying {@link #syntheticPointerId}, followed by its compatibility mouse event
     * ({@link #dispatchMouseAction}). It never calls sensor lifecycle methods directly and never
     * claims a consumer-specific semantic outcome.
     *
     * @param {Object} request Fully resolved drive request.
     * @returns {Promise<Object>} Typed success/failure receipt; never throws for gesture outcomes.
     */
    async driveDrag({destination, durationMs, path, source, steps}) {
        const receipt = {
            cleanup : {attempted: false, succeeded: true},
            destination,
            dispatch: {down: false, moveCount: 0, up: false},
            observed: {ended: false, moveCount: 0, started: false},
            phase   : 'busy',
            released: false,
            sensor  : null,
            source,
            success : false
        };

        if (this.driveActive) {
            return {...receipt, error: {code: 'DRAG_BUSY', message: 'another atomic drag is already active in this window'}}
        }

        this.driveActive = true;

        let abort,
            downEvent = null,
            upEvent   = null,
            listenersInstalled = false,
            sensor,
            ownedMoveEvents = new WeakSet();

        const documentRef = this.getDriveDocument();

        const
            onStart = event => {
                if (event.detail?.originalEvent === downEvent) {
                    receipt.observed.started = true
                }
            },
            onMove = event => {
                if (ownedMoveEvents.has(event.detail?.originalEvent)) {
                    receipt.observed.moveCount++
                }
            },
            onEnd = event => {
                if (event.detail?.originalEvent === upEvent) {
                    receipt.observed.ended = true;
                    receipt.released       = true
                }
            },
            eventOptions = (point, buttons) => ({
                bubbles   : true,
                button    : 0,
                buttons,
                cancelable: true,
                clientX   : point.sourceEventClient.x,
                clientY   : point.sourceEventClient.y,
                screenX   : point.screen.x,
                screenY   : point.screen.y
            }),
            dispatchMove = point => {
                const result = this.dispatchMouseAction({
                    id     : 'document.body',
                    options: eventOptions(point, 1),
                    type   : 'mousemove'
                }, event => ownedMoveEvents.add(event));

                result.success && receipt.dispatch.moveCount++;

                return result.success
            },
            fail = (phase, code, message) => {
                throw new DriveAbort(phase, code, message)
            };

        try {
            sensor = await this.resolvePointerSensor();

            if (!sensor) {
                fail('busy', 'POINTER_SENSOR_UNAVAILABLE', 'the source window has no live Pointer sensor')
            }

            if (sensor.currentElement || sensor.dragging) {
                fail('busy', 'POINTER_SENSOR_BUSY', 'the source window Pointer sensor is already engaged')
            }

            const
                delayMs     = Number(sensor.delay),
                minDistance = Number(sensor.minDistance);

            receipt.sensor = {delayMs, minDistance};

            if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(minDistance) || minDistance < 0) {
                fail('arming', 'INVALID_SENSOR_THRESHOLDS', 'the live Pointer sensor thresholds are invalid')
            }

            if (!Array.isArray(path) || path.length === 0) {
                fail('arming', 'EMPTY_DRAG_PATH', 'the resolved drag path is empty')
            }

            const
                total       = pathLength(source, path),
                armDistance = minDistance + 1;

            if (total < armDistance) {
                fail('arming', 'PATH_TOO_SHORT', 'the resolved path does not cross the live Pointer minimum distance')
            }

            documentRef.addEventListener('drag:start', onStart, true);
            documentRef.addEventListener('drag:move',  onMove,  true);
            documentRef.addEventListener('drag:end',   onEnd,   true);
            listenersInstalled = true;

            const down = this.dispatchMouseAction({
                id     : source.targetId,
                options: eventOptions(source, 1),
                type   : 'mousedown'
            }, event => {downEvent = event});

            receipt.dispatch.down = down.success;

            if (!down.success) {
                fail('dispatch', 'POINTERDOWN_DISPATCH_FAILED', 'the source pointerdown could not be dispatched')
            }

            await this.timeout(delayMs);

            if (!dispatchMove(pointAtDistance(source, path, armDistance))) {
                fail('dispatch', 'ARMING_MOVE_DISPATCH_FAILED', 'the threshold-crossing move could not be dispatched')
            }

            if (!receipt.observed.started) {
                fail('arming', 'DRAG_NOT_ARMED', 'the live Pointer sensor emitted no correlated drag:start')
            }

            const interval = durationMs / steps;

            for (let index = 1; index <= steps; index++) {
                await this.timeout(interval);

                const distance = armDistance + (total - armDistance) * index / steps;

                if (!dispatchMove(pointAtDistance(source, path, distance))) {
                    fail('dispatch', 'MOVE_DISPATCH_FAILED', `post-arm move ${index} could not be dispatched`)
                }
            }

            if (receipt.observed.moveCount < 1) {
                fail('movement', 'DRAG_MOVE_NOT_OBSERVED', 'no correlated drag:move was observed')
            }

            const up = this.dispatchMouseAction({
                id     : 'document.body',
                options: eventOptions(path.at(-1), 0),
                type   : 'mouseup'
            }, event => {upEvent = event});

            receipt.dispatch.up = up.success;

            if (!up.success) {
                fail('release', 'POINTERUP_DISPATCH_FAILED', 'the terminal pointerup could not be dispatched')
            }

            if (!receipt.observed.ended) {
                fail('release', 'DRAG_END_NOT_OBSERVED', 'no correlated drag:end was observed')
            }

            receipt.phase   = 'complete';
            receipt.success = true
        } catch (error) {
            abort = error instanceof DriveAbort ? error :
                new DriveAbort('dispatch', 'DRIVE_DRAG_FAILED', error?.message || String(error))
        } finally {
            if (receipt.dispatch.down && !receipt.released) {
                receipt.cleanup.attempted = true;

                const point   = path?.at?.(-1) || source,
                      cleanup = this.dispatchMouseAction({
                          id     : 'document.body',
                          options: eventOptions(point, 0),
                          type   : 'mouseup'
                      }, event => {upEvent = event});

                receipt.cleanup.succeeded = cleanup.success;

                if (!cleanup.success) {
                    abort = new DriveAbort('cleanup', 'CLEANUP_RELEASE_FAILED', 'best-effort pointerup cleanup failed')
                }
            }

            if (listenersInstalled) {
                documentRef.removeEventListener('drag:start', onStart, true);
                documentRef.removeEventListener('drag:move',  onMove,  true);
                documentRef.removeEventListener('drag:end',   onEnd,   true)
            }

            this.driveActive = false
        }

        if (abort) {
            receipt.phase   = abort.phase;
            receipt.success = false;
            receipt.error   = {code: abort.code, message: abort.message}
        }

        return receipt
    }
}

export default Neo.setupClass(EventSimulator);
