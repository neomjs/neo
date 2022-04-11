import ComponentController from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.wrapper.cesiumJS.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.wrapper.cesiumJS.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.cesiumJS.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onFlyToButtonClick(data) {
        this.getReference('cesium-component').flyTo();
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
