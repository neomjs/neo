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
        onScrollEnd: { type: 'buffer', timer: 150 },
        syncGridBody: { type: 'throttle', timer: 16 }
    }

    static config = {
        /**
         * @member {String} className='Neo.grid.ScrollManager'
         * @protected
         */
        className: 'Neo.grid.ScrollManager',
        /**
         * @member {Boolean} dragScroll_=true
         * @reactive
         */
        dragScroll_: true,
        /**
         * @member {Boolean} mounted_=false
         * @protected
         * @reactive
         */
        mounted_: false,
        /**
         * Uses Neo.main.addon.GridRowHoverSync
         * @member {Boolean} rowHoverSync_=true
         * @reactive
         */
        rowHoverSync_: true,
        /**
         * Uses Neo.main.addon.GridRowScrollPinning
         * @member {Boolean} rowScrollPinning_=true
         * @reactive
         */
        rowScrollPinning_: true,
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
        scrollTop_: 0,
        /**
         * @member {String|null} windowId_=null
         * @protected
         * @reactive
         */
        windowId_: null
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
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetDragScroll(value, oldValue) {
        let cls = 'neo-mouse-drag-scroll';

        if (value) {
            this.gridBody.addCls(cls)
        } else if (oldValue) {
            this.gridBody.removeCls(cls)
        }

        if (this.mounted) {
            this.updateDragScrollAddon(value)
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        if (value) {
            this.dragScroll && this.updateDragScrollAddon(true);
            this.rowScrollPinning && this.updateRowScrollPinningAddon(true);
            this.updateGridHorizontalScrollSyncAddon(true);
        }
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetRowScrollPinning(value, oldValue) {
        if (this.mounted) {
            this.updateRowScrollPinningAddon(value)
        }
    }

    /**
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetWindowId(value, oldValue) {
        let me = this;

        if (oldValue && me.mounted) {
            me.dragScroll && me.updateDragScrollAddon(false, oldValue);
            me.rowScrollPinning && me.updateRowScrollPinningAddon(false, oldValue);
            me.updateGridHorizontalScrollSyncAddon(false, oldValue);

            me.dragScroll && me.updateDragScrollAddon(true, value);
            me.rowScrollPinning && me.updateRowScrollPinningAddon(true, value);
            me.updateGridHorizontalScrollSyncAddon(true, value);
        }
    }

    /**
     * @param args
     */
    destroy(...args) {
        this.updateRowScrollPinningAddon(false);
        this.updateGridHorizontalScrollSyncAddon(false);
        super.destroy(...args)
    }



    /**
     * @param {Object} data
     * @param {Number} data.scrollLeft
     * @param {Number} data.scrollTop
     * @param {Object} data.target
     */
    onContainerScroll({ scrollLeft, scrollTop, target }) {
        let me        = this,
            container = me.gridContainer,
            isBodyWrapper = target.id === container.bodyWrapper?.id;
        
        if (isBodyWrapper) {
            me.scrollTop = target.scrollTop ?? scrollTop;
            
            let startedScrolling = !container.body.isScrolling;

            if (container.bodyStart) container.bodyStart.isScrolling = true;
            if (container.bodyEnd)   container.bodyEnd.isScrolling   = true;
            container.body.isScrolling = true;

            if (startedScrolling && me.rowHoverSync) {
                me.suspendGridRowHoverSyncAddon();
            }

            me.onScrollEnd();
            me.syncGridBody()
        } else if (target.id === container.horizontalScrollbar?.id || target.id.includes('grid-container')) {
            me.scrollLeft = target.scrollLeft ?? scrollLeft;
            
            let startedScrolling = !container.body.isScrolling;

            if (container.bodyStart) container.bodyStart.isScrolling = true;
            if (container.bodyEnd)   container.bodyEnd.isScrolling   = true;
            container.body.isScrolling = true;

            if (startedScrolling && me.rowHoverSync) {
                me.suspendGridRowHoverSyncAddon();
            }

            me.onScrollEnd();
            me.syncGridBody()
        }
    }

    /**
     * @protected
     */
    onScrollEnd() {
        let me        = this,
            container = me.gridContainer;

        if (container.bodyStart) container.bodyStart.isScrolling = false;
        if (container.bodyEnd)   container.bodyEnd.isScrolling   = false;
        container.body.isScrolling = false;

        me.syncGridBody();

        if (me.rowHoverSync) {
            me.resumeGridRowHoverSyncAddon();
        }
    }

    /**
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async resumeGridRowHoverSyncAddon(windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridRowHoverSync', windowId);

        addon.resumeHover({
            id: me.id
        });
    }

    /**
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async suspendGridRowHoverSyncAddon(windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridRowHoverSync', windowId);

        addon.suspendHover({
            id: me.id
        });
    }

    /**
     * @protected
     */
    syncGridBody() {
        this.gridContainer.syncBodies(this.scrollTop)
    }

    /**
     * @param {Boolean} active
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async updateDragScrollAddon(active, windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridDragScroll', windowId);

        if (active) {
            let scrollerId = me.gridContainer.horizontalScrollbar?.id;

            addon.register({
                bodyId: me.gridContainer.bodyWrapper.id,
                containerId: scrollerId || me.gridContainer.id,
                id: me.id,
                windowId
            })
        } else {
            addon.unregister({ id: me.id, windowId })
        }
    }

    /**
     * @param {Boolean} active
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async updateRowScrollPinningAddon(active, windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridRowScrollPinning', windowId);

        if (active) {
            addon.register({
                bodyIds      : [me.gridContainer.bodyStart?.id, me.gridContainer.body?.id, me.gridContainer.bodyEnd?.id].filter(Boolean),
                bodyWrapperId: me.gridContainer.bodyWrapper.id,
                id           : me.id,
                windowId
            })
        } else {
            addon.unregister({ id: me.id, windowId })
        }
    }

    /**
     * @param {Boolean} active
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async updateGridRowHoverSyncAddon(active, windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridRowHoverSync', windowId);

        if (active) {
            addon.register({
                wrapperId: me.gridContainer.bodyWrapper.id,
                id       : me.id,
                windowId
            })
        } else {
            addon.unregister({ id: me.id, windowId })
        }
    }

    /**
     * @param {Boolean} active
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    async updateGridHorizontalScrollSyncAddon(active, windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridHorizontalScrollSync', windowId);

        if (active) {
            let scrollerId = me.gridContainer.horizontalScrollbar?.id,
                bodyId = me.gridContainer.body?.id,
                headerId = me.gridContainer.headerToolbar?.id;

            if (scrollerId && bodyId && headerId) {
                addon.register({
                    id: me.id + '__h_scroll',
                    scrollerId,
                    bodyId,
                    headerId,
                    windowId
                });
            }
        } else {
            addon.unregister({ id: me.id + '__h_scroll', windowId })
        }
    }



    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            scrollLeft: this.scrollLeft,
            scrollTop: this.scrollTop
        }
    }
}

export default Neo.setupClass(ScrollManager);
