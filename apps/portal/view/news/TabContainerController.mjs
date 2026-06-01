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
            '/news'                   : 'onReleasesRoute',
            '/news/blog'              : 'onBlogRoute',
            '/news/blog/{*itemId}'       : 'onBlogRoute',
            '/news/discussions'          : 'onDiscussionsRoute',
            '/news/discussions/{*itemId}': 'onDiscussionsRoute',
            '/news/medium'               : 'onMediumRoute',
            '/news/releases'             : 'onReleasesRoute',
            '/news/releases/{*itemId}'   : 'onReleasesRoute',
            '/news/tickets'              : 'onTicketsRoute',
            '/news/tickets/{*itemId}'    : 'onTicketsRoute'
        }
    }

    /**
     * @param {Object} data
     */
    onBlogRoute(data) {
        this.component.activeIndex = 1
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
        this.setActiveIndexByRoute('/news/discussions')
    }

    /**
     * @param {Object} data
     */
    onMediumRoute(data) {
        this.component.activeIndex = 0
    }

    /**
     * @param {Object} data
     */
    onReleasesRoute(data) {
        this.component.activeIndex = 3
    }

    /**
     * @param {Object} data
     */
    onTicketsRoute(data) {
        this.component.activeIndex = 2
    }

    /**
     * @param {String} route
     */
    setActiveIndexByRoute(route) {
        let index = this.component.items.findIndex(item => item.header?.route === route);

        if (index !== -1) {
            this.component.activeIndex = index
        }
    }
}

export default Neo.setupClass(TabContainerController);
