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
                'create'
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
     *
     * @param {Object} data
     * @param {String} data.id
     */
    create(data) {
        const me = this;

        if (!me.scriptsLoaded) {
            console.log('NOT scriptsLoaded');
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

    insertOpenStreetMapsScripts() {
        const me       = this,
              basePath = me.downloadPath + me.version + '/';

        Promise.all([
            DomAccess.loadScript(    basePath + 'mapbox-gl.js'),
            DomAccess.loadStylesheet(basePath + 'mapbox-gl.css')
        ]).then(() => {
            me.scriptsLoaded = true;
            console.log('insertOpenStreetMapsScripts');
        });
    }

    /**
     *
     */
    onMapLoaded() {
        console.log('onMapLoaded', this);
    }
}

Neo.applyClassConfig(OpenStreetMaps);

let instance = Neo.create(OpenStreetMaps);

Neo.applyToGlobalNs(instance);

export default instance;