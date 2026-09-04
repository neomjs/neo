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
     * @summary Registers mount-owned addons in the current realm and retires them before unmount transfers.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        let me = this;

        if (value) {
            me.dragScroll && me.updateDragScrollAddon(true);
            me.rowScrollPinning && me.updateRowScrollPinningAddon(true);
            me.updateGridHorizontalScrollSyncAddon(true)
        } else if (oldValue && me.windowId) {
            me.dragScroll && me.updateDragScrollAddon(false);
            me.rowScrollPinning && me.updateRowScrollPinningAddon(false);
            me.updateGridHorizontalScrollSyncAddon(false)
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
            isView    = target.id === container.view?.id;

        if (isView) {
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

            // Mirror into the center header toolbar's reactive config. Its afterSetScrollLeft
            // feeds the drag SortZone's scroll-correction term — without this write the config
            // (and the term) never move, corrupting post-scroll drag math. The DOM-side header
            // sync happens main-thread in Neo.main.addon.GridHorizontalScrollSync; this is the
            // worker-side state mirror.
            container.headerToolbar && (container.headerToolbar.scrollLeft = me.scrollLeft);

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
     * Calls one method of the row-hover-sync addon in the window this manager renders in. The
     * payload carries `windowId` because a remote method call is routed on it: without the key the
     * message falls back to the first connected port, which in a popup is the opener — an addon
     * that holds no registration for this grid, while the one that does is never told.
     * @param {String} method `'suspendHover'` | `'resumeHover'`
     * @param {String|null} windowId
     * @returns {Promise<void>}
     * @protected
     */
    async callGridRowHoverSyncAddon(method, windowId) {
        let me    = this,
            addon = await Neo.currentWorker.getAddon('GridRowHoverSync', windowId);

        addon[method]({
            id: me.id,
            windowId
        })
    }

    /**
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    resumeGridRowHoverSyncAddon(windowId = this.windowId) {
        return this.callGridRowHoverSyncAddon('resumeHover', windowId)
    }

    /**
     * @param {String|null} [windowId=this.windowId]
     * @returns {Promise<void>}
     */
    suspendGridRowHoverSyncAddon(windowId = this.windowId) {
        return this.callGridRowHoverSyncAddon('suspendHover', windowId)
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
                viewId: me.gridContainer.view.id,
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
                bodyIds    : [me.gridContainer.bodyStart?.id, me.gridContainer.body?.id, me.gridContainer.bodyEnd?.id].filter(Boolean),
                verticalScrollbarId: me.gridContainer.verticalScrollbar?.id,
                viewId             : me.gridContainer.view.id,
                id         : me.id,
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
                viewId  : me.gridContainer.view.id,
                id      : me.id,
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
                viewId = me.gridContainer.view?.id,
                headerId = me.gridContainer.headerToolbar?.id;

            if (scrollerId && bodyId && headerId) {
                addon.register({
                    id: me.id + '__h_scroll',
                    scrollerId,
                    bodyId,
                    viewId,
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
