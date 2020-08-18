import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

/**
 * @class Neo.main.draggable.sensor.Touch
 * @extends Neo.main.draggable.sensor.Base
 */
class Touch extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.draggable.sensor.Touch'
         * @protected
         */
        className: 'Neo.main.draggable.sensor.Touch',
        /**
         * @member {Number} delay=200
         */
        delay: 200,
        /**
         * @member {Number|null} pageX=null
         * @protected
         */
        pageX: null,
        /**
         * @member {Number|null} pageY=null
         * @protected
         */
        pageY: null
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        Neo.bindMethods(this, ['onDistanceChange', 'onTouchEnd', 'onTouchMove', 'onTouchStart', 'startDrag']);
    }

    /**
     * Attaches sensors event listeners to the DOM
     */
    attach() {
        document.addEventListener('touchstart', this.onTouchStart, true);
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        document.removeEventListener('touchstart', this.onTouchStart, true);
    }

    /**
     *
     * @param {TouchEvent} event
     */
    onDistanceChange(event) {

    }

    /**
     *
     * @param {TouchEvent} event
     */
    onTouchEnd(event) {

    }

    /**
     *
     * @param {TouchEvent} event
     */
    onTouchMove(event) {

    }

    /**
     *
     * @param {TouchEvent} event
     */
    onTouchStart(event) {

    }

    /**
     *
     * @param {TouchEvent} event
     */
    startDrag(event) {

    }
}

function preventDefault(event) {
    event.preventDefault();
}

Neo.applyClassConfig(Touch);

export {Touch as default};