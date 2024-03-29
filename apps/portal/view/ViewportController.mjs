import Controller from '../../../src/controller/Component.mjs';

/**
 * @class Portal.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='Portal.view.ViewportController'
         * @protected
         */
        className: 'Portal.view.ViewportController',
        /**
         * @member {String|null} defaultHash='/home'
         */
        defaultHash: '/home',
        /**
         * @member {Object} routes
         */
        routes: {
            '/blog'          : 'onBlogRoute',
            '/docs'          : 'onDocsRoute',
            '/home'          : 'onHomeRoute',
            '/learn'         : 'onLearnRoute',
            '/learn/{itemId}': 'onLearnRoute'
        }
    }

    /**
     * @param {Object[]} records
     */
    onBlogPostStoreLoad(records) {
        this.getReference('blog-header-button').badgeText = records.length + ''
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onBlogRoute(params, value, oldValue) {
        this.setMainContentIndex(2)
    }

    /**
     * @param {Object} data
     */
    onBlogSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onDocsRoute(params, value, oldValue) {
        this.setMainContentIndex(3)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(params, value, oldValue) {
        this.setMainContentIndex(0)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(params, value, oldValue) {
        this.setMainContentIndex(1)
    }

    /**
     * @param {Number} value
     */
    setMainContentIndex(value) {
        this.getReference('main-content').layout.activeIndex = value
    }
}

Neo.setupClass(ViewportController);

export default ViewportController;
