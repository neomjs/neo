import Base from './Base.mjs';

/**
 * @class Neo.main.draggable.sensor.Mouse
 * @extends Neo.main.draggable.sensor.Base
 */
class Mouse extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.draggable.sensor.Mouse'
         * @protected
         */
        className: 'Neo.main.draggable.sensor.Mouse',
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
     * Attaches sensors event listeners to the DOM
     */
    attach() {
        // todo
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        // todo
    }
}

Neo.applyClassConfig(Mouse);

export {Mouse as default};