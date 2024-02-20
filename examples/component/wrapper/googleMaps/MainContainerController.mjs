import ComponentController from '../../../../src/controller/Component.mjs';

/**
 * @class Neo.examples.component.wrapper.googleMaps.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends ComponentController {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.wrapper.googleMaps.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.component.wrapper.googleMaps.MainContainerController'
    }

    /**
     * @param {Object} data
     */
    onFlyToButtonClick(data) {
        this.getReference('google-maps-component').panTo({lat: 37.655, lng: -122.4175})
    }

    /**
     * @param {Object} data
     */
    onFlyToIcelandButtonClick(data) {
        this.getReference('google-maps-component').panTo({ lat: 64.963051,lng: -19.020835})
    }

    /**
     * @param {Object} data
     */
    onMapZoomChange(data) {
        this.getReference('zoom-field').value = data.value;
    }

    /**
     * @param {Object} data
     */
    onRemoveMarkerButtonClick(data) {
        let button = data.component,
            map    = this.getReference('google-maps-component');

        if (button.mode === 'hide') {
            button.set({
                iconCls: 'fa fa-location-dot',
                mode   : 'show',
                text   : 'Show marker'
            });

            map.hideMarker('-13')
        } else {
            button.set({
                iconCls: 'fa-solid fa-trash',
                mode   : 'hide',
                text   : 'Hide marker'
            });

            map.showMarker('-13')
        }
    }

    /**
     * @param {Object} data
     */
    onZoomFieldChange(data) {
        this.getReference('google-maps-component').zoom = data.value;
    }
}

Neo.setupClass(MainContainerController);

export default MainContainerController;
