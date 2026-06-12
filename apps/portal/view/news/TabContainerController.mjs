import Controller from '../../../../src/controller/Component.mjs';

/**
 * @class Portal.view.news.TabContainerController
 * @extends Neo.controller.Component
 */
class TabContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.news.TabContainerController'
         * @protected
         */
        className: 'Portal.view.news.TabContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/news'                      : 'onReleasesRoute',
            '/news/blog'                 : 'onBlogRoute',
            '/news/blog/{*itemId}'       : 'onBlogRoute',
            '/news/discussions'          : 'onDiscussionsRoute',
            '/news/discussions/{*itemId}': 'onDiscussionsRoute',
            '/news/medium'               : 'onMediumRoute',
            '/news/pulls'                : 'onPullsRoute',
            '/news/pulls/{*itemId}'      : 'onPullsRoute',
            '/news/releases'             : 'onReleasesRoute',
            '/news/releases/{*itemId}'   : 'onReleasesRoute',
            '/news/tickets'              : 'onTicketsRoute',
            '/news/tickets/{*itemId}'    : 'onTicketsRoute'
        }
    }

    /**
     * @summary Activates the tab whose header button carries the given route.
     *
     * Resolves `activeIndex` by matching the tab button's `route` rather than hardcoding a position, so
     * the controller stays correct when the `items` array is reordered.
     *
     * The lookup MUST use `getTabBar().items` (the header buttons), NOT `component.items`:
     * `Neo.tab.Container.createItems()` transforms the user `items` into `[HeaderToolbar, Strip,
     * BodyContainer]`, so the original `item.header.route` is gone at route time. The header buttons
     * survive that transform and carry both `route` (a `Neo.button.Base` config) and `index` (the
     * original tab index the framework also reads on click).
     * @param {String} route
     */
    activateRoute(route) {
        let tab = this.component.getTabBar().items.find(button => button.route === route);

        tab && (this.component.activeIndex = tab.index)
    }

    /**
     * @param {Object} data
     */
    onBlogRoute(data) {
        this.activateRoute('/news/blog')
    }

    /**
     * @param {Object[]} records
     */
    onBlogPostStoreLoad(records) {
        this.getStateProvider().setData({blogPostCount: records.length})
    }

    /**
     * @param {Object} data
     */
    onDiscussionsRoute(data) {
        this.activateRoute('/news/discussions')
    }

    /**
     * @param {Object} data
     */
    onMediumRoute(data) {
        this.activateRoute('/news/medium')
    }

    /**
     * @param {Object} data
     */
    onPullsRoute(data) {
        this.activateRoute('/news/pulls')
    }

    /**
     * @param {Object} data
     */
    onReleasesRoute(data) {
        this.activateRoute('/news/releases')
    }

    /**
     * @param {Object} data
     */
    onTicketsRoute(data) {
        this.activateRoute('/news/tickets')
    }
}

export default Neo.setupClass(TabContainerController);
