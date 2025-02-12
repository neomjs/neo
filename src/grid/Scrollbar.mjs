import Component from '../component/Base.mjs';

/**
 * @class Neo.grid.Scrollbar
 * @extends Neo.component.Base
 */
class GridScrollbar extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.Scrollbar'
         * @protected
         */
        className: 'Neo.grid.Scrollbar',
        /**
         * @member {String} ntype='grid-scrollbar'
         * @protected
         */
        ntype: 'grid-scrollbar',
        /**
         * @member {String[]} baseCls=['neo-grid-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-scrollbar'],
        /**
         * Number in px
         * @member {Number} rowHeight_=0
         */
        rowHeight_: 0,
        /**
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['neo-grid-scrollbar-content']}
        ]}
    }

    /**
     * @param {Boolean} mounted
     * @protected
     */
    async addScrollSync(mounted) {
        let me         = this,
            {windowId} = me,
            ScrollSync = await Neo.currentWorker.getAddon('ScrollSync', windowId),
            params     = {id: me.id, windowId};

        if (mounted) {
            ScrollSync.register({
                fromId: me.parent.view.vdom.id,
                toId  : me.id,
                twoWay: !Neo.config.hasTouchEvents, // Syncing the scroller back to the view affects mobile scrolling
                ...params
            })
        } else {
            ScrollSync.unregister(params)
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        oldValue !== undefined && this.addScrollSync(value)
    }

    /**
     * Triggered after the rowHeight config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowHeight(value, oldValue) {
        value > 0 && this.updateScrollHeight()
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        if (value) {
            let me = this;

            value.on({
                load : me.updateScrollHeight,
                scope: me
            });

            value.getCount() > 0 && me.updateScrollHeight()
        }
    }

    /**
     *
     */
    updateScrollHeight() {
        let me           = this,
            countRecords = me.store.getCount(),
            {rowHeight}  = me;

        if (countRecords > 0 && rowHeight > 0) {
            me.vdom.cn[0].height = `${(countRecords + 1) * rowHeight}px`;
            me.update()
        }
    }
}

export default Neo.setupClass(GridScrollbar);
