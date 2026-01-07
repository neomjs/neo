import BaseTreeList from '../../../../../src/tree/List.mjs';

/**
 * @class Portal.view.shared.content.TreeList
 * @extends Neo.tree.List
 */
class TreeList extends BaseTreeList {
    static config = {
        /**
         * @member {String} className='Portal.view.shared.content.TreeList'
         * @protected
         */
        className: 'Portal.view.shared.content.TreeList',
        /**
         * @member {Object} bind
         */
        bind: {
            contentPath      : data => data.contentPath,
            currentPageRecord: data => data.currentPageRecord,
            store            : 'stores.tree'
        },
        /**
         * @member {String[]} cls=['portal-content-tree-list']
         * @reactive
         */
        cls: ['portal-content-tree-list'],
        /**
         * @member {String|null} contentPath_=null
         * @reactive
         */
        contentPath_: null,
        /**
         * @member {Object} currentPageRecord=null
         */
        currentPageRecord_: null,
        /**
         * Optional prefix for the route (e.g. '/learn' or '/releases')
         * @member {String|null} routePrefix=null
         */
        routePrefix: null,
        /**
         * @member {Boolean} showCollapseExpandAllIcons=false
         */
        showCollapseExpandAllIcons: false
    }

    /**
     * Triggered after the contentPath config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetContentPath(value, oldValue) {
        value && this.doLoadStore()
    }

    /**
     * Triggered after the currentPageRecord config got changed
     * @param {Object} value
     * @param {Object} oldValue
     */
    async afterSetCurrentPageRecord(value, oldValue) {
        if (value) {
            await this.timeout(20);
            this.selectionModel.select(value)
        }
    }

    /**
     *
     */
    doLoadStore() {
        this.store.load({url: `${this.contentPath}tree.json`})
    }

    /**
     * @param {Object} record
     */
    onLeafItemClick(record) {
        super.onLeafItemClick(record);

        if (this.routePrefix) {
            Neo.Main.setRoute({
                value   : `${this.routePrefix}/${record.id}`,
                windowId: this.windowId
            })
        }
    }

    /**
     *
     */
    onStoreLoad() {
        super.onStoreLoad();

        this.getStateProvider().data.countPages = this.store.getCount()
    }
}

export default Neo.setupClass(TreeList);
