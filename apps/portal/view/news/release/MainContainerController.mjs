import Controller from '../../../../../src/controller/Component.mjs';

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
    onContentEdit(data) {
        // No-op for releases
    }

    /**
     * @param {Object} data
     */
    onContentRefresh(data) {
        this.getReference('tree').doFetchContent(data.record)
    }

    /**
     * @param {Object} data
     */
    onIntersect(data) {
        let panel    = this.getReference('page-sections-container'),
            list     = panel.list,
            recordId = parseInt(data.data.recordId);

        if (!list.isAnimating) {
            list.selectionModel.select(list.store.get(recordId))
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
     */
    onRouteDefault(data) {
        let store = this.getStateProvider().getStore('tree');

        if (store.getCount() > 0) {
            this.navigateTo(store.getAt(1).id)
        } else {
            store.on({
                load : () => this.navigateTo(store.getAt(1).id),
                delay: 10,
                once : true
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.itemId
     */
    onRouteItem({itemId}) {
        let stateProvider = this.getStateProvider(),
            store         = stateProvider.getStore('tree'),
            tree          = this.getReference('tree');

        // Ensure the tree has the correct route prefix for this controller context
        if (tree.routePrefix !== '/news/releases') {
            tree.routePrefix = '/news/releases'
        }

        if (store.getCount() > 0) {
            stateProvider.data.currentPageRecord = store.get(itemId)
        } else {
            store.on({
                load : () => {stateProvider.data.currentPageRecord = store.get(itemId)},
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
