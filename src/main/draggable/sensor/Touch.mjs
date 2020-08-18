import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

let preventScrolling = false;

// WebKit requires cancelable touchmove events to be added as early as possible
window.addEventListener('touchmove', event => {
    if (!preventScrolling) {
        return;
    }

    // Prevent scrolling
    event.preventDefault();
}, {passive: false});

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
        pageY: null,
        /**
         * @member {Number} touchStartTime=0
         */
        touchStartTime: 0
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
     * Detect change in distance, starting drag when both delay and distance requirements are met
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
        let me     = this,
            target = DomEvents.testPathInclusion(event, me.dragTargetClasses);

        if (target) {
            const {pageX, pageY} = DomEvents.getTouchCoords(event);

            Object.assign(me, {
                currentElement: target.node,
                pageX         : pageX,
                pageY         : pageY,
                startEvent    : event,
                touchStartTime: Date.now()
            });

            document.addEventListener('touchend',    me.onTouchEnd);
            document.addEventListener('touchcancel', me.onTouchEnd);
            document.addEventListener('touchmove',   me.onDistanceChange);

            me.mouseDownTimeout = window.setTimeout(() => {
                me.onDistanceChange({pageX: me.pageX, pageY: me.pageY});
            }, me.delay);
        }
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