import CoreBase from '../../../core/Base.mjs';

/**
 * Abstract base class for other sensors
 * @class Neo.main.draggable.sensor.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static config = {
        /**
         * @member {String} className='Neo.main.draggable.sensor.Base'
         * @protected
         */
        className: 'Neo.main.draggable.sensor.Base',
        /**
         * @member {HTMLElement|null} currentElement=null
         * @protected
         */
        currentElement: null,
        /**
         * @member {String[]} dragTargetClasses=['neo-draggable','neo-resizable']
         */
        dragTargetClasses: ['neo-draggable', 'neo-resizable'],
        /**
         * @member {Boolean} isDragging=false
         * @protected
         */
        isDragging: false,
        /**
         * @member {Event|null} lastEvent=null
         * @protected
         */
        lastEvent: null,
        /**
         * @member {Event|null} startEvent=null
         * @protected
         */
        startEvent: null
    }

    /**
     * Attaches sensors event listeners to the DOM
     */
    attach() {}

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {}

    /**
     *
     */
    onConstructed() {
        this.attach();
        super.onConstructed()
    }

    /**
     * Triggers a custom event on the target element.
     *
     * A gesture's own side effects can remove or replace the source node mid-drag (sort
     * visuals lift the dragged item, an overflow plugin re-collapses the toolbar, a live
     * re-render swaps DOM nodes): dispatching on a detached node swallows the event —
     * nothing bubbles, so the document-level drag owner never hears the move stream (or
     * the release). The document carries the dispatch for exactly that case; consumers
     * read `event.detail`, never the dispatch target.
     * @param {HTMLElement} element - Element to trigger event on
     * @param {Object} sensorEvent - Sensor event to trigger
     * @returns {Event}
     */
    trigger(element, sensorEvent) {
        const event = document.createEvent('Event');
        event.detail = sensorEvent;
        event.initEvent(sensorEvent.type, true, true);
        (element?.isConnected ? element : document).dispatchEvent(event);
        this.lastEvent = sensorEvent;

        return sensorEvent
    }
}

export default Neo.setupClass(Base);
