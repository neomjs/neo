import Base from './Base.mjs';

/**
 * @summary Main Thread Addon for High-Performance Grid Drag Scrolling.
 *
 * This addon moves the drag-to-scroll logic from the App Worker to the Main Thread.
 * By handling `mousemove` events directly in the UI thread, it eliminates the latency
 * and overhead of passing high-frequency messages between workers, resulting in
 * smoother, native-like scrolling performance for mouse users.
 *
 * It listens for `mousedown` on the grid body, then attaches global `mousemove` and
 * `mouseup` listeners to handle the drag operation, supporting "over-drag" (scrolling
 * continues even if the mouse leaves the grid bounds).
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
                id,
                mouseDownListener: me.onMouseDown.bind(me)
            };

            bodyElement.addEventListener('mousedown', registration.mouseDownListener, {capture: true});
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
                registration.bodyElement.removeEventListener('mousedown', registration.mouseDownListener, {capture: true})
            }

            // If this registration was active, cancel the drag
            if (me.activeDrag?.id === id) {
                me.onMouseUp()
            }

            me.registrations.delete(id)
        }
    }
}

export default Neo.setupClass(GridDragScroll);
