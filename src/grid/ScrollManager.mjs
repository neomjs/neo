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
        onBodyScrollEnd: { type: 'buffer', timer: 150 },
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
            this.updateGridHorizontalScrollSyncAddon(true)
        } else if (oldValue) {
            this.updateDragScrollAddon(false);
            this.updateRowScrollPinningAddon(false);
            this.updateGridHorizontalScrollSyncAddon(false)
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
     * Only triggers for vertical scrolling
     * @param {Object} data
     * @protected
     */
    onBodyScroll({ scrollTop }) {
        let me = this;

        me.scrollTop = scrollTop;
        me.gridContainer.body.isScrolling = true;

        me.onBodyScrollEnd();
        me.syncGridBody()
    }

    /**
     * @protected
     */
    onBodyScrollEnd() {
        let me = this;

        me.gridContainer.body.isScrolling = false;
        me.syncGridBody()
    }

    /**
     * @param {Object} data
     * @param {Number} data.scrollLeft
     * @param {Number} data.scrollTop
     * @param {Object} data.target
     */
    onContainerScroll({ scrollLeft, scrollTop, target }) {
        let me = this,
            { bodyWrapper } = me.gridContainer;
        
        if (target.id === bodyWrapper?.id || target.id === me.gridContainer.body?.id + '__wrapper') {
            me.scrollTop = target.scrollTop ?? scrollTop;
            me.gridContainer.body.isScrolling = true;

            me.onBodyScrollEnd();
            me.syncGridBody()
        } else if (target.id === me.gridContainer.horizontalScrollbar?.id || target.id.includes('grid-container')) {
            me.scrollLeft = target.scrollLeft ?? scrollLeft;
            me.gridContainer.body.isScrolling = true;

            me.onBodyScrollEnd();
            me.syncGridBody()
        }
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
                bodyId: me.gridBody.id + '__wrapper',
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
                bodyWrapperId: me.gridContainer.body?.id + '__wrapper',
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
    async updateGridHorizontalScrollSyncAddon(active, windowId = this.windowId) {
        let me = this,
            addon = await Neo.currentWorker.getAddon('GridHorizontalScrollSync', windowId);

        if (active) {
            let scrollerId = me.gridContainer.horizontalScrollbar?.id,
                bodyId = me.gridContainer.body?.id,
                headerId = me.gridContainer.headerWrapper?.id;

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
