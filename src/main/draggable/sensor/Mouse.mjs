import Base      from './Base.mjs';
import DomEvents from '../../DomEvents.mjs';

/**
 * @class Neo.main.draggable.sensor.Mouse
 * @extends Neo.main.draggable.sensor.Base
 */
class Mouse extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.draggable.sensor.Mouse'
         * @protected
         */
        className: 'Neo.main.draggable.sensor.Mouse',
        /**
         * Delay in ms before a drag OP starts.
         * Useful to avoid drag OPs on double-clicks.
         * @member {Number} delay=100
         */
        delay: 100,
        /**
         * @member {Number} minDistance=5
         */
        minDistance: 5,
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
    }

    /**
     * @param config
     */
    construct(config) {
        super.construct(config);
        Neo.bindMethods(this, ['onDistanceChange', 'onMouseDown', 'onMouseMove', 'onMouseUp'])
    }

    /**
     * Attaches sensors event listeners to the DOM
     */
    attach() {
        document.addEventListener('mousedown', this.onMouseDown, true)
    }

    /**
     * Detaches sensors event listeners from the DOM
     */
    detach() {
        document.removeEventListener('mousedown', this.onMouseDown, true)
    }

    /**
     * Detect change in distance, starting drag when both delay and distance requirements are met
     * @param {MouseEvent|Object} event - Object in case it does get trigger via the mouseDownTimeout
     */
    onDistanceChange(event) {
        let me = this;

        if (me.currentElement) {
            // Lost-release recovery: the gesture's own move stream observes the primary button
            // gone, so its mouseup happened off-document — terminate as the release never
            // received. The delay-timeout re-entry passes a plain coords object with no
            // `buttons` to inspect, so it skips this check by construction.
            if (event.buttons !== undefined && (event.buttons & 1) === 0) {
                me.endGesture(event);
                return
            }

            const {pageX, pageY}    = event,
                  timeElapsed       = Date.now() - me.mouseDownTime,
                  distanceTravelled = DomEvents.getDistance(me.startEvent.pageX, me.startEvent.pageY, pageX, pageY) || 0;

            Object.assign(me, {pageX, pageY});

            if (timeElapsed >= me.delay && distanceTravelled >= me.minDistance) {
                clearTimeout(me.mouseDownTimeout);
                document.removeEventListener('mousemove', me.onDistanceChange);
                me.startDrag()
            }
        }
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseDown(event) {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey) {
            let me     = this,
                target = DomEvents.testPathInclusion(event, me.dragTargetClasses);

            // see: https://github.com/neomjs/neo/issues/2669
            if (!event.path) {
                event.path = event.composedPath()
            }

            if (target) {
                Object.assign(me, {
                    currentElement: target.node,
                    mouseDownTime : Date.now(),
                    pageX         : event.pageX,
                    pageY         : event.pageY,
                    startEvent    : event
                });

                // Suppress text selection for the whole physical gesture from this point: the
                // drag only officially starts past the delay+distance threshold, and the native
                // selection machinery claims the pre-threshold window first — which is how a
                // splitter drag comes to paint card text as a selection. The class brackets the
                // PHYSICAL gesture, not the logical drag: Escape retires drag semantics, but the
                // button is still down, so suppression must hold until release. Released in
                // endGesture — on mouseup, or on the gesture's own move stream observing the
                // primary button gone (an off-document release never reaches onMouseUp).
                // Guarded: bare test harnesses may stub `document` without a body/classList.
                document.body?.classList?.add('neo-drag-active');

                document.addEventListener('dragstart', preventDefault);
                document.addEventListener('mousemove', me.onDistanceChange);
                document.addEventListener('mouseup',   me.onMouseUp);

                me.mouseDownTimeout = setTimeout(() => {
                    me.onDistanceChange({pageX: me.pageX, pageY: me.pageY})
                }, me.delay)
            }
        }
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseMove(event) {
        let me = this;

        // Same lost-release recovery for an engaged drag (see onDistanceChange).
        if (event.buttons !== undefined && (event.buttons & 1) === 0) {
            me.endGesture(event);
            return
        }

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
            })
        }
    }

    /**
     * Tears the physical gesture bracket down: releases the document-level selection guard,
     * detaches every gesture listener and, for an engaged drag, emits `drag:end` at the event's
     * position. Called by `onMouseUp` for an ordinary release and by the move handlers when the
     * primary button is observed gone — a release that happened off-document never reaches
     * `onMouseUp`, so the gesture's own move stream is the independent terminal witness.
     * @param {MouseEvent} event
     * @protected
     */
    endGesture(event) {
        let me = this;

        clearTimeout(me.mouseDownTimeout);

        document.body?.classList?.remove('neo-drag-active');

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
            })
        }

        me.dragging = false
    }

    /**
     * @param {MouseEvent} event
     */
    onMouseUp(event) {
        if (event.button === 0) {
            this.endGesture(event)
        }
    }

    /**
     *
     */
    startDrag() {
        let me           = this,
            element      = me.currentElement,
            {startEvent} = me;

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
            document.addEventListener('mousemove',   me.onMouseMove)
        }
    }
}

function preventDefault(event) {
    event.preventDefault()
}

export default Neo.setupClass(Mouse);
