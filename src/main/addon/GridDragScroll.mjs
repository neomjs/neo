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
        Neo.bindMethods(this, ['onDragStart', 'onMonitorEnd', 'onMonitorMove'])
    }

    /**
     * @param {Object} data
     */
    autoScroll(data) {
        let me                                 = this,
            {friction, registration, velocity} = data;

        if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) {
            return
        }

        if (registration.containerElement) {
            registration.containerElement.scrollLeft -= velocity.x
        }

        if (registration.bodyElement) {
            registration.bodyElement.scrollTop -= velocity.y
        }

        velocity.x *= friction;
        velocity.y *= friction;

        me.activeDrag = {
            id       : data.id,
            animation: requestAnimationFrame(me.autoScroll.bind(me, data))
        }
    }

    /**
     * @param {MouseEvent|TouchEvent} event
     * @returns {Object} {x, y}
     */
    getEventCoordinates(event) {
        if (event.type.startsWith('touch')) {
            let touch = event.touches[0] || event.changedTouches[0];
            return {x: touch.clientX, y: touch.clientY}
        }

        return {x: event.clientX, y: event.clientY}
    }

    /**
     * @param {MouseEvent|TouchEvent} event
     */
    onDragEnd(event) {
        let me = this;

        if (me.activeDrag) {
            if (event.type === 'mouseup') {
                document.body.style.removeProperty('cursor');
                document.removeEventListener('mousemove', me.activeDrag.listeners.move, {capture: true});
                document.removeEventListener('mouseup', me.activeDrag.listeners.end, {capture: true})
            } else {
                document.removeEventListener('touchmove', me.activeDrag.listeners.move, {
                    capture: true,
                    passive: false
                });
                document.removeEventListener('touchend', me.activeDrag.listeners.end, {capture: true})
            }

            let {history, id, registration} = me.activeDrag,
                now                         = Date.now(),
                cutoff                      = now - 100, // 100ms
                relevantMoves               = history.filter(item => item.time > cutoff);

            // We need at least 2 points to calculate velocity
            if (relevantMoves.length > 1) {
                let newest = relevantMoves[relevantMoves.length - 1],
                    oldest = relevantMoves[0],
                    dt     = newest.time - oldest.time,
                    vX     = (newest.x - oldest.x) / dt * 16, // px per frame (approx 16ms)
                    vY     = (newest.y - oldest.y) / dt * 16;

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

        if (!drag) {
            return
        }

        if (event.type === 'touchmove' && event.cancelable !== false) {
            event.preventDefault() // Disable native scrolling
        }

        let {registration} = drag,
            {x, y}         = me.getEventCoordinates(event),
            deltaX         = drag.lastX - x,
            deltaY         = drag.lastY - y;

        if (deltaX !== 0 && registration.containerElement) {
            registration.containerElement.scrollLeft += deltaX
        }

        if (deltaY !== 0 && registration.bodyElement) {
            registration.bodyElement.scrollTop += deltaY
        }

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

        let me   = this,
            path = event.composedPath(),
            id, registration;

        // Stop any active animation
        if (me.activeDrag?.animation) {
            cancelAnimationFrame(me.activeDrag.animation);
            me.activeDrag = null
        }

        // Find the registration associated with the target element
        for (const [key, reg] of me.registrations) {
            if (path.includes(reg.bodyElement)) {
                id           = key;
                registration = reg;
                break
            }
        }

        if (!registration) {
            return
        }

        // Replicate the check from ScrollManager: ignore if clicking on a draggable element
        // We check for 'neo-draggable' class on the path
        if (path.some(el => el.classList?.contains('neo-draggable'))) {
            return
        }

        if (event.type === 'mousedown') {
            event.preventDefault() // Prevent text selection
        }

        let {x, y} = me.getEventCoordinates(event);

        me.monitorDrag = {
            id,
            registration,
            startX: x,
            startY: y
        };

        me.mouseDownTime = Date.now();

        if (event.type === 'mousedown') {
            document.addEventListener('mousemove', me.onMonitorMove, {capture: true});
            document.addEventListener('mouseup',   me.onMonitorEnd,  {capture: true})
        } else {
            document.addEventListener('touchmove', me.onMonitorMove, {capture: true, passive: false});
            document.addEventListener('touchend',  me.onMonitorEnd,  {capture: true})
        }

        me.mouseDownTimeout = setTimeout(() => {
            me.onMonitorMove({
                type: 'timeout',
                ...me.getEventCoordinates(event) // use original event coords as fallback
            })
        }, me.delay)
    }

    /**
     * Detect change in distance, starting drag when both delay and distance requirements are met
     * @param {MouseEvent|TouchEvent|Object} event - Object in case it does get trigger via the mouseDownTimeout
     */
    onMonitorMove(event) {
        let me          = this,
            monitor     = me.monitorDrag,
            {x, y}      = me.getEventCoordinates(event),
            timeElapsed = Date.now() - me.mouseDownTime,
            dist        = DomEvents.getDistance(monitor.startX, monitor.startY, x, y) || 0;

        if (timeElapsed >= me.delay && dist >= me.minDistance) {
            me.onMonitorEnd(event);
            me.startDrag(monitor, x, y, event.type.startsWith('touch') ? 'touch' : 'mouse')
        }
    }

    /**
     * @param {MouseEvent|TouchEvent} event
     */
    onMonitorEnd(event) {
        let me = this;

        clearTimeout(me.mouseDownTimeout);
        me.monitorDrag = null;

        document.removeEventListener('mousemove', me.onMonitorMove, {capture: true});
        document.removeEventListener('mouseup',   me.onMonitorEnd,  {capture: true});
        document.removeEventListener('touchmove', me.onMonitorMove, {capture: true, passive: false});
        document.removeEventListener('touchend',  me.onMonitorEnd,  {capture: true})
    }

    /**
     * Registers a grid for drag scrolling.
     * @param {Object} data
     * @param {String} data.bodyId      The ID of the grid body (vertical scroll target)
     * @param {String} data.containerId The ID of the grid container (horizontal scroll target)
     * @param {String} data.id          Unique identifier for the registration (e.g. ScrollManager id)
     */
    register({bodyId, containerId, id}) {
        let me = this;

        if (me.registrations.has(id)) {
            me.unregister({id})
        }

        let bodyElement      = document.getElementById(bodyId),
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

        me.activeDrag = {
            id          : monitor.id,
            registration: monitor.registration,
            history     : [{time: Date.now(), x, y}],
            lastX       : x,
            lastY       : y,
            listeners   : {
                move: me.onDragMove.bind(me),
                end : me.onDragEnd.bind(me)
            }
        };

        if (inputType === 'mouse') {
            document.body.style.setProperty('cursor', 'grabbing', 'important');
            document.addEventListener('mousemove', me.activeDrag.listeners.move, {capture: true});
            document.addEventListener('mouseup',   me.activeDrag.listeners.end,  {capture: true})
        } else {
            document.addEventListener('touchmove', me.activeDrag.listeners.move, {capture: true, passive: false});
            document.addEventListener('touchend',  me.activeDrag.listeners.end,  {capture: true})
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

            // If this registration was active, cancel the drag
            if (me.activeDrag?.id === id) {
                me.onDragEnd({type: Neo.config.hasTouchEvents ? 'touchend' : 'mouseup'})
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridDragScroll);