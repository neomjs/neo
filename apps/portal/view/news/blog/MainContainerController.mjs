import Controller from '../../../../../src/controller/Component.mjs';

/**
 * @summary Routes `/news/blog/<slug>` URLs to the Portal blog store's `blog/<slug>` leaf records.
 * @class Portal.view.news.blog.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.news.blog.MainContainerController'
         * @protected
         */
        className: 'Portal.view.news.blog.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/news'                   : 'onRouteDefault',
            '/news/blog'              : 'onRouteDefault',
            '/news/blog/{*itemId}'    : 'onRouteItem'
        }
    }

    /**
     * @summary Navigates to `/news/blog/<slug>`, stripping any leading `blog/` record-id prefix.
     * @param {String} item
     */
    navigateTo(item) {
        const slug = item.replace(/^blog\//, '');

        Neo.Main.setRoute({
            value   : `/news/blog/${slug}`,
            windowId: this.component.windowId
        })
    }

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-container'),
            list     = panel.list,
            record   = list.store.get(parseInt(data.data.recordId));

        if (record && !list.isAnimating) {
            list.selectionModel.select(record)
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
     * @param {Object} data
     * @param {Object} value
     * @param {Object} oldValue
     */
    onRouteDefault(data, value, oldValue) {
        let me    = this,
            store = me.getStateProvider().getStore('tree');

        if (store.getCount() > 0) {
            me.navigateTo(store.getAt(1).id)
        } else {
            store.on({
                load : () => me.navigateTo(store.getAt(1).id),
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @summary Selects the matching `blog/<slug>` tree record for `/news/blog/<slug>` routes.
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

        // Leaf records in blog.json carry `id: "blog/<slug>"` so relative links resolve one folder deep
        // inside `learn/`; prefixing with `/news` makes `${routePrefix}/${record.id}` emit `/news/blog/<slug>`.
        if (tree.routePrefix !== '/news') {
            tree.routePrefix = '/news'
        }

        const select = async () => {
            const slug     = itemId.split('#')[0].replace(/^blog\//, ''),
                  recordId = store.get(`blog/${slug}`) ? `blog/${slug}` : slug;

            stateProvider.data.currentPageRecord = store.get(recordId);

            if (!oldValue?.hashString?.startsWith('/news/blog')) {
                await tree.expandAndScrollToItem(recordId)
            } else {
                tree.expandParents(recordId)
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
