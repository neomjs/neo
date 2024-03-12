import Base      from './Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
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
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.loadFiles();
    }

    /**
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
        });
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    createOsmBuildings(data) {
        this.viewers[data.id].scene.primitives.add(Cesium.createOsmBuildings());
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    destroy(data) {
        // todo
        console.log('main.addon.CesiumJS: destroy()', data);
    }

    /**
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
        });
    }

    /**
     * @protected
     */
    loadFiles() {
        Promise.all([
            DomAccess.loadScript(    'https://cesium.com/downloads/cesiumjs/releases/1.92/Build/Cesium/Cesium.js'),
            DomAccess.loadStylesheet('https://cesium.com/downloads/cesiumjs/releases/1.92/Build/Cesium/Widgets/widgets.css')
        ]).then(() => {
            this.onFilesLoaded();
        });
    }

    /**
     *
     */
    onFilesLoaded() {
        Cesium.Ion.defaultAccessToken = Neo.config.cesiumJsToken;
    }
}

Neo.setupClass(CesiumJS);

export default CesiumJS;
