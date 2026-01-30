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
        onContainerScroll: {type: 'throttle', timer:  16}
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
            this.dragScroll && this.updateDragScrollAddon(true)
        } else if (oldValue) {
            this.updateDragScrollAddon(false)
        }
    }

    /**
     * Only triggers for vertical scrolling
     * @param {Object} data
     * @protected
     */
    onBodyScroll({scrollTop}) {
        let me   = this,
            body = me.gridBody;

        me.scrollTop = scrollTop;

        body.set({isScrolling: true, scrollTop});

        me.onBodyScrollEnd()
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
     */
    onContainerScroll({scrollLeft, target}) {
        let me   = this,
            body = me.gridBody;

        // We must ignore events for grid-scrollbar
        if (target.id.includes('grid-container')) {
            body.isScrolling = true;
            me.onBodyScrollEnd();

            me  .scrollLeft = scrollLeft;
            body.scrollLeft = scrollLeft;

            me.gridContainer.headerToolbar.scrollLeft = scrollLeft
        }
    }

    /**
     * @param {Boolean} active
     * @returns {Promise<void>}
     */
    async updateDragScrollAddon(active) {
        let me    = this,
            addon = await Neo.currentWorker.getAddon('GridDragScroll', me.windowId);

        if (active) {
            addon.register({
                bodyId     : me.gridBody.id + '__wrapper',
                containerId: me.gridContainer.id,
                id         : me.id
            })
        } else {
            addon.unregister({id: me.id})
        }
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
