import Controller from '../../../../../src/controller/Component.mjs';
import SeoService from '../../../service/Seo.mjs';

/**
 * @class Portal.view.news.release.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.news.release.MainContainerController'
         * @protected
         */
        className: 'Portal.view.news.release.MainContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/news'                   : 'onRouteDefault',
            '/news/releases'          : 'onRouteDefault',
            '/news/releases/{*itemId}': 'onRouteItem'
        }
    }

    /**
     * @param {String} item
     */
    navigateTo(item) {
        Neo.Main.setRoute({
            value   : `/news/releases/${item}`,
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
     * @summary Selects the matching release-notes leaf record and refines the window title when loaded.
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
        if (tree.routePrefix !== '/news/releases') {
            tree.routePrefix = '/news/releases'
        }

        const select = async () => {
            const recordId = itemId.split('#')[0],
                  record   = store.get(recordId);

            stateProvider.data.currentPageRecord = record;

            if (record?.id) {
                SeoService.setRouteTitle({
                    route   : value?.hashString || `/news/releases/${recordId}`,
                    title   : `Neo.mjs v${record.id.replace(/^v/, '')} Release Notes`,
                    windowId: me.windowId
                })
            }

            if (!oldValue?.hashString?.startsWith('/news/releases')) {
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
