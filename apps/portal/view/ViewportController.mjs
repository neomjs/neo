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
            '/home' : 'onHomeRoute',
            '/learn': 'onLearnRoute'
        }
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
    onHomeRoute(params, value, oldValue) {
        this.getReference('main-content').layout.activeIndex = 0
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onLearnRoute(params, value, oldValue) {
        this.getReference('main-content').layout.activeIndex = 1
    }
}

Neo.applyClassConfig(ViewportController);

export default ViewportController;
