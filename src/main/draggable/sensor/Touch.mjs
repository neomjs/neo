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
         * @member {Number} minDistance=0
         */
        minDistance: 0,
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
         * @member {Number|null} tapTimeout=null
         */
        tapTimeout: null,
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
        document.addEventListener('touchstart', this.onTouchStart);
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        document.removeEventListener('touchstart', this.onTouchStart);
    }

    /**
     * Detect change in distance, starting drag when both delay and distance requirements are met
     * @param {TouchEvent|Object} event - Object in case it does get trigger via the tapTimeout
     */
    onDistanceChange(event) {
        let me = this;

        if (me.currentElement) {
            const {pageX, pageY}    = DomEvents.getTouchCoords(event),
                  start             = DomEvents.getTouchCoords(me.startEvent),
                  timeElapsed       = Date.now() - me.touchStartTime,
                  distanceTravelled = DomEvents.getDistance(start.pageX, start.pageY, pageX, pageY) || 0;

            Object.assign(me, {pageX, pageY});

            if (timeElapsed >= me.delay && distanceTravelled >= me.minDistance) {
                clearTimeout(me.tapTimeout);
                document.removeEventListener('touchmove', me.onDistanceChange);
                me.startDrag();
            }
        }
    }

    /**
     *
     * @param {TouchEvent} event
     */
    onTouchEnd(event) {
        preventScrolling = false;

        let me = this;

        clearTimeout(me.tapTimeout);

        document.removeEventListener('dragstart',   stopEvent);
        document.removeEventListener('touchcancel', me.onTouchEnd);
        document.removeEventListener('touchend',    me.onTouchEnd);
        document.removeEventListener('touchmove',   me.onDistanceChange);

        if (me.dragging) {
            const {pageX, pageY} = DomEvents.getTouchCoords(event);

            let element = me.currentElement,
                target  = document.elementFromPoint(pageX - window.scrollX, pageY - window.scrollY);

            event.preventDefault();

            me.trigger(element, {
                clientX      : pageX,
                clientY      : pageY,
                element,
                originalEvent: event,
                path         : me.startEvent.path || me.startEvent.composedPath(),
                target,
                type         : 'drag:end'
            });

            document.removeEventListener('contextmenu', stopEvent, true);
            document.removeEventListener('touchmove',   me.onTouchMove);

            Object.assign(me, {
                currentElement: null,
                dragging      : false,
                startEvent    : null
            });
        }

        me.dragging = false;
    }

    /**
     *
     * @param {TouchEvent} event
     */
    onTouchMove(event) {
        let me = this;

        if (me.dragging) {
            const {pageX, pageY} = DomEvents.getTouchCoords(event);

            let element = me.currentElement,
                target  = document.elementFromPoint(pageX - window.scrollX, pageY - window.scrollY);

            me.trigger(element, {
                clientX      : pageX,
                clientY      : pageY,
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

            document.addEventListener('dragstart',   stopEvent);
            document.addEventListener('touchcancel', me.onTouchEnd);
            document.addEventListener('touchend',    me.onTouchEnd);
            document.addEventListener('touchmove',   me.onDistanceChange);

            me.tapTimeout = setTimeout(() => {
                me.onDistanceChange({touches: [{pageX: me.pageX, pageY: me.pageY}]});
            }, me.delay);
        }
    }

    /**
     *
     */
    startDrag() {
        let me         = this,
            element    = me.currentElement,
            startEvent = me.startEvent,
            touch      = DomEvents.getTouchCoords(me.startEvent);

        me.trigger(element, {
            clientX      : touch.pageX,
            clientY      : touch.pageY,
            element,
            originalEvent: startEvent,
            path         : startEvent.path || startEvent.composedPath(),
            target       : startEvent.target,
            type         : 'drag:start'
        });

        me.dragging = true; // todo

        if (me.dragging) {
            document.addEventListener('contextmenu', stopEvent, true);
            document.addEventListener('touchmove',   me.onTouchMove);
        }

        preventScrolling = me.dragging;
    }
}

function stopEvent(event) {
    event.stopEvent();
}

Neo.applyClassConfig(Touch);

export {Touch as default};