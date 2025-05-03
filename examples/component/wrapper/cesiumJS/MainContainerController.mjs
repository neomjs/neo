import ComponentController from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.wrapper.cesiumJS.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.cesiumJS.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.cesiumJS.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onFlyToButtonClick(data) {
        this.getReference('cesium-component').flyTo({
            destination: [-122.4175, 37.655, 400],
            heading    : 0.0,
            pitch      : -15.0
        })
    }
}

export default Neo.setupClass(MainContainerController);
