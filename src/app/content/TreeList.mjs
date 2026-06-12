import BaseTreeList from '../../tree/List.mjs';

/**
 * @class Neo.app.content.TreeList
 * @extends Neo.tree.List
 */
class TreeList extends BaseTreeList {
    static config = {
        /**
         * @member {String} className='Neo.app.content.TreeList'
         * @protected
         */
        className: 'Neo.app.content.TreeList',
        /**
         * @member {Object} bind
         */
        bind: {
            contentPath      : data => data.contentPath,
            currentPageRecord: data => data.currentPageRecord,
            store            : 'stores.tree'
        },
        /**
         * @member {String[]} cls=['neo-app-content-tree-list']
         * @reactive
         */
        cls: ['neo-app-content-tree-list'],
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
         * @member {Boolean} lazyChildLoad=false
         */
        lazyChildLoad: false,
        /**
         * Optional URL prefix for relative child chunk URLs.
         * @member {String|null} lazyChildUrlPrefix=null
         */
        lazyChildUrlPrefix: null,
        /**
         * @member {String} lazyChildUrlField='childrenUrl'
         */
        lazyChildUrlField: 'childrenUrl',
        /**
         * Optional prefix for the route (e.g. '/learn' or '/releases')
         * @member {String|null} routePrefix=null
         */
        routePrefix: null,
        /**
         * @member {Boolean} saveScrollPosition=true
         */
        saveScrollPosition: true,
        /**
         * @member {Boolean} showCollapseExpandAllIcons=false
         */
        showCollapseExpandAllIcons: false
    }

    /**
     * Triggered after the store config got changed
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);

        if (value && this.contentPath) {
            this.doLoadStore()
        }
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
            this.selectionModel.select(value)
        }
    }

    /**
     *
     */
    doLoadStore() {
        if (Neo.isFunction(this.store?.load)) {
            this.store.load({url: `${this.contentPath}tree.json`})
        }
    }

    /**
     * @summary Resolves the URL used to fetch a folder node's deferred children.
     * @param {Object} record
     * @returns {String|null}
     */
    getLazyChildUrl(record) {
        let me  = this,
            url = record?.[me.lazyChildUrlField];

        if (!url) {
            return null
        }

        if (/^(?:[a-z]+:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
            return url
        }

        return (me.lazyChildUrlPrefix || '') + url
    }

    /**
     * @summary Adds content paths to chunk leaves whose compact index payload omits them.
     * @param {Object[]} records
     * @param {Object} parentRecord
     * @returns {Object[]}
     */
    normalizeLazyChildRecords(records, parentRecord) {
        let {contentDir, filePrefix} = parentRecord;

        if (!contentDir) {
            return records
        }

        filePrefix ??= '';

        return records.map(record => {
            if (!record.path && record.id) {
                return {
                    ...record,
                    path: `${contentDir}/${filePrefix}${record.id}.md`
                }
            }

            return record
        })
    }

    /**
     * @summary Loads a folder node's child chunk on first expand when `lazyChildLoad` is enabled.
     * @param {Object} record
     * @returns {Promise<Boolean|void>} false cancels the folder toggle.
     */
    async onFolderItemClick(record) {
        let me = this;

        if (!me.lazyChildLoad || record.isLeaf || record.isChildrenLoaded) {
            return
        }

        if (me.store.find('parentId', record.id).length > 0) {
            record.isChildrenLoaded = true;
            return
        }

        if (record.isLoading) {
            return false
        }

        let url = me.getLazyChildUrl(record);

        if (!url) {
            return
        }

        record.isLoading = true;

        try {
            let response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to load tree children from ${url}: ${response.status}`)
            }

            let records = await response.json();

            if (!Array.isArray(records)) {
                records = records?.data || []
            }

            if (records.length > 0) {
                me.store.add(me.normalizeLazyChildRecords(records, record))
            }

            record.isChildrenLoaded = true
        } catch (error) {
            record.hasError = true;
            console.error('TreeList lazy child load failed', {error, record, url});
            return false
        } finally {
            record.isLoading = false
        }
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

        let stateProvider = this.getStateProvider();

        if (stateProvider) {
            stateProvider.data.countPages = this.store.getCount()
        }
    }
}

export default Neo.setupClass(TreeList);
