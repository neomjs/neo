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
     * @param {Object} data
     */
    onRouteDefault(data) {
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
            stateProvider.data.currentPageRecord = store.get(itemId);

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
