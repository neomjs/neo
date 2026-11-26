import Base from '../../core/Base.mjs';

/**
 * Will get imported in case Neo.config.hasTouchEvents === true
 * @class Neo.main.mixin.TouchDomEvents
 * @extends Neo.core.Base
 * @singleton
 */
class TouchDomEvents extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.mixin.TouchDomEvents'
         * @protected
         */
        className: 'Neo.main.mixin.TouchDomEvents'
    }

    /**
     * @summary Returns the active touch entry matching `identifier`, or `null` when absent.
     * @param {TouchList|Object[]} [touches]
     * @param {Number} [identifier]
     * @returns {Touch|Object|null}
     */
    findTouch(touches, identifier) {
        if (touches) {
            for (let i = 0, len = touches.length; i < len; i++) {
                if (touches[i].identifier === identifier) {
                    return touches[i]
                }
            }
        }

        return null
    }

    /**
     * @param {Object} event
     */
    onTouchCancel(event) {
        let me = this;

        me.sendMessageToApp(me.getEventData(event));
        me.syncTrackedTouch(event.touches)
    }

    /**
     * @param {Object} event
     */
    onTouchEnd(event) {
        let me = this;

        me.sendMessageToApp(me.getEventData(event));
        me.syncTrackedTouch(event.touches)
    }

    /**
     * @param {Object} event
     */
    onTouchEnter(event) {
        this.sendMessageToApp(this.getEventData(event))
    }

    /**
     * @param {Object} event
     */
    onTouchLeave(event) {
        this.sendMessageToApp(this.getEventData(event))
    }

    /**
     * @summary Computes deltas against the tracked contact's `identifier`, re-anchoring cleanly if needed.
     * @param {Object} event
     */
    onTouchMove(event) {
        let me          = this,
            data        = me.getEventData(event),
            {lastTouch} = me,
            touch       = (lastTouch && me.findTouch(event.touches, lastTouch.identifier)) || event.touches?.[0] || null;

        if (lastTouch && touch && touch.identifier === lastTouch.identifier) {
            Object.assign(data, {
                deltaX: touch.clientX - lastTouch.clientX,
                deltaY: touch.clientY - lastTouch.clientY
            })
        } else if (touch) {
            me.firstTouch = touch
        }

        me.sendMessageToApp(data);

        if (touch) {
            me.lastTouch = touch
        }

        if (me.testPathInclusion(event, ['neo-helix'])) {
            event.preventDefault()
        }
    }

    /**
     * @summary Preserves the tracked contact across secondary finger presses, or anchors to the initial contact.
     * @param {Object} event
     */
    onTouchStart(event) {
        let me      = this,
            tracked = me.lastTouch && me.findTouch(event.touches, me.lastTouch.identifier),
            next    = tracked || event.touches?.[0] || null;

        if (!tracked) {
            me.firstTouch = next
        }

        me.lastTouch = next;

        me.sendMessageToApp(me.getEventData(event))
    }

    /**
     * @summary Clears touch anchors when all fingers lift, or keeps/re-anchors the tracked contact without emitting a delta.
     * @param {TouchList|Object[]} [touches]
     */
    syncTrackedTouch(touches) {
        let me = this;

        if (!touches?.length) {
            me.firstTouch = null;
            me.lastTouch  = null;
            return
        }

        const tracked = me.lastTouch && me.findTouch(touches, me.lastTouch.identifier);

        if (tracked) {
            me.lastTouch = tracked
        } else {
            me.firstTouch = touches[0];
            me.lastTouch  = touches[0]
        }
    }
}

export default Neo.setupClass(TouchDomEvents);
