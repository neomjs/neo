import Component from '../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.preloadingAssets.view.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Component {
    static config = {
        /**
         * @member {String} className='Neo.examples.preloadingAssets.view.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.preloadingAssets.view.MainContainerController'
    }

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
                files: ['https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/examples/ai_images/000074.jpg']
            }).then(data => {
                console.log(data);
            });
        }, 3000)
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
