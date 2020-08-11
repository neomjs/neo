import {default as CoreBase} from '../../../core/Base.mjs';

/**
 * Abstract base class for other sensors
 * @class Neo.main.draggable.sensor.Base
 * @extends Neo.core.Base
 */
class Base extends CoreBase {
    static getConfig() {return {
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
         * @member {String[]} dragTargetClasses=['neo-draggable']
         */
        dragTargetClasses: ['neo-draggable'],
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
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        this.attach();
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
     * Triggers a custom event on the target element
     * @param {HTMLElement} element - Element to trigger event on
     * @param {Event} sensorEvent - Sensor event to trigger
     * @returns {Event}
     */
    trigger(element, sensorEvent) {
        const event = document.createEvent('Event');
        event.detail = sensorEvent;
        event.initEvent(sensorEvent.type, true, true);
        element.dispatchEvent(event);
        this.lastEvent = sensorEvent;

        return sensorEvent;
    }
}

Neo.applyClassConfig(Base);

export {Base as default};