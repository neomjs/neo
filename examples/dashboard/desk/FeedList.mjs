import List from '../../../src/list/Base.mjs';

/**
 * @summary A read-only list over one of the desk's stores, each item rendered by the pane's own formatter.
 *
 * Logs, Terminal, Timeline, Alerts and History are this list over the desk's events, alerts and runs. The desk's
 * provider owns those stores and other panes read them too, so a list that the dock closes or recreates leaves its
 * store alone (`autoDestroyStore: false`).
 * @class Neo.examples.dashboard.desk.FeedList
 * @extends Neo.list.Base
 */
class FeedList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.desk.FeedList'
         * @protected
         */
        className: 'Neo.examples.dashboard.desk.FeedList',
        /**
         * The provider owns the store, which outlives this list
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['neo-list','neo-example-desk-feed']
         */
        baseCls: ['neo-list', 'neo-example-desk-feed'],
        /**
         * A feed reads, it does not select
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * Renders one record as the html of its item
         * @member {Function|null} itemFormatter=null
         */
        itemFormatter: null
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object|Object[]|String}
     */
    createItemContent(record, index, poolIndex=index) {
        let {itemFormatter} = this;

        return itemFormatter ? itemFormatter(record) : super.createItemContent(record, index, poolIndex)
    }
}

export default Neo.setupClass(FeedList);
