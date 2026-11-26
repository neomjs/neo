import Base      from './Base.mjs';
import DomEvents from '../DomEvents.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Drag Scrolling.
 *
 * This addon moves the drag-to-scroll logic from the App Worker to the Main Thread.
 * By handling `mousemove` and `touchmove` events directly in the UI thread, it eliminates the latency
 * and overhead of passing high-frequency messages between workers, resulting in
 * smoother, native-like scrolling performance for both mouse and touch users.
 *
 * It listens for `mousedown` or `touchstart` on the grid body, then attaches global `mousemove` / `touchmove` and
 * `mouseup` / `touchend` listeners to handle the drag operation, supporting "over-drag" (scrolling
 * continues even if the mouse / finger leaves the grid bounds).
 *
 * **Kinetic Scrolling:**
 * The addon implements physics-based inertial scrolling. When a user releases a drag with sufficient velocity,
 * the grid continues to scroll with a decay animation, simulating momentum and friction.
 *
 * @class Neo.main.addon.GridDragScroll
 * @extends Neo.main.addon.Base
 */
class GridDragScroll extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.GridDragScroll'
         * @protected
         */
        className: 'Neo.main.addon.GridDragScroll',
        /**
         * Delay in ms before a drag OP starts.
         * Useful to avoid drag OPs on double-clicks.
         * @member {Number} delay=100
         */
        delay: 100,
        /**
         * @member {Number} minDistance=5
         */
        minDistance: 5,
        /**
         * @member {Number} mouseDownTime=0
         */
        mouseDownTime: 0,
        /**
         * @member {Number|null} mouseDownTimeout=null
         */
        mouseDownTimeout: null,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'register',
                'unregister'
            ]
        }
    }

    /**
     * @member {Object|null} activeDrag=null
     * @protected
     */
    activeDrag = null
    /**
     * @member {Object|null} monitorDrag=null
     * @protected
     */
    monitorDrag = null
    /**
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.bindMethods(me, ['onDragStart', 'onMonitorEnd', 'onMonitorMove', 'onNativeDragStart']);

        // A native HTML5 drag ends the mouse-event stream of the gesture it grew out of: from
        // `dragstart` on, the browser delivers only `drag*` events, so the `mouseup` a monitor or an
        // active drag waits for never arrives. Document level, capture, once for the page — the drag
        // may start on a registered row or on any foreign draggable node.
        document.addEventListener('dragstart', me.onNativeDragStart, {capture: true})
    }

    /**
     * @param {Object} data
     */
    autoScroll(data) {
        let me                                 = this,
            {friction, registration, velocity} = data;

        // The tail has died: the addon holds no gesture any more. Leaving the last frame handle in
        // `activeDrag` would make every later reader — `unregister`, a witness, a peer addon — see a
        // drag that is not there.
        if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) {
            me.activeDrag = null;
            return
        }

        let newScrollLeft = registration.containerElement ? registration.containerElement.scrollLeft - velocity.x : undefined,
            newScrollTop  = registration.bodyElement      ? registration.bodyElement.scrollTop       - velocity.y : undefined;

        if (newScrollLeft !== undefined) registration.containerElement.scrollLeft = newScrollLeft;
        if (newScrollTop  !== undefined) registration.bodyElement.scrollTop       = newScrollTop;

        velocity.x *= friction;
        velocity.y *= friction;

        me.activeDrag = {
            id       : data.id,
            animation: requestAnimationFrame(me.autoScroll.bind(me, data))
        }
    }

    /**
     * @summary Finds the touch entry matching `identifier` in a `TouchList` or array.
     * @param {TouchList|Object[]} [touches]
     * @param {Number|null} [identifier]
     * @returns {Touch|Object|null}
     */
    findTouch(touches, identifier) {
        if (touches && identifier !== null && identifier !== undefined) {
            for (let i = 0, len = touches.length; i < len; i++) {
                if (touches[i].identifier === identifier) {
                    return touches[i]
                }
            }
        }

        return null
    }

    /**
     * @summary Extracts client coordinates for mouse, tracked touch, or delay-timeout events.
     * @param {MouseEvent|TouchEvent|Object} event
     * @param {Number|null} [touchId=null]
     * @returns {{x: Number, y: Number}|null}
     */
    getEventCoordinates(event, touchId=null) {
        if (event.type === 'timeout') {
            return {x: event.x, y: event.y}
        }

        if (event.type?.startsWith('touch')) {
            let touch = touchId !== null
                ? (this.findTouch(event.touches, touchId) || this.findTouch(event.changedTouches, touchId))
                : (event.touches?.[0] || event.changedTouches?.[0]);

            return touch ? {x: touch.clientX, y: touch.clientY} : null
        }

        return {x: event.clientX, y: event.clientY}
    }

    /**
     * @summary Cancels an active touch drag without momentum when the browser cancels the contact or pointer stream.
     * @param {PointerEvent|TouchEvent} event
     */
    onDragCancel(event) {
        if (event?.type === 'pointercancel' && event.pointerType && event.pointerType !== 'touch') {
            return
        }

        this.activeDrag?.listeners && this.cancelActiveDrag()
    }

    /**
     * @summary Ends tracking and starts a kinetic tail only when recent samples span a positive time interval.
     * @param {MouseEvent|TouchEvent} event
     */
    onDragEnd(event) {
        let me = this;

        if (me.activeDrag?.listeners) {
            if (event.type === 'mouseup') {
                document.body.style.removeProperty('cursor');
                document.removeEventListener('mousemove', me.activeDrag.listeners.move, {capture: true});
                document.removeEventListener('mouseup', me.activeDrag.listeners.end, {capture: true})
            } else {
                if ((event.touches?.length ?? 0) > 0 || (me.activeDrag.touchId !== null && !me.findTouch(event.changedTouches, me.activeDrag.touchId))) {
                    me.cancelActiveDrag();
                    return
                }

                document.removeEventListener('touchmove', me.activeDrag.listeners.move, {
                    capture: true,
                    passive: false
                });
                document.removeEventListener('touchend',      me.activeDrag.listeners.end,    {capture: true});
                document.removeEventListener('touchcancel',   me.activeDrag.listeners.cancel, {capture: true});
                document.removeEventListener('pointercancel', me.activeDrag.listeners.cancel, {capture: true})
            }

            const {history, id, registration} = me.activeDrag,
                  cutoff                      = Date.now() - 100,
                  relevantMoves               = history.filter(item => item.time > cutoff),
                  oldest                      = relevantMoves[0],
                  newest                      = relevantMoves.at(-1);

            // Multiple moves can land in the same millisecond; only elapsed time yields a release velocity.
            if (newest && newest.time > oldest.time) {
                const dt = newest.time - oldest.time,
                      vX = (newest.x - oldest.x) / dt * 16, // px per frame (approx 16ms)
                      vY = (newest.y - oldest.y) / dt * 16;

                // Simple exponential decay friction
                // 0.95 feels like a good balance between "slippery" and "controlled"
                me.autoScroll({
                    friction: 0.95,
                    id,
                    registration,
                    velocity: {x: vX, y: vY}
                })
            } else {
                me.activeDrag = null
            }
        }
    }

    /**
     * @param {MouseEvent|TouchEvent} event
     */
    onDragMove(event) {
        let me   = this,
            drag = me.activeDrag;

        if (!drag?.registration) {
            return
        }

        let coords = me.getEventCoordinates(event, drag.touchId ?? null);

        if (!coords) {
            return
        }

        if (event.type === 'touchmove') {
            if (event.cancelable === false) {
                me.cancelActiveDrag();
                return
            }

            event.preventDefault() // Disable native scrolling
        }

        let {registration} = drag,
            {x, y}         = coords,
            deltaX         = drag.lastX - x,
            deltaY         = drag.lastY - y;

        let newScrollLeft = deltaX !== 0 && registration.containerElement ? registration.containerElement.scrollLeft + deltaX : undefined,
            newScrollTop  = deltaY !== 0 && registration.bodyElement      ? registration.bodyElement.scrollTop       + deltaY : undefined;

        if (newScrollLeft !== undefined) registration.containerElement.scrollLeft = newScrollLeft;
        if (newScrollTop  !== undefined) registration.bodyElement.scrollTop       = newScrollTop;

        drag.lastX = x;
        drag.lastY = y;

        drag.history.push({time: Date.now(), x, y});

        // Keep history size manageable
        if (drag.history.length > 10) {
            drag.history.shift()
        }
    }

    /**
     * @param {MouseEvent|TouchEvent} event
     */
    onDragStart(event) {
        // Ignore right clicks
        if (event.type === 'mousedown' && event.button !== 0) {
            return
        }

        let me = this;

        if (event.type === 'touchstart') {
            if ((event.touches?.length ?? 0) > 1) {
                me.monitorDrag && me.onMonitorEnd(event);
                return
            }

            if (me.activeDrag?.listeners) {
                return
            }
        }

        let path = event.composedPath(),
            id, registration;

        // Stop any active animation
        if (me.activeDrag?.animation) {
            cancelAnimationFrame(me.activeDrag.animation);
            me.activeDrag = null
        }

        // The innermost registered view in the path owns the press: a grid nested in another grid's view has both
        // views in its path, and the grid pressed is the grid scrolled. The path runs from the target outwards.
        for (const el of path) {
            for (const [key, reg] of me.registrations) {
                if (reg.bodyElement === el) {
                    id           = key;
                    registration = reg;
                    break
                }
            }

            if (registration) {
                break
            }
        }

        // Every registered view in the path runs this capture listener for the same press. Only the owning view's
        // run handles it, so one press arms one monitor and one timer.
        if (!registration || event.currentTarget !== registration.bodyElement) {
            return
        }

        // Only a press on the owning grid's own body (its rows, or the body element itself) starts a drag: the
        // nearest view around the pressed row or body must be the registered one. Content a view hosts outside its
        // bodies (an input a component renders, a nested grid without drag scrolling) keeps its native behaviour.
        let bodyIndex = path.findIndex(el => el.classList?.contains('neo-grid-row') || el.classList?.contains('neo-grid-body')),
            view      = bodyIndex < 0 ? null : path.slice(bodyIndex).find(el => el.classList?.contains('neo-grid-view'));

        if (view !== registration.bodyElement) {
            return
        }

        // Replicate the check from ScrollManager: ignore if clicking on a draggable element
        // We check for 'neo-draggable' class on the path. A press inside a cell editor selects text in its input.
        if (path.some(el => el.classList?.contains('neo-draggable') || el.classList?.contains('neo-grid-editor'))) {
            return
        }

        // Ignore mousedown / touchstart on the proxy scrollbar overlays. The dedicated
        // grid.VerticalScrollbar / grid.HorizontalScrollbar components are discrete overlay
        // nodes, so a thumb-drag is detected directly via the event path instead of
        // bounding-box math against the body element.
        if (path.some(el => el.classList?.contains('neo-grid-vertical-scrollbar') || el.classList?.contains('neo-grid-horizontal-scrollbar'))) {
            return
        }

        // The mousedown default MUST survive here: it is the browser's focus move to the nearest
        // focusable ancestor — the grid View, the single focus anchor (`tabIndex: '-1'`) that the
        // focus-gated dock header actions, the rail reveal's focus-leave dismissal and the cell
        // editing key registry all depend on. Cancelling it "to prevent text selection" kept DOM
        // focus wherever it was before every grid click. Selection suppression belongs to CSS and
        // already lives there: `.neo-grid-body.neo-mouse-drag-scroll {user-select: none}`.

        let touch   = event.type === 'touchstart' ? (event.changedTouches?.[0] || event.touches?.[0] || null) : null,
            touchId = touch?.identifier ?? null,
            coords  = me.getEventCoordinates(event, touchId);

        if (!coords) {
            return
        }

        me.monitorDrag && me.onMonitorEnd(event);
        me.activeDrag  && me.cancelActiveDrag();

        let {x, y} = coords;

        me.monitorDrag = {
            id,
            inputType: event.type === 'mousedown' ? 'mouse' : 'touch',
            lastX    : x,
            lastY    : y,
            registration,
            startX   : x,
            startY   : y,
            touchId
        };

        me.mouseDownTime = Date.now();

        if (event.type === 'mousedown') {
            document.addEventListener('mousemove', me.onMonitorMove, {capture: true});
            document.addEventListener('mouseup',   me.onMonitorEnd,  {capture: true})
        } else {
            document.addEventListener('touchmove',     me.onMonitorMove, {capture: true, passive: false});
            document.addEventListener('touchend',      me.onMonitorEnd,  {capture: true});
            document.addEventListener('touchcancel',   me.onMonitorEnd,  {capture: true});
            document.addEventListener('pointercancel', me.onMonitorEnd,  {capture: true})
        }

        me.mouseDownTimeout = setTimeout(() => {
            if (me.monitorDrag) {
                me.onMonitorMove({
                    type: 'timeout',
                    x   : me.monitorDrag.lastX,
                    y   : me.monitorDrag.lastY
                })
            }
        }, me.delay)
    }

    /**
     * Detect change in distance, starting drag when both delay and distance requirements are met
     * @param {MouseEvent|TouchEvent|Object} event - Object in case it does get trigger via the mouseDownTimeout
     */
    onMonitorMove(event) {
        let me      = this,
            monitor = me.monitorDrag;

        if (!monitor) {
            return
        }

        if (event.type === 'touchmove' && ((event.touches?.length ?? 0) > 1 || event.cancelable === false)) {
            me.onMonitorEnd(event);
            return
        }

        let coords = me.getEventCoordinates(event, monitor.touchId);

        if (!coords) {
            return
        }

        let {x, y}      = coords,
            timeElapsed = Date.now() - me.mouseDownTime,
            dist        = DomEvents.getDistance(monitor.startX, monitor.startY, x, y) || 0;

        monitor.lastX = x;
        monitor.lastY = y;

        if (timeElapsed >= me.delay && dist >= me.minDistance) {
            if (event.type === 'touchmove' && event.cancelable !== false) {
                event.preventDefault()
            }

            me.onMonitorEnd(event);
            me.startDrag(monitor, x, y, monitor.inputType || (event.type.startsWith('touch') ? 'touch' : 'mouse'))
        }
    }

    /**
     * @param {MouseEvent|PointerEvent|TouchEvent} [event]
     */
    onMonitorEnd(event) {
        let me = this;

        if (me.monitorDrag?.inputType === 'touch' && event?.type === 'pointercancel' && event.pointerType && event.pointerType !== 'touch') {
            return
        }

        clearTimeout(me.mouseDownTimeout);
        me.monitorDrag = null;

        document.removeEventListener('mousemove',     me.onMonitorMove, {capture: true});
        document.removeEventListener('mouseup',       me.onMonitorEnd,  {capture: true});
        document.removeEventListener('touchmove',     me.onMonitorMove, {capture: true, passive: false});
        document.removeEventListener('touchend',      me.onMonitorEnd,  {capture: true});
        document.removeEventListener('touchcancel',   me.onMonitorEnd,  {capture: true});
        document.removeEventListener('pointercancel', me.onMonitorEnd,  {capture: true})
    }

    /**
     * A native HTML5 drag has begun somewhere in the document — `Neo.main.addon.NativeDragSource`
     * arms grid rows for one, and any foreign `draggable` node qualifies too. The gesture this addon
     * was tracking is over at this moment: the browser will not deliver the `mousemove` that would
     * feed it or the `mouseup` that would end it. A monitor left armed would qualify on the next
     * button-less pointer move (elapsed time and distance from the original press both pass) and
     * start a drag-scroll nobody is holding, with the grabbing cursor stuck on the body; an active
     * drag would keep scrolling under the pointer for the same reason. Both end here — the active
     * drag without a kinetic tail, since nothing was released.
     * @param {DragEvent} event
     */
    onNativeDragStart(event) {
        let me = this;

        me.monitorDrag && me.onMonitorEnd(event);
        me.activeDrag  && me.cancelActiveDrag()
    }

    /**
     * Drops an active drag on the floor: no fling, cursor restored, listeners and a running kinetic
     * frame removed. Tolerates both shapes `activeDrag` takes — the tracked gesture from
     * {@link #startDrag} and the `{id, animation}` handle {@link #autoScroll} leaves behind.
     */
    cancelActiveDrag() {
        let me                     = this,
            {animation, listeners} = me.activeDrag;

        animation && cancelAnimationFrame(animation);

        if (listeners) {
            document.removeEventListener('mousemove',   listeners.move, {capture: true});
            document.removeEventListener('mouseup',     listeners.end,  {capture: true});
            document.removeEventListener('touchmove',   listeners.move, {capture: true, passive: false});
            document.removeEventListener('touchend',    listeners.end,  {capture: true});

            if (listeners.cancel) {
                document.removeEventListener('touchcancel',   listeners.cancel, {capture: true});
                document.removeEventListener('pointercancel', listeners.cancel, {capture: true})
            }
        }

        document.body.style.removeProperty('cursor');
        me.activeDrag = null
    }

    /**
     * @summary Releases any live gesture or monitor and removes the document `dragstart` listener.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.monitorDrag && me.onMonitorEnd();
        me.activeDrag  && me.cancelActiveDrag();
        document.removeEventListener('dragstart', me.onNativeDragStart, {capture: true});

        super.destroy(...args)
    }

    /**
     * Registers a grid for drag scrolling.
     * @param {Object} data
     * @param {String} data.viewId      The ID of the grid view (vertical scroll target)
     * @param {String} data.containerId The ID of the grid container (horizontal scroll target)
     * @param {String} data.id          Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({viewId, containerId, id}) {
        let me = this;

        if (me.registrations.has(id)) {
            me.unregister({id})
        }

        let bodyElement      = document.getElementById(viewId),
            containerElement = document.getElementById(containerId);

        if (bodyElement) {
            let registration = {
                bodyElement,
                containerElement,
                id
            };

            if (Neo.config.hasTouchEvents) {
                bodyElement.addEventListener('touchstart', me.onDragStart, {
                    capture: true,
                    passive: false
                })
            } else {
                bodyElement.addEventListener('mousedown', me.onDragStart, {capture: true})
            }

            me.registrations.set(id, registration)
        }
    }

    /**
     * @param {Object} monitor
     * @param {Number} x
     * @param {Number} y
     * @param {String} inputType 'mouse' or 'touch'
     */
    startDrag(monitor, x, y, inputType) {
        let me = this;

        // A press during a kinetic tail or stale gesture takes the grid over cleanly.
        me.activeDrag && me.cancelActiveDrag();

        me.activeDrag = {
            id          : monitor.id,
            registration: monitor.registration,
            history     : [{time: Date.now(), x, y}],
            lastX       : x,
            lastY       : y,
            touchId     : inputType === 'touch' ? (monitor.touchId ?? null) : null,
            listeners   : {
                cancel: me.onDragCancel.bind(me),
                end   : me.onDragEnd.bind(me),
                move  : me.onDragMove.bind(me)
            }
        };

        if (inputType === 'mouse') {
            document.body.style.setProperty('cursor', 'grabbing', 'important');
            document.addEventListener('mousemove', me.activeDrag.listeners.move, {capture: true});
            document.addEventListener('mouseup',   me.activeDrag.listeners.end,  {capture: true})
        } else {
            document.addEventListener('touchmove',     me.activeDrag.listeners.move,   {capture: true, passive: false});
            document.addEventListener('touchend',      me.activeDrag.listeners.end,    {capture: true});
            document.addEventListener('touchcancel',   me.activeDrag.listeners.cancel, {capture: true});
            document.addEventListener('pointercancel', me.activeDrag.listeners.cancel, {capture: true})
        }
    }

    /**
     * Unregisters a grid.
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        let me           = this,
            registration = me.registrations.get(id);

        if (registration) {
            if (registration.bodyElement) {
                if (Neo.config.hasTouchEvents) {
                    registration.bodyElement.removeEventListener('touchstart', me.onDragStart, {
                        capture: true,
                        passive: false
                    })
                } else {
                    registration.bodyElement.removeEventListener('mousedown', me.onDragStart, {capture: true})
                }
            }

            // A grid that is leaving ends its gesture on the floor: no fling for elements about to go,
            // and `activeDrag` may be the kinetic tail's `{id, animation}` handle rather than a tracked
            // drag — `cancelActiveDrag` handles both shapes, `onDragEnd` only the tracked one.
            if (me.activeDrag?.id === id) {
                me.cancelActiveDrag()
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridDragScroll);
