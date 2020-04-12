import {default as OpenStreetMapComponent} from '../../../src/component/wrapper/OpenStreetMap.mjs';

/**
 * @class Covid.view.OpenStreetMapsComponent
 * @extends Neo.component.wrapper.OpenStreetMap
 */
class OpenStreetMapsComponent extends OpenStreetMapComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.OpenStreetMapsComponent'
         * @private
         */
        className: 'Covid.view.OpenStreetMapsComponent',
        /**
         * @member {String} ntype='covid-openstreet-map'
         * @private
         */
        ntype: 'covid-openstreet-map',
        /**
         *
         * @member {String|null} accessToken
         */
        accessToken: 'pk.eyJ1IjoidG9iaXUiLCJhIjoiY2s4dTlsdHA5MDRmYzNtcGxlczFpcGVncyJ9.qcmzDjpdyQeLtz9z7d7CkA',
        /**
         * @member {Object} center={lat: 40, lng: 20}
         */
        center: {lat: 40, lng: 20}
    }}
}

Neo.applyClassConfig(OpenStreetMapsComponent);

export {OpenStreetMapsComponent as default};