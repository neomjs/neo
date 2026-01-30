import Base from '../core/Base.mjs';

/**
 * @class Neo.grid.ScrollManager
 * @extends Neo.core.Base
 */
class ScrollManager extends Base {
    /**
     * @member {Object} delayable
     * @protected
     * @static
     */
    static delayable = {
        onBodyScroll     : {type: 'throttle', timer:  16},
        onBodyScrollEnd  : {type: 'buffer',   timer: 150},
        onContainerScroll: {type: 'throttle', timer:  16},
        onMouseMove      : {type: 'throttle', timer:  16}
    }

    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollManager'
         * @protected
         */
        className: 'Neo.grid.ScrollManager',
        /**
         * @member {Boolean} mouseDragScroll_=true
         * @reactive
         */
        mouseDragScroll_: true,
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
     * @member {Boolean} isMouseDragging=false
     * @protected
     */
    isMouseDragging = false
    /**
     * @member {Number} lastMouseX=0
     * @protected
     */
    lastMouseX = 0
    /**
     * @member {Number} lastMouseY=0
     * @protected
     */
    lastMouseY = 0
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

        if (Neo.config.hasTouchEvents) {
            me.mouseDragScroll = false
        }

        me.gridBody.addDomListeners([
            {
                touchcancel: me.onTouchCancel,
                touchend   : me.onTouchEnd,
                scope      : me
            },
            {
                mousedown : me.onMouseDown,
                mouseleave: me.onMouseLeave,
                mouseup   : me.onMouseUp,
                scope     : me
            },
            {
                mousemove: {fn: me.onMouseMove, local: true},
                scope    : me
            }
        ])
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMouseDragScroll(value, oldValue) {
        let cls = 'neo-mouse-drag-scroll';

        if (value) {
            this.gridBody.addCls(cls)
        } else if (oldValue !== undefined) {
            this.gridBody.removeCls(cls)
        }
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

        body.set({isScrolling: true, scrollTop});

        me.onBodyScrollEnd();

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
                    value    : me.scrollLeft + deltaX,
                    windowId : me.windowId
                })

                me.lastTouchX = lastTouchX
            }
        }
    }

    /**
     * @protected
     */
    onBodyScrollEnd() {
        this.gridBody.isScrolling = false
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
            body.isScrolling = true;
            me.onBodyScrollEnd();

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
                        value    : me.scrollTop + deltaY,
                        windowId : me.windowId
                    })

                    me.lastTouchY = lastTouchY
                }
            }
        }
    }

    /**
     * @param {Object} data
     */
    onMouseDown(data) {
        if (this.mouseDragScroll && !data.path.some(e => e.cls.includes('neo-draggable'))) {
            this.isMouseDragging = true;
            this.lastMouseX      = data.clientX;
            this.lastMouseY      = data.clientY
        }
    }

    /**
     * @param {Object} data
     */
    onMouseLeave(data) {
        this.isMouseDragging = false
    }

    /**
     * @param {Object} data
     */
    onMouseMove(data) {
        let me = this;

        if (me.isMouseDragging) {
            let deltaX = me.lastMouseX - data.clientX,
                deltaY = me.lastMouseY - data.clientY;

            if (deltaX !== 0) {
                Neo.main.DomAccess.scrollTo({
                    direction: 'left',
                    id       : me.gridContainer.id,
                    value    : me.scrollLeft + deltaX,
                    windowId : me.windowId
                })
            }

            if (deltaY !== 0) {
                Neo.main.DomAccess.scrollTo({
                    direction: 'top',
                    id       : me.gridBody.vdom.id,
                    value    : me.scrollTop + deltaY,
                    windowId : me.windowId
                })
            }

            me.lastMouseX = data.clientX;
            me.lastMouseY = data.clientY
        }
    }

    /**
     * @param {Object} data
     */
    onMouseUp(data) {
        this.isMouseDragging = false
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

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            scrollLeft: this.scrollLeft,
            scrollTop : this.scrollTop
        }
    }
}

export default Neo.setupClass(ScrollManager);
