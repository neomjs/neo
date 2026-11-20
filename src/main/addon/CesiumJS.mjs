import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * @summary Main-thread Cesium viewer commands wait for the library and stylesheet to load.
 * See: https://github.com/CesiumGS/cesium
 * @class Neo.main.addon.CesiumJS
 * @extends Neo.main.addon.Base
 */
class CesiumJS extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.CesiumJS'
         * @protected
         */
        className: 'Neo.main.addon.CesiumJS',

        interceptRemotes: ['create', 'createOsmBuildings', 'flyTo'],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'create',
                'createOsmBuildings',
                'destroy',
                'flyTo'
            ]
        }
    }

    /**
     * @member {Object} viewers={}
     * @protected
     */
    viewers = {}

    /**
     * @summary Creates the requested globe after addon readiness admits the remote call.
     * @param {Object} data
     * @param {Boolean} data.createOsmBuildings
     * @param {String} data.id
     */
    create(data) {
        this.viewers[data.id] = new Cesium.Viewer(data.id, {
            terrainProvider: Cesium.createWorldTerrain()
        });

        data.createOsmBuildings && this.createOsmBuildings({
            id: data.id
        })
    }

    /**
     * @summary Adds the library's OpenStreetMap buildings to an existing globe.
     * @param {Object} data
     * @param {String} data.id
     */
    createOsmBuildings(data) {
        this.viewers[data.id].scene.primitives.add(Cesium.createOsmBuildings())
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroy(data) {
        // todo
        console.log('main.addon.CesiumJS: destroy()', data)
    }

    /**
     * @summary Flies an existing globe to the requested location and orientation.
     * @param {Object} data
     * @param {Number[]} data.destination
     * @param {Number} data.heading
     * @param {String} data.id
     * @param {Number} data.pitch
     */
    flyTo(data) {
        this.viewers[data.id].camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(...data.destination),
            orientation: {
                heading: Cesium.Math.toRadians(data.heading),
                pitch  : Cesium.Math.toRadians(data.pitch),
            }
        })
    }

    /**
     * @summary Loads both Cesium resources and configures its token before the addon becomes ready.
     * @returns {Promise<void>}
     * @protected
     */
    async loadFiles() {
        await Promise.all([
            DomAccess.loadScript(    'https://cesium.com/downloads/cesiumjs/releases/1.92/Build/Cesium/Cesium.js'),
            DomAccess.loadStylesheet('https://cesium.com/downloads/cesiumjs/releases/1.92/Build/Cesium/Widgets/widgets.css')
        ]);
        Cesium.Ion.defaultAccessToken = Neo.config.cesiumJsToken
    }
}

export default Neo.setupClass(CesiumJS);
