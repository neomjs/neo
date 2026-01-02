import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

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
            app: ['dispatch']
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Dispatches a native DOM event on a target element.
     *
     * @param {Object} data
     * @param {String} data.id - The DOM ID of the target element
     * @param {String} data.type - The event type (e.g., 'click', 'keydown', 'mousedown')
     * @param {Object} [data.options] - The event constructor options (e.g., {bubbles: true, key: 'Enter'})
     * @returns {Boolean} true if the event was dispatched successfully
     */
    dispatch(data) {
        const
            {id, type, options = {}} = data,
            node = DomAccess.getElement(id);

        if (!node) {
            console.warn(`EventSimulator: Target node with id '${id}' not found.`);
            return false
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
            node.dispatchEvent(event);
            return true
        } catch (e) {
            console.error(`EventSimulator: Failed to dispatch event '${type}' on '${id}'`, e);
            return false
        }
    }
}

export default Neo.setupClass(EventSimulator);
