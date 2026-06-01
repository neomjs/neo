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
     * @summary Activates the tab whose item config carries the given route.
     *
     * Resolves `activeIndex` by matching `item.header.route` rather than hardcoding a position, so the
     * controller stays correct when the `items` array is reordered — which it is: the left-docked tab
     * header renders `column-reverse`, so the array is ordered as the reverse of the visual display.
     * This removes the index-sync footgun between the `items` order and these route handlers.
     * @param {String} route
     */
    activateRoute(route) {
        this.component.activeIndex = this.component.items.findIndex(item => item.header?.route === route)
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
