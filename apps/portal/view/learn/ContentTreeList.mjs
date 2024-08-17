import TreeList from '../../../../src/tree/List.mjs';

/**
 * @class Portal.view.learn.ContentTreeList
 * @extends Neo.container.Base
 */
class ContentTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Portal.view.learn.ContentTreeList'
         * @protected
         */
        className: 'Portal.view.learn.ContentTreeList',
        /**
         * @member {Object} bind
         */
        bind: {
            contentPath      : data => data.contentPath,
            currentPageRecord: data => data.currentPageRecord,
            store            : 'stores.contentTree'
        },
        /**
         * @member {String[]} cls=['topics-tree']
         */
        cls: ['topics-tree'],
        /**
         * @member {String|null} contentPath_=null
         */
        contentPath_: null,
        /**
         * @member {Object} currentPageRecord=null
         */
        currentPageRecord_: null,
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
        this.store.load({url: `${this.contentPath}/tree.json`})
    }

    /**
     * @param {Object} record
     */
    onLeafItemClick(record) {
        super.onLeafItemClick(record);

        Neo.Main.setRoute({
            value   : `/learn/${record.id}`,
            windowId: this.windowId
        })
    }

    /**
     *
     */
    onStoreLoad() {
        super.onStoreLoad();

        this.getModel().data.countPages = this.store.getCount()
    }
}

export default Neo.setupClass(ContentTreeList);
