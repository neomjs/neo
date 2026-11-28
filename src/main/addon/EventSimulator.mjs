import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Internal typed abort. The atomic input drivers convert it to a structured failure receipt.
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
 * The contact lists of a `TouchEvent`.
 * @type {String[]}
 */
const touchListNames = Object.freeze(['changedTouches', 'targetTouches', 'touches']);

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
            app: ['dispatch', 'driveDrag', 'driveGesture']
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Drag and touch replay share one input lock per owning Main document. An overlapping
     * automation transaction is refused rather than queued.
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
     *
     * A touch event's contact lists arrive from a worker as plain objects, so they become `Touch`
     * instances here first ({@link #createTouches}).
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

        let isTouch = false,
            event, ctor;

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
                isTouch = typeof TouchEvent !== 'undefined' && typeof Touch !== 'undefined';
                ctor    = isTouch ? TouchEvent : Event;
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

            event = new ctor(type, isTouch ? this.createTouches(options, node) : options);
            onCreate?.(event);
            node.dispatchEvent(event);
            return {event, success: true}
        } catch (e) {
            console.error(`EventSimulator: Failed to dispatch event '${type}' on '${id}'`, e);
            return {event: event || null, success: false}
        }
    }

    /**
     * @summary Turns the plain contacts of a touch event's lists into `Touch` instances.
     *
     * The `TouchEvent` constructor accepts `Touch` objects only, and a `Touch` needs an `EventTarget`
     * of the window that dispatches it, so only Main can build one. The dispatch node names that
     * window: its `Touch` constructor builds a contact and its document resolves a contact's `target`
     * id, so a node inside a same-origin iframe gets contacts of that iframe. Every given field passes
     * through unchanged, which keeps explicit screen coordinates authoritative. An entry that already
     * is a `Touch` stays as it is, whichever window built it: each window has its own constructor, so
     * the test is the object's brand.
     * @param {Object} options The event options; they are not modified
     * @param {HTMLElement|Document|Window} node The dispatch node, a contact's target unless it names its own
     * @returns {Object} The options, with each given contact list holding `Touch` instances
     * @throws {Error} For a contact whose `target` id resolves to no element
     * @protected
     */
    createTouches(options, node) {
        const
            doc    = node.ownerDocument || (node.nodeType === 9 ? node : node.document) || document,
            view   = doc.defaultView || globalThis,
            result = {...options};

        touchListNames.forEach(name => {
            if (Array.isArray(options[name])) {
                result[name] = options[name].map(contact => {
                    if (Object.prototype.toString.call(contact) === '[object Touch]') {
                        return contact
                    }

                    const target = contact?.target == null ? node : DomAccess.getElement(contact.target, doc);

                    if (!target) {
                        throw new Error(`Touch target with id '${contact.target}' not found.`)
                    }

                    return new view.Touch({...contact, target})
                })
            }
        });

        return result
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
     * @summary Executes a validated contact plan in this document and receipts actual TouchEvents.
     * The initial border box anchors client coordinates, and target identity is checked through the
     * last dispatch. Interruptions cancel the open contacts while this drive still owns the lock.
     * @param {Object} plan
     * @param {Object[]} plan.frames Normalized timed dispatch groups from InteractionService.
     * @param {String} plan.target Exact node id in this window.
     * @param {Number} plan.timeoutMs Whole replay execution deadline.
     * @param {String} plan.windowId Window selected by App routing.
     * @returns {Promise<Object>}
     */
    async driveGesture({frames, target, timeoutMs, windowId}) {
        const receipt = {
            cleanup             : {attempted: false, succeeded: true},
            observed            : [],
            observationAvailable: true,
            phases              : [],
            provider            : 'engine',
            sequences           : [],
            status              : 'busy',
            success             : false,
            terminal            : 'none',
            trusted             : null
        };

        if (this.driveActive) {
            return {...receipt, error: {code: 'GESTURE_BUSY', message: 'another atomic input drive owns this window'}}
        }

        this.driveActive = true;

        const controller = new AbortController(),
              {signal}   = controller,
              events     = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

        let documentRef, node, observer, deadline, expected, observed, start,
            active = new Map(),
            sequenceOpen = false;

        const onTouch = event => {
            if (event === expected) {
                observed = event
            }
        };

        const interrupt   = (code, message) => controller.abort(new DriveAbort('interrupted', code, message)),
              onPageHide  = () => interrupt('GESTURE_WINDOW_DEPARTED', 'the owning document is departing'),
              isLive      = () => node.isConnected && node.ownerDocument === documentRef && DomAccess.getElement(target, documentRef) === node,
              checkTarget = () => {
                  signal.throwIfAborted();

                  if (performance.now() - start >= timeoutMs) {
                      interrupt('GESTURE_TIMEOUT', 'the contact trace exceeded its execution deadline')
                  }

                  if (!isLive()) {
                      interrupt('GESTURE_TARGET_REMOVED', 'the original target was removed or replaced during replay')
                  }

                  signal.throwIfAborted()
              };

        // Keep the original target in each contact even if a cancellation has to travel through
        // the stable document body after the node detaches.
        const dispatch = (carrier, type, touches, changedTouches) => {
            expected = observed = null;
            const result = this.dispatchNative({
                id     : carrier,
                options: {changedTouches, composed: true, targetTouches: carrier === node ? touches : [], touches},
                type
            }, event => {expected = event});

            return result.success && observed instanceof documentRef.defaultView.TouchEvent ? observed : null
        };

        try {
            if (windowId !== Neo.worker.Manager?.windowId) {
                throw new DriveAbort('unavailable', 'GESTURE_WINDOW_MISMATCH', 'the request did not reach its named Main window')
            }

            documentRef = this.getDriveDocument();
            const view = documentRef.defaultView;

            if (typeof view?.Touch !== 'function' || typeof view.TouchEvent !== 'function') {
                throw new DriveAbort('unavailable', 'TOUCH_UNAVAILABLE', 'the owning window cannot construct TouchEvents')
            }

            node = DomAccess.getElement(target, documentRef);

            const bodyAlias = target === 'body' || target === 'document.body';

            if (!node?.isConnected || node.ownerDocument !== documentRef ||
                (bodyAlias ? node !== documentRef.body : DomAccess.getNodeId(node) !== target)) {
                throw new DriveAbort('unavailable', 'GESTURE_TARGET_UNAVAILABLE', 'the target is not live in the owning document')
            }

            const initialRect = node.getBoundingClientRect();

            if (!Number.isFinite(initialRect.left) || !Number.isFinite(initialRect.top) || !(initialRect.width > 0 && initialRect.height > 0)) {
                throw new DriveAbort('unavailable', 'GESTURE_TARGET_UNAVAILABLE', 'the target has no rendered border box')
            }

            const toTouch = ({id, identifier, x, y}) => {
                const clientX = initialRect.left + x,
                      clientY = initialRect.top  + y;

                if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
                    throw new DriveAbort('invalid', 'GESTURE_COORDINATE_OVERFLOW', 'a contact does not resolve to finite client coordinates')
                }

                return {clientX, clientY, id, identifier, target: node}
            },
            plan = frames.map(({t, events}) => ({
                t,
                events: events.map(({active, changed, terminal, type}) => ({
                    touches: active.map(toTouch), changed: changed.map(toTouch), terminal, type
                }))
            }));

            events.forEach(type => documentRef.addEventListener(type, onTouch, {capture: true, passive: true, signal}));
            view.addEventListener('pagehide', onPageHide, {signal});

            if (view.MutationObserver) {
                observer = new view.MutationObserver(() => {
                    if (!isLive()) interrupt('GESTURE_TARGET_REMOVED', 'the original target was removed or replaced during replay')
                });
                observer.observe(documentRef, {childList: true, subtree: true})
            }

            const verify = (list, expectedList) => Array.from(list, (touch, index) => {
                      const point = expectedList[index];

                      if (touch.identifier !== point?.identifier || touch.target !== node) {
                          throw new DriveAbort('interrupted', 'GESTURE_OBSERVATION_MISMATCH', 'the observed contacts do not match the dispatched identities')
                      }

                      return {clientX: touch.clientX, clientY: touch.clientY, id: point.id}
                  });

            receipt.status = 'interrupted';
            start = performance.now();
            deadline = setTimeout(() => interrupt('GESTURE_TIMEOUT', 'the contact trace exceeded its execution deadline'), timeoutMs);

            for (const [index, frame] of plan.entries()) {
                const wait = start + frame.t - performance.now();

                if (wait > 0) {
                    await this.timeout(wait, {signal})
                }

                checkTarget();

                const sample = {active: [], changed: [], events: [], frame: index, t: frame.t};

                for (const step of frame.events) {
                    checkTarget();

                    const {touches, changed} = step;

                    // A missing observation cannot prove a release. Keep previous contacts and
                    // remember every attempted down until a correlated event confirms the snapshot.
                    sequenceOpen = true;
                    touches.forEach(point => active.set(point.identifier, point));

                    const event = dispatch(node, step.type, touches, changed);

                    if (!event) {
                        throw new DriveAbort('interrupted', 'GESTURE_EVENT_NOT_OBSERVED', `no correlated ${step.type} was observed`)
                    }

                    if (event.touches.length !== touches.length || event.changedTouches.length !== changed.length) {
                        throw new DriveAbort('interrupted', 'GESTURE_OBSERVATION_MISMATCH', 'the observed contact counts differ from the dispatched frame')
                    }

                    const activePoints = verify(event.touches, touches), changedPoints = verify(event.changedTouches, changed);

                    active = new Map(touches.map(point => [point.identifier, point]));
                    if (!sample.events.length) receipt.observed.push(sample);

                    sample.active = activePoints.map(point => point.id);
                    sample.changed.push(...changedPoints.map(point => point.id));
                    sample.events.push({active: activePoints, changed: changedPoints, elapsedMs: performance.now() - start, type: event.type});
                    receipt.trusted = event.isTrusted;

                    if (step.terminal) {
                        sequenceOpen = false;
                        receipt.sequences.push(step.terminal);
                        receipt.terminal = step.terminal
                    }
                }
            }

            receipt.status  = 'complete';
            receipt.success = true
        } catch (error) {
            const cause = signal.reason ?? error,
                  code  = cause?.code ?? 'GESTURE_DISPATCH_FAILED';

            receipt.error = {code, message: cause?.message || String(cause)};
            receipt.status = cause?.phase ?? 'interrupted';

            if (sequenceOpen) {
                receipt.sequences.push('none');
                receipt.terminal = 'none'
            }
        } finally {
            clearTimeout(deadline);
            observer?.disconnect();

            try {
                if (active.size) {
                    receipt.cleanup.attempted = true;
                    const carrier = node.isConnected ? node : documentRef.body || documentRef,
                          changed = [...active.values()];

                    // The deadline may have aborted the regular capture listeners. Install one
                    // cleanup observer independently, then always remove it before releasing the lock.
                    documentRef.addEventListener('touchcancel', onTouch, true);
                    try {
                        const cancellation = dispatch(carrier, 'touchcancel', [], changed);
                        receipt.cleanup.succeeded = cancellation?.touches.length === 0 &&
                            cancellation.changedTouches.length === changed.length && Array.from(cancellation.changedTouches)
                                .every((touch, index) => touch.identifier === changed[index].identifier && touch.target === node)
                    } finally {
                        documentRef.removeEventListener('touchcancel', onTouch, true)
                    }
                }
            } catch {
                receipt.cleanup.succeeded = false
            } finally {
                controller.abort();
                this.driveActive = false
            }
        }

        return receipt
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
