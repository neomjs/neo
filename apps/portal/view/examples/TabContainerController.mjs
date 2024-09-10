import Component from '../../../../src/controller/Component.mjs';

/**
 * @class Portal.view.examples.TabContainerController
 * @extends Neo.controller.Component
 */
class TabContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Portal.view.examples.TabContainerController'
         * @protected
         */
        className: 'Portal.view.examples.TabContainerController',
        /**
         * @member {Object} routes
         */
        routes: {
            '/examples'         : 'onExamplesRoute',
            '/examples/{itemId}': 'onExamplesRoute'
        }
    }

    /**
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onExamplesRoute(params, value, oldValue) {
        let me     = this,
            itemId = params?.itemId || 'dist_prod',
            store  = me.getReference(`examples-${itemId.replace('_', '-')}-list`).store;

        if (store?.getCount() < 1) {
            store.load()
        }

        me.component.activeIndex = itemId === 'dist_prod' ? 2 : itemId === 'dist_dev' ? 1 : 0
    }
}

export default Neo.setupClass(TabContainerController);
