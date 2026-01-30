import Base from './Base.mjs';

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
     * @member {Map<String, Object>} registrations=new Map()
     * @protected
     */
    registrations = new Map()

    /**
     * @param {MouseEvent} event
     */
    onMouseDown(event) {
        // Ignore right clicks
        if (event.button !== 0) {
            return
        }

        let me   = this,
            path = event.composedPath(),
            id, registration;

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

        event.preventDefault(); // Prevent text selection

        me.activeDrag = {
            id,
            registration,
            lastX: event.clientX,
            lastY: event.clientY,
            listeners: {
                mousemove: me.onMouseMove.bind(me),
                mouseup  : me.onMouseUp.bind(me)
            }
        };

        document.addEventListener('mousemove', me.activeDrag.listeners.mousemove, {capture: true});
        document.addEventListener('mouseup',   me.activeDrag.listeners.mouseup,   {capture: true})
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseMove(event) {
        let me   = this,
            drag = me.activeDrag;

        if (!drag) {
            return
        }

        let {registration} = drag,
            deltaX         = drag.lastX - event.clientX,
            deltaY         = drag.lastY - event.clientY;

        if (deltaX !== 0 && registration.containerElement) {
            registration.containerElement.scrollLeft += deltaX
        }

        if (deltaY !== 0 && registration.bodyElement) {
            registration.bodyElement.scrollTop += deltaY
        }

        drag.lastX = event.clientX;
        drag.lastY = event.clientY
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
        let me = this;

        if (me.activeDrag) {
            document.removeEventListener('mousemove', me.activeDrag.listeners.mousemove, {capture: true});
            document.removeEventListener('mouseup',   me.activeDrag.listeners.mouseup,   {capture: true});
            me.activeDrag = null
        }
    }

    /**
     * @param {TouchEvent} event
     */
    onTouchEnd(event) {
        let me = this;

        if (me.activeDrag) {
            document.removeEventListener('touchmove', me.activeDrag.listeners.touchmove, {capture: true, passive: false});
            document.removeEventListener('touchend',  me.activeDrag.listeners.touchend,  {capture: true});
            me.activeDrag = null
        }
    }

    /**
     * @param {TouchEvent} event
     */
    onTouchMove(event) {
        let me   = this,
            drag = me.activeDrag;

        if (!drag) {
            return
        }

        event.preventDefault(); // Disable native scrolling

        let {registration} = drag,
            touch          = event.touches[0],
            deltaX         = drag.lastX - touch.clientX,
            deltaY         = drag.lastY - touch.clientY;

        if (deltaX !== 0 && registration.containerElement) {
            registration.containerElement.scrollLeft += deltaX
        }

        if (deltaY !== 0 && registration.bodyElement) {
            registration.bodyElement.scrollTop += deltaY
        }

        drag.lastX = touch.clientX;
        drag.lastY = touch.clientY
    }

    /**
     * @param {TouchEvent} event
     */
    onTouchStart(event) {
        let me    = this,
            path  = event.composedPath(),
            touch = event.touches[0],
            id, registration;

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

        if (path.some(el => el.classList?.contains('neo-draggable'))) {
            return
        }

        me.activeDrag = {
            id,
            registration,
            lastX: touch.clientX,
            lastY: touch.clientY,
            listeners: {
                touchmove: me.onTouchMove.bind(me),
                touchend : me.onTouchEnd .bind(me)
            }
        };

        document.addEventListener('touchmove', me.activeDrag.listeners.touchmove, {capture: true, passive: false});
        document.addEventListener('touchend',  me.activeDrag.listeners.touchend,  {capture: true})
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
                registration.touchStartListener = me.onTouchStart.bind(me);
                bodyElement.addEventListener('touchstart', registration.touchStartListener, {capture: true, passive: false})
            } else {
                registration.mouseDownListener = me.onMouseDown.bind(me);
                bodyElement.addEventListener('mousedown', registration.mouseDownListener, {capture: true})
            }

            me.registrations.set(id, registration)
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
                    registration.bodyElement.removeEventListener('touchstart', registration.touchStartListener, {capture: true, passive: false})
                } else {
                    registration.bodyElement.removeEventListener('mousedown', registration.mouseDownListener, {capture: true})
                }
            }

            // If this registration was active, cancel the drag
            if (me.activeDrag?.id === id) {
                if (Neo.config.hasTouchEvents) {
                    me.onTouchEnd()
                } else {
                    me.onMouseUp()
                }
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridDragScroll);
