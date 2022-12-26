import ComponentController from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.wrapper.googleMaps.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.googleMaps.MainContainerController'
    }}

    /**
     * @param {Object} data
     */
    onFlyToButtonClick(data) {
        // todo
        /*this.getReference('google-maps-component').flyTo({
            destination: [-122.4175, 37.655, 400],
            heading    : 0.0,
            pitch      : -15.0
        });*/
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
