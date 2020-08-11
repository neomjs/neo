import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

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
         * @member {Number} delay=0
         */
        delay: 0,
        /**
         * @member {Number} minDistance=0
         */
        minDistance: 0,
        /**
         * @member {Number} mouseDownTime=0
         */
        mouseDownTime: 0,
        /**
         * @member {Number|null} mouseDownTimeout=null
         */
        mouseDownTimeout: null,
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

        let me = this;

        // we need the scope enforcement globally, otherwise we can no longer remove the listeners
        me.onDistanceChange = me.onDistanceChange.bind(me);
        me.onMouseDown      = me.onMouseDown     .bind(me);
        me.onMouseUp        = me.onMouseUp       .bind(me);
    }

    /**
     * Attaches sensors event listeners to the DOM
     */
    attach() {
        document.addEventListener('mousedown', this.onMouseDown, true);
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        document.removeEventListener('mousedown', this.onMouseDown, true);
    }

    /**
     * Detect change in distance, starting drag when both delay and distance requirements are met
     * @param {MouseEvent} event
     */
    onDistanceChange(event) {
        console.log('onDistanceChange', event);
    }

    /**
     *
     * @param {MouseEvent} event
     */
    onMouseDown(event) {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            let me     = this,
                target = DomEvents.testPathInclusion(event, me.dragTargetClasses);

            if (target) {
                console.log('onMouseDown', target, event);

                Object.assign(me, {
                    currentElement: target.node,
                    mouseDownTime : Date.now(),
                    pageX         : event.pageX,
                    pageY         : event.pageY,
                    startEvent    : event
                });

                document.addEventListener('dragstart', preventNativeDragStart);
                document.addEventListener('mousemove', me.onDistanceChange);
                document.addEventListener('mouseup',   me.onMouseUp);

                me.mouseDownTimeout = window.setTimeout(() => {
                    me.onDistanceChange({pageX: me.pageX, pageY: me.pageY});
                }, me.delay);
            }
        }
    }

    /**
     *
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
        if (event.button !== 0) {
            return;
        }
console.log('onMouseUp');
        let me = this;

        document.removeEventListener('dragstart', preventNativeDragStart);
        document.removeEventListener('mousemove', me.onDistanceChange);
        document.removeEventListener('mouseup',   me.onMouseUp);
    }
}

function preventNativeDragStart(event) {
    event.preventDefault();
}

Neo.applyClassConfig(Mouse);

export {Mouse as default};