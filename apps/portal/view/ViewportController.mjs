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
         * @member {Object} routes
         */
        routes: {
            '/blog' : 'onBlogRoute',
            '/home' : 'onHomeRoute',
            '/learn': 'onLearnRoute',
            'default': 'onLearnRoute'
        },

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
    onBlogRoute(value, oldValue, params) {
        this.setMainContentIndex(2)
    }

    /**
     * @param {Object} data
     */
    onBlogSearchFieldChange(data) {
        this.getReference('blog-list').filterItems(data)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        !Neo.config.hash && Neo.Main.setRoute({value: '/home'})
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onHomeRoute(value, oldValue, params) {
        this.setMainContentIndex(0)
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(value, oldValue, params) {
        this.setMainContentIndex(1)
    }

    /**
     * @param {Number} value
     */
    setMainContentIndex(value) {
        this.getReference('main-content').layout.activeIndex = value
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
