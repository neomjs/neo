import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Helper class to include OpenStreetMaps into your neo.mjs app
 * https://docs.mapbox.com/mapbox-gl-js/overview/
 * @class Neo.main.lib.OpenStreetMaps
 * @extends Neo.core.Base
 * @singleton
 */
class OpenStreetMaps extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.lib.OpenStreetMaps'
         * @private
         */
        className: 'Neo.main.lib.OpenStreetMaps',
        /**
         * Stores all map data inside an object. key => map id
         * No array since in case a map gets loaded multiple times, we only want to apply the last data on mount.
         * @member {Object} dataMap={}
         * @private
         */
        dataMap: {},
        /**
         * @member {String} downloadPath='https://api.mapbox.com/mapbox-gl-js/'
         * @private
         */
        downloadPath: 'https://api.mapbox.com/mapbox-gl-js/',
        /**
         * Stores all map ids inside an object
         * @member {Object} maps={}
         * @private
         */
        maps: {},
        /**
         * Stores all map config objects which arrived before the map lib scripts got loaded
         * @member {Object[]} mapsToCreate=[]
         * @private
         */
        mapsToCreate: [],
        /**
         * @member {Boolean} scriptsLoaded_=true
         * @private
         */
        scriptsLoaded_: false,
        /**
         * @member {Boolean} singleton=true
         * @private
         */
        singleton: true,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @private
         */
        remote: {
            app: [
                'create',
                'updateData'
            ]
        },
        /**
         * @member {String} version='v1.8.1'
         * @private
         */
        version: 'v1.8.1',
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        if (Neo.config.useOpenStreetMaps) {
            this.insertOpenStreetMapsScripts();
        }
    }

    /**
     * Triggered after the scriptsLoaded config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetScriptsLoaded(value, oldValue) {
        if (value) {
            const me = this;

            me.mapsToCreate.forEach(config => {
                me.create(config);
            });

            me.mapsToCreate = [];

            setTimeout(() => {
                Object.entries(me.dataMap).forEach(([key, dataValue]) => {
                    me.updateData(dataValue);
                });

                me.dataMap = {};
            }, 2000);
        }
    }

    /**
     *
     * @param {Object} data
     * @param {String} data.id
     */
    create(data) {
        const me = this;

        if (!me.scriptsLoaded) {
            me.mapsToCreate.push(data);
        } else {
            console.log('scriptsLoaded');

            mapboxgl.accessToken = 'pk.eyJ1IjoidG9iaXUiLCJhIjoiY2s4dTlsdHA5MDRmYzNtcGxlczFpcGVncyJ9.qcmzDjpdyQeLtz9z7d7CkA';

            me.maps[data.id] = new mapboxgl.Map({
                container: data.id,
                style    : 'mapbox://styles/tobiu/ck8u9n0fo0o241imgid28vre2'
            });

            me.maps[data.id].on('load', me.onMapLoaded.bind(me));
        }
    }

    /**
     *
     * @param {String} id
     * @return {Boolean}
     */
    hasMap(id) {
        return !!this.maps[id];
    }

    insertOpenStreetMapsScripts() {
        const me       = this,
              basePath = me.downloadPath + me.version + '/';

        Promise.all([
            DomAccess.loadScript(    basePath + 'mapbox-gl.js'),
            DomAccess.loadStylesheet(basePath + 'mapbox-gl.css')
        ]).then(() => {
            me.scriptsLoaded = true;
        });
    }

    /**
     *
     */
    onMapLoaded(event) {
        const map = event.target;

        map.addSource('covid19', {
            type: 'geojson',
            data: {
                type    : 'FeatureCollection',
                features: []
            }
        });

        map.addLayer(
            {
                'id': 'covid19-heat',
                'type': 'heatmap',
                'source': 'covid19',
                'maxzoom': 9,
                'paint': {
                    // Increase the heatmap weight based on frequency and property magnitude
                    'heatmap-weight': [
                        'interpolate',
                        ['linear'],
                        ['get', 'cases'],
                        0,
                        0,
                        1000,
                        1
                    ],
                    // Increase the heatmap color weight by zoom level
                    // heatmap-intensity is a multiplier on top of heatmap-weight
                    'heatmap-intensity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0,
                        3,
                        9,
                        5
                    ],
                    // Color ramp for heatmap.  Domain is 0 (low) to 1 (high).
                    // Begin color ramp at 0-stop with a 0-transparency color
                    // to create a blur-like effect.
                    'heatmap-color': [
                        'interpolate',
                        ['linear'],
                        ['heatmap-density'],
                        0,
                        'rgba(0,0,0,0)',
                        0.1,
                        '#927903',
                        0.15,
                        '#ffd403',
                        1,
                        '#ff0000'
                    ],
                    // Adjust the heatmap radius by zoom level
                    'heatmap-radius': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 2, 1, 4, 2, 8, 3, 16, 4, 32, 5, 64, 6, 128, 7, 256, 8, 512, 9, 1024
                    ],
                    // Transition from heatmap to circle layer by zoom level
                    'heatmap-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        5, .95, 6, 0
                    ]
                }
            },
            'waterway-label'
        );
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.id
     */
    updateData(data) {
        const me = this;

        console.log('####### update data', data);

        if (!me.scriptsLoaded || !me.hasMap(data.id)) {
            me.dataMap[data.id] = data;
        } else {
            const map    = me.maps[data.id],
                  source = map.getSource('covid19');

            if (source) {
                source.setData(data.data);
            }
        }
    }
}

Neo.applyClassConfig(OpenStreetMaps);

let instance = Neo.create(OpenStreetMaps);

Neo.applyToGlobalNs(instance);

export default instance;