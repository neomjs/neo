import Component from '../component/Base.mjs';

/**
 * We do not want to use the default scrollbar for vertical scrolling, since it would show up at the right edge
 * of the last column. Instead, we want to show it at the right edge of the container (always visible when scrolling).
 * @class Neo.grid.VerticalScrollbar
 * @extends Neo.component.Base
 */
class VerticalScrollbar extends Component {
    static config = {
        /**
         * @member {String} className='Neo.grid.VerticalScrollbar'
         * @protected
         */
        className: 'Neo.grid.VerticalScrollbar',
        /**
         * @member {String} ntype='grid-vertical-scrollbar'
         * @protected
         */
        ntype: 'grid-vertical-scrollbar',
        /**
         * @member {String[]} baseCls=['neo-grid-vertical-scrollbar']
         * @protected
         */
        baseCls: ['neo-grid-vertical-scrollbar'],
        /**
         * Number in px
         * @member {Number} rowHeight_=0
         * @reactive
         */
        rowHeight_: 0,
        /**
         * @member {Neo.data.Store|null} store_=null
         * @reactive
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
                fromId: me.parent.body.vdom.id,
                toId  : me.id,
                twoWay: Neo.config.hasMouseEvents, // Syncing the scroller back to the body affects mobile scrolling
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
                filter: me.updateScrollHeight,
                load  : me.updateScrollHeight,
                scope : me
            })
        }
    }

    /**
     * @param {Object}   data
     * @param {Object[]} data.items
     * @param {Number}   [data.total]
     * @protected
     */
    updateScrollHeight(data) {
        let me           = this,
            countRecords = data?.total ? data.total : me.store.count,
            {rowHeight}  = me;

        if (countRecords > 0 && rowHeight > 0) {
            me.vdom.cn[0].height = `${(countRecords + 1) * rowHeight}px`;
            me.update()
        }
    }
}

export default Neo.setupClass(VerticalScrollbar);
