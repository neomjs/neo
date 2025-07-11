import Base from '../core/Base.mjs';

/**
 * @class Neo.grid.ScrollManager
 * @extends Neo.core.Base
 */
class ScrollManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollManager'
         * @protected
         */
        className: 'Neo.grid.ScrollManager',
        /**
         * @member {Number} scrollLeft_=0
         * @protected
         * @reactive
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         * @reactive
         */
        scrollTop_: 0
    }

    /**
     * @member {Neo.grid.Body|null} gridBody=null
     * @protected
     */
    gridBody = null
    /**
     * @member {Neo.grid.Container|null} gridContainer=null
     * @protected
     */
    gridContainer = null
    /**
     * Storing touchmove position for mobile envs
     * @member {Number} lastTouchX=0
     * @protected
     */
    lastTouchX = 0
    /**
     * Storing touchmove position for mobile envs
     * @member {Number} lastTouchY=0
     * @protected
     */
    lastTouchY = 0
    /**
     * @member {Number|null}} scrollTimeoutId=null
     * @protected
     */
    scrollTimeoutId = null
    /**
     * Flag for identifying the ownership of a touchmove operation
     * @member {'body'|'container'|null} touchMoveOwner=null
     * @protected
     */
    touchMoveOwner = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.gridBody.addDomListeners({
            scroll     : me.onBodyScroll,
            touchcancel: me.onTouchCancel,
            touchend   : me.onTouchEnd,
            scope      : me
        });

        me.gridContainer.addDomListeners({
            scroll: me.onContainerScroll,
            scope : me
        })
    }

    /**
     * Only triggers for vertical scrolling
     * @param {Object} data
     * @protected
     */
    onBodyScroll({scrollTop, touches}) {
        let me   = this,
            body = me.gridBody,
            deltaX, lastTouchX;

        me.scrollTop = scrollTop;

        me.scrollTimeoutId && clearTimeout(me.scrollTimeoutId);

        me.scrollTimeoutId = setTimeout(() => {
            body.isScrolling = false
        }, 100);

        body.set({isScrolling: true, scrollTop});

        if (touches) {
            if (me.touchMoveOwner !== 'container') {
                me.touchMoveOwner = 'body'
            }

            if (me.touchMoveOwner === 'body') {
                lastTouchX = touches.lastTouch.clientX - touches.firstTouch.clientX;
                deltaX     = me.lastTouchX - lastTouchX;

                deltaX !== 0 && Neo.main.DomAccess.scrollTo({
                    direction: 'left',
                    id       : me.gridContainer.id,
                    value    : me.scrollLeft + deltaX
                })

                me.lastTouchX = lastTouchX
            }
        }
    }

    /**
     * @param {Object} data
     * @param {Number} data.scrollLeft
     * @param {Object} data.target
     * @param {Object} data.touches
     */
    onContainerScroll({scrollLeft, target, touches}) {
        let me    = this,
            body = me.gridBody,
            deltaY, lastTouchY;

        // We must ignore events for grid-scrollbar
        if (target.id.includes('grid-container')) {
            me  .scrollLeft = scrollLeft;
            body.scrollLeft = scrollLeft;

            me.gridContainer.headerToolbar.scrollLeft = scrollLeft;

            if (touches && !me.gridContainer.headerToolbar.cls.includes('neo-is-dragging')) {
                if (me.touchMoveOwner !== 'body') {
                    me.touchMoveOwner = 'container'
                }

                if (me.touchMoveOwner === 'container') {
                    lastTouchY = touches.lastTouch.clientY - touches.firstTouch.clientY;
                    deltaY     = me.lastTouchY - lastTouchY;

                    deltaY !== 0 && Neo.main.DomAccess.scrollTo({
                        direction: 'top',
                        id       : body.vdom.id,
                        value    : me.scrollTop + deltaY
                    })

                    me.lastTouchY = lastTouchY
                }
            }
        }
    }

    /**
     * @param {Object} data
     */
    onTouchCancel(data) {
        this.onTouchEnd(data)
    }

    /**
     * @param {Object} data
     */
    onTouchEnd(data) {
        let me = this;

        me.touchMoveOwner = null;
        me.lastTouchX     = 0;
        me.lastTouchY     = 0
    }
}

export default Neo.setupClass(ScrollManager);
