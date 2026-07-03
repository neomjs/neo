import Controller from '../../../../../src/controller/Component.mjs';

/**
 * @class Portal.view.news.tickets.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.news.tickets.MainContainerController'
         * @protected
         */
        className: 'Portal.view.news.tickets.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/news/tickets'          : 'onRouteDefault',
            '/news/tickets/{*itemId}': 'onRouteItem'
        }
    }

    /**
     * Memoized promise for the build-emitted id→chunk map (see getIdMap()).
     * @member {Promise<Object|null>|undefined} idMapPromise
     * @protected
     */
    idMapPromise = undefined

    /**
     * @param {String} item
     */
    navigateTo(item) {
        Neo.Main.setRoute({
            value   : `/news/tickets/${item}`,
            windowId: this.component.windowId
        })
    }

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-container'),
            list     = panel.list,
            recordId = data.data.recordId,
            record;

        if (recordId && !list.isAnimating) {
            record = list.store.get(recordId);

            if (record) {
                list.selectionModel.select(record)
            }
        }
    }

    /**
     * @param {Object} data
     */
    onNextPageButtonClick(data) {
        this.navigateTo(this.getStateProvider().getData('nextPageRecord').id)
    }

    /**
     * @param {Object} data
     */
    onPageSectionsToggleButtonClick(data) {
        this.getReference('page-sections-container').toggleCls('neo-expanded')
    }

    /**
     * @param {Object} data
     */
    onPreviousPageButtonClick(data) {
        this.navigateTo(this.getStateProvider().getData('previousPageRecord').id)
    }

    /**
     * @returns {Promise<String|null>}
     */
    async getDefaultRouteId() {
        let tree   = this.getReference('tree'),
            store  = this.getStateProvider().getStore('tree'),
            folder = store.items.find(record => !record.isLeaf && record.childrenUrl),
            record;

        if (!folder) {
            return store.items.find(item => item.isLeaf)?.id || null
        }

        await tree.onFolderItemClick(folder);

        this.getStateProvider().data.countPages = store.getCount();

        record = store.items.find(item => item.parentId === folder.id && item.isLeaf);

        return record?.id || null
    }

    /**
     * Lazily fetches and memoizes the build-emitted id→chunk map for this content type.
     * The map lets a deep link resolve its containing chunk folder directly instead of
     * scanning folders sequentially; a missing or unreachable map degrades to null and
     * callers fall back to the legacy folder scan.
     * @returns {Promise<Object|null>}
     */
    getIdMap() {
        let me = this;

        if (me.idMapPromise === undefined) {
            const tree = me.getReference('tree');

            me.idMapPromise = fetch(`${tree.lazyChildUrlPrefix}tickets/idMap.json`)
                .then(response => response.ok ? response.json() : null)
                .catch(() => null)
        }

        return me.idMapPromise
    }

    /**
     * @param {String} itemId
     * @returns {Promise<Object|null>}
     */
    async ensureRecordLoaded(itemId) {
        let me     = this,
            tree   = me.getReference('tree'),
            store  = me.getStateProvider().getStore('tree'),
            record = store.get(itemId),
            folders, i, len;

        if (record) {
            return record
        }

        // Deterministic single-chunk resolution: the build-emitted id map names the chunk
        // folder containing the item, so one targeted load replaces the sequential scan.
        const
            idMap  = await me.getIdMap(),
            folder = idMap?.[itemId] && store.get(idMap[itemId]);

        if (folder) {
            await tree.onFolderItemClick(folder);

            record = store.get(itemId);

            if (record) {
                me.getStateProvider().data.countPages = store.getCount();
                return record
            }
        }

        folders = store.items.filter(record => !record.isLeaf && record.childrenUrl && !record.isChildrenLoaded);

        for (i = 0, len = folders.length; i < len; i++) {
            await tree.onFolderItemClick(folders[i]);

            record = store.get(itemId);

            if (record) {
                me.getStateProvider().data.countPages = store.getCount();
                return record
            }
        }

        return null
    }

    /**
     * @param {Object} data
     */
    async onRouteDefault(data) {
        let me    = this,
            store = me.getStateProvider().getStore('tree');

        const navigate = async () => {
            let id = await me.getDefaultRouteId();

            if (id) {
                me.navigateTo(id)
            }
        };

        if (store.getCount() > 0) {
            await navigate()
        } else {
            store.on({
                load : navigate,
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} value
     * @param {Object} oldValue
     */
    async onRouteItem({itemId}, value, oldValue) {
        let me            = this,
            stateProvider = me.getStateProvider(),
            store         = stateProvider.getStore('tree'),
            tree          = me.getReference('tree');

        // Ensure the tree has the correct route prefix for this controller context
        if (tree.routePrefix !== '/news/tickets') {
            tree.routePrefix = '/news/tickets'
        }

        const select = async () => {
            let record = await me.ensureRecordLoaded(itemId);

            if (!record) {
                return
            }

            stateProvider.data.currentPageRecord = record;

            if (!oldValue?.hashString?.startsWith('/news/tickets')) {
                await tree.expandAndScrollToItem(itemId)
            } else {
                tree.expandParents(itemId)
            }
        };

        if (store.getCount() > 0) {
            await select()
        } else {
            store.on({
                load : select,
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @param {Object} data
     */
    onSideNavToggleButtonClick(data) {
        this.getReference('sidenav-container').toggleCls('neo-expanded')
    }
}

export default Neo.setupClass(MainContainerController);
