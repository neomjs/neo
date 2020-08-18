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
         * @member {Number} delay=200
         */
        delay: 200,
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
        Neo.bindMethods(this, ['onDistanceChange', 'onMouseDown', 'onMouseMove', 'onMouseUp']);
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
        let me = this;

        if (me.currentElement) {
            const {pageX, pageY}    = event,
                  timeElapsed       = Date.now() - me.mouseDownTime,
                  distanceTravelled = DomEvents.getDistance(me.startEvent.pageX, me.startEvent.pageY, pageX, pageY) || 0;

            Object.assign(me, {pageX, pageY});

            if (timeElapsed >= me.delay && distanceTravelled >= me.minDistance) {
                clearTimeout(me.mouseDownTimeout);
                document.removeEventListener('mousemove', me.onDistanceChange);
                me.startDrag();
            }
        }
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
                Object.assign(me, {
                    currentElement: target.node,
                    mouseDownTime : Date.now(),
                    pageX         : event.pageX,
                    pageY         : event.pageY,
                    startEvent    : event
                });

                document.addEventListener('dragstart', preventDefault);
                document.addEventListener('mousemove', me.onDistanceChange);
                document.addEventListener('mouseup',   me.onMouseUp);

                me.mouseDownTimeout = setTimeout(() => {
                    me.onDistanceChange({pageX: me.pageX, pageY: me.pageY});
                }, me.delay);
            }
        }
    }

    /**
     *
     * @param {MouseEvent} event
     */
    onMouseMove(event) {
        let me = this;

        if (me.dragging) {
            let element = me.currentElement,
                target  = document.elementFromPoint(event.clientX, event.clientY);

            me.trigger(element, {
                clientX      : event.clientX,
                clientY      : event.clientY,
                element,
                originalEvent: event,
                path         : me.startEvent.path || me.startEvent.composedPath(),
                target,
                type         : 'drag:move'
            });
        }
    }

    /**
     *
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
        if (event.button === 0) {
            let me = this;

            clearTimeout(me.mouseDownTimeout);

            document.removeEventListener('dragstart', preventDefault);
            document.removeEventListener('mousemove', me.onDistanceChange);
            document.removeEventListener('mouseup',   me.onMouseUp);

            if (me.dragging) {
                let element = me.currentElement,
                    target  = document.elementFromPoint(event.clientX, event.clientY);

                me.trigger(element, {
                    clientX      : event.clientX,
                    clientY      : event.clientY,
                    element,
                    originalEvent: event,
                    path         : me.startEvent.path || me.startEvent.composedPath(),
                    target,
                    type         : 'drag:end'
                });

                document.removeEventListener('contextmenu', preventDefault, true);
                document.removeEventListener('mousemove',   me.onMouseMove);

                Object.assign(me, {
                    currentElement: null,
                    dragging      : false,
                    startEvent    : null
                });
            }

            me.dragging = false;
        }
    }

    /**
     *
     */
    startDrag() {
        let me         = this,
            element    = me.currentElement,
            startEvent = me.startEvent;

        me.trigger(element, {
            clientX      : startEvent.clientX,
            clientY      : startEvent.clientY,
            element,
            originalEvent: startEvent,
            path         : startEvent.path || startEvent.composedPath(),
            target       : startEvent.target,
            type         : 'drag:start'
        });

        me.dragging = true;

        if (me.dragging) {
            document.addEventListener('contextmenu', preventDefault, true);
            document.addEventListener('mousemove',   me.onMouseMove);
        }
    }
}

function preventDefault(event) {
    event.preventDefault();
}

Neo.applyClassConfig(Mouse);

export {Mouse as default};