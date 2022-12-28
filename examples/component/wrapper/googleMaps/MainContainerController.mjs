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

            map.hideMarker('1');
        } else {
            button.set({
                iconCls: 'fa-solid fa-trash',
                mode   : 'hide',
                text   : 'Hide marker'
            });

            map.showMarker('1');
        }
    }

    /**
     * @param {Object} data
     */
    onZoomFieldChange(data) {
        this.getReference('google-maps-component').zoom = data.value;
    }
}

Neo.applyClassConfig(MainContainerController);

export default MainContainerController;
