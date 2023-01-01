import ComponentController from '../../../../node_modules/neo.mjs/src/controller/Component.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MainContainerController
 * @extends Neo.controller.Component
 */
class MapComponentController extends ComponentController {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.component.wrapper.googleMaps.MapComponentController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.googleMaps.MapComponentController'
    }}

    /**
     * @param {Object} data
     */
    onMapZoomChance(data) {
        this.getReference('zoom-field').value = data.value;
    }
}

Neo.applyClassConfig(MapComponentController);

export default MapComponentController;
