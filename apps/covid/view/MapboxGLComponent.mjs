import {default as BaseComponent} from '../../../src/component/wrapper/MapboxGL.mjs';

/**
 * @class Covid.view.MapboxGLComponent
 * @extends Neo.component.wrapper.MapboxGL
 */
class MapboxGLComponent extends BaseComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Covid.view.MapboxGLComponent'
         * @private
         */
        className: 'Covid.view.MapboxGLComponent',
        /**
         * @member {String} ntype='covid-mapboxgl-map'
         * @private
         */
        ntype: 'covid-mapboxgl-map',
        /**
         * @member {String|null} accessToken
         */
        accessToken: 'pk.eyJ1IjoidG9iaXUiLCJhIjoiY2s4dTlsdHA5MDRmYzNtcGxlczFpcGVncyJ9.qcmzDjpdyQeLtz9z7d7CkA',
        /**
         * @member {Object} center={lat: 40, lng: 20}
         */
        center: {lat: 40, lng: 20},
        /**
         * @member {String} dataSourceId='covid19'
         */
        dataSourceId: 'covid19',
        /**
         * Additional layers to add to the map style
         * @member {Object[]}
         */
        layers: [],
        /**
         * https://docs.mapbox.com/mapbox-gl-js/style-spec/
         * @member {Object|String} mapboxStyle='mapbox://styles/tobiu/ck8u9n0fo0o241imgid28vre2'
         */
        mapboxStyle: 'mapbox://styles/tobiu/ck8yaxakx11zx1ilgshq451cv',
        /**
         * Version for the neo-dark theme
         * @member {Object|String} mapboxStyle='mapbox://styles/tobiu/ck8u9n0fo0o241imgid28vre2'
         */
        mapboxStyleDark: 'tobiu/ck8yaxakx11zx1ilgshq451cv',
        /**
         * Version for the neo-light theme
         * @member {Object|String} mapboxStyle='mapbox://styles/tobiu/ck8u9n0fo0o241imgid28vre2'
         */
        mapboxStyleLight: 'mapbox://styles/tobiu/ck8yeacdx22a41jo1do9iafd7',
        /**
         * Data sources for the map.
         * id is a custom property which will get passed as the first param for:
         * https://docs.mapbox.com/mapbox-gl-js/api/#map#addsource
         * @member {Object[]}
         */
        sources: [{
            id  : 'covid19',
            type: 'geojson',
            data: {
                type    : 'FeatureCollection',
                features: []
            }
        }, {
            id  : 'dem',
            type: 'raster-dem',
            url : 'mapbox://mapbox.terrain-rgb'
        }]
    }}
}

Neo.applyClassConfig(MapboxGLComponent);

export {MapboxGLComponent as default};