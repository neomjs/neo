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
     * @param {Object} event
     */
    onTouchCancel(event) {
        let me = this;

        me.sendMessageToApp(me.getEventData(event));
        me.firstTouch = null;
        me.lastTouch  = null
    }

    /**
     * @param {Object} event
     */
    onTouchEnd(event) {
        let me = this;

        me.sendMessageToApp(me.getEventData(event));
        me.firstTouch = null;
        me.lastTouch  = null
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
     * @param {Object} event
     */
    onTouchMove(event) {
        let me          = this,
            data        = me.getEventData(event),
            touch       = event.touches[0],
            {lastTouch} = me;

        if (lastTouch) {
            Object.assign(data, {
                deltaX: touch.clientX - lastTouch.clientX,
                deltaY: touch.clientY - lastTouch.clientY
            })
        }

        me.sendMessageToApp(data);

        me.lastTouch = touch;

        if (me.testPathInclusion(event, ['neo-helix'])) {
            event.preventDefault()
        }
    }

    /**
     * @param {Object} event
     */
    onTouchStart(event) {
        let me = this;

        me.firstTouch = event.touches[0];
        me.lastTouch  = event.touches[0];

        me.sendMessageToApp(me.getEventData(event))
    }
}

export default Neo.setupClass(TouchDomEvents);
