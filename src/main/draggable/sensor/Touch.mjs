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
}

function preventDefault(event) {
    event.preventDefault();
}

Neo.applyClassConfig(Touch);

export {Touch as default};