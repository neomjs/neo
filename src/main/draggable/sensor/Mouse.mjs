import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

const onMouseDown = Symbol('onMouseDown');

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
         * @member {Number} mouseDownTimeout=0
         */
        mouseDownTimeout: 0,
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
        document.addEventListener('mousedown', this[onMouseDown].bind(this), true);
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        document.removeEventListener('mousedown', this[onMouseDown].bind(this), true);
    }

    /**
     *
     * @param {MouseEvent} event
     */
    [onMouseDown](event) {
        let me     = this,
            target = DomEvents.testPathInclusion(event, me.dragTargetClasses);

        if (target) {
            console.log('onMouseDown', target, event);
        }
    }
}

Neo.applyClassConfig(Mouse);

export {Mouse as default};