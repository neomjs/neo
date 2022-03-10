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

        setTimeout(() => {
            Neo.ServiceWorker.preloadAssets({
                files: ['../resources/examples/ai_images/000074.jpg']
            });
        }, 5000)
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
