import Component from '../../../../src/controller/Component.mjs';
import NeoArray  from '../../../../src/util/Array.mjs';

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
     * We need to store the current positions, since drag&drop resorting of tabs is enabled.
     * The initial order mirrors `TabContainer.items` and the left-docked visual order.
     * @member {String[]} tabItems
     */
    tabItems = ['dist_prod', 'dist_esm', 'dist_dev', 'devmode']

    /**
     *
     */
    onComponentConstructed() {
        let me = this;

        me.component.on('moveTo', me.onMoveTab, me)
    }

    /**
     * @summary Activates the examples tab whose id is carried by the current route.
     * @param {Object} params
     * @param {Object} value
     * @param {Object} oldValue
     */
    onExamplesRoute(params, value, oldValue) {
        let me     = this,
            itemId = params?.itemId || 'dist_prod',
            index  = me.tabItems.indexOf(itemId),
            store  = me.getReference(`examples-${itemId.replace('_', '-')}-list`).store;

        if (store?.getCount() < 1) {
            store.load()
        }

        me.component.activeIndex = index
    }

    /**
     * @summary Keeps route-to-index resolution aligned after manual tab resorting.
     * @param {Object} data
     * @param {Number} data.fromIndex
     * @param {Number} data.toIndex
     */
    onMoveTab({fromIndex, toIndex}) {
        NeoArray.move(this.tabItems, fromIndex, toIndex)
    }
}

export default Neo.setupClass(TabContainerController);
