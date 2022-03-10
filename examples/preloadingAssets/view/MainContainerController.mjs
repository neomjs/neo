import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.preloadingAssets.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onActiveIndexChange(data) {
        console.log('onActiveIndexChange', data);
    }

    /**
     * @param {String} id
     */
    onMounted(id) {
        console.log('onMounted', id);
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
