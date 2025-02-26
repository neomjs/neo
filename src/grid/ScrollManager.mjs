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
         */
        scrollLeft_: 0,
        /**
         * @member {Number} scrollTop_=0
         * @protected
         */
        scrollTop_: 0
    }

    /**
     * @member {Neo.grid.Container|null} gridContainer=null
     * @protected
     */
    gridContainer = null
    /**
     * @member {Neo.grid.header.Toolbar|null} gridHeaderToolbar=null
     * @protected
     */
    gridHeaderToolbar = null
    /**
     * @member {Neo.grid.View|null} gridView=null
     * @protected
     */
    gridView = null
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        console.log(this);

        let me = this;

        me.gridContainer.addDomListeners({
            scroll: me.onContainerScroll,
            scope : me
        });

        me.gridView.addDomListeners({
            scroll     : me.onViewScroll,
            touchcancel: me.onTouchCancel,
            touchend   : me.onTouchEnd,
            scope      : me
        })
    }

    /**
     * @param {Object} data
     * @param {Number} data.scrollLeft
     * @param {Object} data.target
     * @param {Object} data.touches
     */
    onContainerScroll({scrollLeft, target, touches}) {
        let me    = this,
            view = me.gridView,
            deltaY, lastTouchY;

        // We must ignore events for grid-scrollbar
        if (target.id.includes('grid-container')) {
            me.gridHeaderToolbar.scrollLeft = scrollLeft;
            view.scrollPosition = {x: scrollLeft, y: view.scrollPosition.y};

            if (touches) {
                if (!view.isTouchMoveOwner) {
                    me.isTouchMoveOwner = true
                }

                if (me.isTouchMoveOwner) {
                    lastTouchY = touches.lastTouch.clientY - touches.firstTouch.clientY;
                    deltaY     = me.lastTouchY - lastTouchY;

                    deltaY !== 0 && Neo.main.DomAccess.scrollTo({
                        direction: 'top',
                        id       : view.vdom.id,
                        value    : view.scrollPosition.y + deltaY
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
        let me       = this,
            {parent} = me;

        me.isTouchMoveOwner = false;
        me.lastTouchX       = 0;

        parent.isTouchMoveOwner = false;
        parent.lastTouchY       = 0
    }

    /**
     * @param {Object} data
     */
    onTouchEnd(data) {
        let me       = this,
            {parent} = me;

        me.isTouchMoveOwner = false;
        me.lastTouchX       = 0;

        parent.isTouchMoveOwner = false;
        parent.lastTouchY       = 0
    }

    /**
     * Only triggers for vertical scrolling
     * @param {Object} data
     * @protected
     */
    onViewScroll({scrollTop, touches}) {
        let me   = this,
            view = me.gridView,
            deltaX, lastTouchX;

        me.scrollTimeoutId && clearTimeout(me.scrollTimeoutId);

        me.scrollTimeoutId = setTimeout(() => {
            view.isScrolling = false
        }, 30);

        view.set({
            isScrolling   : true,
            scrollPosition: {x: view.scrollPosition.x, y: scrollTop}
        });

        if (touches) {
            if (!me.parent.isTouchMoveOwner) {
                me.isTouchMoveOwner = true
            }

            if (me.isTouchMoveOwner) {
                lastTouchX = touches.lastTouch.clientX - touches.firstTouch.clientX;
                deltaX     = me.lastTouchX - lastTouchX;

                deltaX !== 0 && Neo.main.DomAccess.scrollTo({
                    direction: 'left',
                    id       : me.gridContainer.id,
                    value    : view.scrollPosition.x + deltaX
                })

                me.lastTouchX = lastTouchX
            }
        }
    }
}

export default Neo.setupClass(ScrollManager);
