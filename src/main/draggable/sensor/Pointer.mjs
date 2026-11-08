import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

/**
 * @summary One Pointer Events sensor for mouse, touch and pen: it claims a press on a drag target,
 * arms the drag past its delay and distance threshold, and owns the pointer until its terminal.
 *
 * Two windows, two mechanisms. Before the threshold a press may still be a click on its own element,
 * so the pointer stays uncaptured and `neo-drag-active` (the iframe shield's hook) carries the
 * gesture. From `drag:start` to the terminal the sensor holds pointer capture on
 * `document.documentElement`: every later event of the pointer reaches the document whatever lies
 * under it, an iframe included, and its `pointerup` or `pointercancel` is guaranteed to arrive. The
 * root, never the pressed node: a gesture can remove that node, and removing a captor releases it.
 *
 * A captured event names the root, so moves and the release carry `eventPath`, the hit-test path the
 * uncaptured event would have named; `Neo.main.addon.DragDrop` reads it instead. Synthetic input
 * carries a pointer id the platform does not track, so its capture is refused and the document
 * listeners stay the transport.
 *
 * @class Neo.main.draggable.sensor.Pointer
 * @extends Neo.main.draggable.sensor.Base
 */
class Pointer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.draggable.sensor.Pointer'
         * @protected
         */
        className: 'Neo.main.draggable.sensor.Pointer',
        /**
         * Delay in ms before a mouse or pen drag starts. Useful to avoid drag OPs on double-clicks.
         * @member {Number} delay=100
         */
        delay: 100,
        /**
         * @member {Boolean} dragging=false
         * @protected
         */
        dragging: false,
        /**
         * True while the gesture holds pointer capture on the document root.
         * @member {Boolean} hasCapture=false
         * @protected
         */
        hasCapture: false,
        /**
         * Distance in px a mouse or pen pointer travels before a drag starts.
         * @member {Number} minDistance=5
         */
        minDistance: 5,
        /**
         * The gesture's last known position, as {@link #getEventPoint} reports it: where a gesture
         * ends that has no position of its own.
         * @member {Object|null} point=null
         * @protected
         */
        point: null,
        /**
         * The pointer that owns the gesture: no other pointer moves or ends it.
         * @member {Number|null} pointerId=null
         * @protected
         */
        pointerId: null,
        /**
         * @member {Number} pointerDownTime=0
         * @protected
         */
        pointerDownTime: 0,
        /**
         * @member {Number|null} pointerDownTimeout=null
         * @protected
         */
        pointerDownTimeout: null,
        /**
         * `mouse`, `pen` or `touch`
         * @member {String|null} pointerType=null
         * @protected
         */
        pointerType: null,
        /**
         * Delay in ms before a touch drag starts: a long press arms it, a release before it is a tap.
         * @member {Number} touchDelay=200
         */
        touchDelay: 200,
        /**
         * Distance in px a touch pointer travels before a drag starts. Zero: holding still arms it.
         * @member {Number} touchMinDistance=0
         */
        touchMinDistance: 0
    }

    /**
     * @summary Binds the listeners whose identity add/removeEventListener must share.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.bindMethods(this, [
            'onDistanceChange',
            'onPointerCancel',
            'onPointerDown',
            'onPointerMove',
            'onPointerUp',
            'onTouchMove',
            'suppressEvent'
        ])
    }

    /**
     * @summary Listens for presses and, on a touch device, installs the touch scroll lock before any
     * touch begins: WebKit only honours a cancelable `touchmove` listener that exists when the touch
     * starts, and elsewhere a blocking `touchmove` listener only costs.
     */
    attach() {
        let me = this;

        document.addEventListener('pointerdown', me.onPointerDown, {capture: true});
        Neo.config.hasTouchEvents && globalThis.window?.addEventListener('touchmove', me.onTouchMove, {passive: false})
    }

    /**
     * @summary Takes pointer capture on the document root, best effort: `setPointerCapture()` throws
     * for a pointer the platform does not track, as every synthetic one is, and the document
     * listeners then stay the transport.
     * @protected
     */
    capturePointer() {
        let me   = this,
            root = document.documentElement;

        try {
            root.setPointerCapture(me.pointerId);
            me.hasCapture = Boolean(root.hasPointerCapture(me.pointerId))
        } catch {
            me.hasCapture = false
        }
    }

    /**
     * @summary Removes the listeners {@link #attach} installed.
     */
    detach() {
        let me = this;

        document.removeEventListener('pointerdown', me.onPointerDown, {capture: true});
        globalThis.window?.removeEventListener('touchmove', me.onTouchMove)
    }

    /**
     * @summary Ends the physical gesture: releases the selection guard and the gesture listeners,
     * emits `drag:end` for an engaged drag, and releases capture.
     *
     * Every terminal arrives here: `pointerup`, `pointercancel`, the pointer's own move reporting the
     * primary button gone, and a second press of the same pointer. A cancel or a press carries no
     * usable position, so those end at the last known one.
     * @param {PointerEvent|Object} event The terminal event.
     * @protected
     */
    endGesture(event) {
        let me = this;

        clearTimeout(me.pointerDownTimeout);

        document.body?.classList?.remove('neo-drag-active');

        document.removeEventListener('dragstart',     me.suppressEvent);
        document.removeEventListener('pointercancel', me.onPointerCancel);
        document.removeEventListener('pointermove',   me.onDistanceChange);
        document.removeEventListener('pointerup',     me.onPointerUp);

        if (me.dragging) {
            let positioned = event.type === 'pointerup' || event.type === 'pointermove';

            me.triggerStream('drag:end', event, positioned ? me.getEventPoint(event) : me.point);

            document.removeEventListener('contextmenu', me.suppressEvent, {capture: true});
            document.removeEventListener('pointermove', me.onPointerMove)
        }

        me.releaseCapture();

        // The pressed element belongs to the physical bracket, not the logical drag: a click on a drag
        // target must leave the sensor idle, or `EventSimulator#driveDrag` refuses the next drive as busy.
        Object.assign(me, {
            currentElement : null,
            dragging       : false,
            point          : null,
            pointerDownTime: 0,
            pointerId      : null,
            pointerType    : null,
            startEvent     : null
        })
    }

    /**
     * @summary The coordinates the drag stream reports for an event. Mouse and pen report what their
     * compatibility mouse event carries, the fractional pointer position floored to whole pixels, as
     * the stream always has; touch keeps the precision of its touch point.
     * @param {PointerEvent|Object} event
     * @param {String|null} [pointerType=this.pointerType]
     * @returns {{clientX: Number, clientY: Number, pageX: Number, pageY: Number, screenX: Number, screenY: Number}}
     * @protected
     */
    getEventPoint(event, pointerType=this.pointerType) {
        const round = pointerType === 'touch' ? value => value : Math.floor;

        return {
            clientX: round(event.clientX),
            clientY: round(event.clientY),
            pageX  : round(event.pageX),
            pageY  : round(event.pageY),
            screenX: round(event.screenX),
            screenY: round(event.screenY)
        }
    }

    /**
     * @summary The composed path an uncaptured event at the element would carry.
     * @param {HTMLElement} element The element under the pointer.
     * @returns {Array<EventTarget>}
     * @protected
     */
    getHitTestPath(element) {
        let path = DomEvents.getPathFromElement(element);

        globalThis.window && path.push(globalThis.window);

        return path
    }

    /**
     * @summary The arming thresholds of a pointer type: touch reads {@link #touchDelay} and
     * {@link #touchMinDistance}, mouse and pen read {@link #delay} and {@link #minDistance}.
     * @param {String|null} pointerType
     * @returns {{delay: Number, minDistance: Number}}
     * @protected
     */
    getThresholds(pointerType) {
        let me = this;

        return pointerType === 'touch'
            ? {delay: me.touchDelay, minDistance: me.touchMinDistance}
            : {delay: me.delay,      minDistance: me.minDistance}
    }

    /**
     * @summary Lost-release recovery: a move reporting the primary button gone ends the gesture as
     * the release the sensor never heard.
     *
     * TRUSTED streams only. Synthetic events may lack the buttons bitmask (it reads 0) and always
     * deliver their own release; the delay-timeout re-entry carries no `buttons` at all. Specs stub
     * {@link #isTrustedEvent} alone, so the buttons logic stays under test.
     * @param {PointerEvent|Object} event
     * @returns {Boolean}
     * @protected
     */
    isLostReleaseSignal(event) {
        return this.isTrustedEvent(event) && event.buttons !== undefined && (event.buttons & 1) === 0
    }

    /**
     * @summary The trust read as its own seam: `isTrusted` cannot be forged, and the unit harness
     * cannot reach the positive branch of {@link #isLostReleaseSignal} without stubbing it.
     * @param {PointerEvent|Object} event
     * @returns {Boolean}
     * @protected
     */
    isTrustedEvent(event) {
        return Boolean(event.isTrusted)
    }

    /**
     * @summary Starts the drag once both the delay and the distance of the pointer's type are met.
     * @param {PointerEvent|Object} event An object when the pointerDownTimeout re-enters
     * @protected
     */
    onDistanceChange(event) {
        let me = this;

        if (me.currentElement && me.ownsEvent(event)) {
            if (me.isLostReleaseSignal(event)) {
                me.endGesture(event);
                return
            }

            const
                point                = me.getEventPoint(event),
                start                = me.getEventPoint(me.startEvent),
                {delay, minDistance} = me.getThresholds(me.pointerType),
                timeElapsed          = Date.now() - me.pointerDownTime,
                distanceTravelled    = DomEvents.getDistance(start.pageX, start.pageY, point.pageX, point.pageY) || 0;

            me.point = point;

            if (timeElapsed >= delay && distanceTravelled >= minDistance) {
                clearTimeout(me.pointerDownTimeout);
                document.removeEventListener('pointermove', me.onDistanceChange);
                me.startDrag()
            }
        }
    }

    /**
     * @summary `pointercancel` is a terminal like `pointerup`: the platform took the pointer away.
     * @param {PointerEvent} event
     * @protected
     */
    onPointerCancel(event) {
        this.ownsEvent(event) && this.endGesture(event)
    }

    /**
     * @summary Claims a primary press on a drag target for the synthetic pipeline.
     * @param {PointerEvent} event
     * @protected
     */
    onPointerDown(event) {
        let me = this;

        if (me.currentElement) {
            // Another pointer never disturbs the open gesture. The same pointer pressing again proves
            // its release was lost: the stale gesture ends before this one.
            if (!me.ownsEvent(event)) {
                return
            }

            me.endGesture(event)
        }

        if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            let target = DomEvents.testPathInclusion(event, me.dragTargetClasses);

            // see: https://github.com/neomjs/neo/issues/2669
            if (!event.path) {
                event.path = event.composedPath()
            }

            // The partition with `Neo.main.addon.NativeDragSource`: a press on a registered native
            // source is native, even under a `neo-draggable` ancestor. Claiming it would suppress its
            // `dragstart` and stamp the shield over the iframe the native drag exists to reach.
            if (target && Neo.main?.addon?.NativeDragSource?.claimsEvent?.(event)) {
                return
            }

            if (target) {
                const
                    {pointerId, pointerType} = event,
                    {delay}                  = me.getThresholds(pointerType);

                Object.assign(me, {
                    currentElement : target.node,
                    point          : me.getEventPoint(event, pointerType),
                    pointerDownTime: Date.now(),
                    pointerId,
                    pointerType,
                    startEvent     : event
                });

                // Brackets the PHYSICAL gesture: text selection stays off until the pointer's terminal,
                // and the iframe shield keyed on the class covers the uncaptured pre-threshold window.
                // Guarded: bare test harnesses may stub `document` without a body/classList.
                document.body?.classList?.add('neo-drag-active');

                document.addEventListener('dragstart',     me.suppressEvent);
                document.addEventListener('pointercancel', me.onPointerCancel);
                document.addEventListener('pointermove',   me.onDistanceChange);
                document.addEventListener('pointerup',     me.onPointerUp);

                me.pointerDownTimeout = setTimeout(() => {
                    me.onDistanceChange({...me.point, pointerId})
                }, delay)
            }
        }
    }

    /**
     * @summary Streams `drag:move` for the engaged drag, or ends it on a lost release.
     * @param {PointerEvent} event
     * @protected
     */
    onPointerMove(event) {
        let me = this;

        if (!me.ownsEvent(event)) {
            return
        }

        if (me.isLostReleaseSignal(event)) {
            me.endGesture(event);
            return
        }

        if (me.dragging) {
            me.point = me.getEventPoint(event);
            me.triggerStream('drag:move', event, me.point)
        }
    }

    /**
     * @summary The release: `pointerup` fires once no button is left down, whichever went up last.
     * @param {PointerEvent} event
     * @protected
     */
    onPointerUp(event) {
        this.ownsEvent(event) && this.endGesture(event)
    }

    /**
     * @summary The touch scroll lock: an engaged touch drag never pans the page. Before the threshold
     * a touch may still scroll, and a scroll that wins ends the claim through `pointercancel`.
     * @param {TouchEvent} event
     * @protected
     */
    onTouchMove(event) {
        let me = this;

        if (me.dragging && me.pointerType === 'touch' && event.cancelable) {
            event.preventDefault()
        }
    }

    /**
     * @summary Whether an event belongs to the gesture's own pointer.
     * @param {PointerEvent|Object} event
     * @returns {Boolean}
     * @protected
     */
    ownsEvent(event) {
        return event.pointerId === this.pointerId
    }

    /**
     * @summary Releases the capture {@link #capturePointer} took. A pointer the platform no longer
     * tracks throws here, and its capture is then already released.
     * @protected
     */
    releaseCapture() {
        let me = this;

        if (me.hasCapture) {
            me.hasCapture = false;

            try {
                document.documentElement.releasePointerCapture(me.pointerId)
            } catch {}
        }
    }

    /**
     * @summary Opens the drag: emits `drag:start` for the press, streams the pointer's moves, and takes
     * pointer capture.
     *
     * Capture starts here and never at the press: it retargets the pointer's later events, so a press
     * that never becomes a drag would stop clicking its own element, and `neo-draggable` is worn by
     * tab headers, buttons and splitter handles. Past the threshold no click is at stake.
     * @protected
     */
    startDrag() {
        let me                                   = this,
            element                              = me.currentElement,
            {startEvent}                         = me,
            {clientX, clientY, screenX, screenY} = me.getEventPoint(startEvent);

        me.trigger(element, {
            clientX,
            clientY,
            element,
            originalEvent: startEvent,
            path         : startEvent.path || startEvent.composedPath(),
            screenX,
            screenY,
            target       : startEvent.target,
            type         : 'drag:start'
        });

        me.dragging = true;

        document.addEventListener('contextmenu', me.suppressEvent, {capture: true});
        document.addEventListener('pointermove', me.onPointerMove);

        me.capturePointer()
    }

    /**
     * @summary Cancels a native default competing with the claimed gesture: `dragstart` from the press
     * on, `contextmenu` while engaged. A touch gesture also stops it propagating, so a long press
     * opens no context menu under the dragging finger.
     * @param {Event} event
     * @protected
     */
    suppressEvent(event) {
        event.preventDefault();
        this.pointerType === 'touch' && event.stopPropagation()
    }

    /**
     * @summary Emits one `drag:move` or `drag:end` of the engaged drag at a point; while capture is
     * held, with the hit-test `eventPath`.
     * @param {String} type `drag:move` or `drag:end`
     * @param {PointerEvent|Object} event The pointer event carried as `originalEvent`
     * @param {Object} point The position, as {@link #getEventPoint} reports it
     * @protected
     */
    triggerStream(type, event, point) {
        let me                                   = this,
            element                              = me.currentElement,
            {clientX, clientY, screenX, screenY} = point,
            target                               = document.elementFromPoint(clientX, clientY),
            detail                               = {
                clientX,
                clientY,
                element,
                originalEvent: event,
                path         : me.startEvent.path || me.startEvent.composedPath(),
                screenX,
                screenY,
                target,
                type
            };

        if (me.hasCapture && target) {
            detail.eventPath = me.getHitTestPath(target)
        }

        me.trigger(element, detail)
    }
}

export default Neo.setupClass(Pointer);
