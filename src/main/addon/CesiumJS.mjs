import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * See: https://github.com/CesiumGS/cesium
 * @class Neo.main.addon.CesiumJS
 * @extends Neo.core.Base
 * @singleton
 */
class CesiumJS extends Base {
    /**
     * @member {Object} viewers={}
     * @protected
     */
    viewers = {}

    static getConfig() {return {
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
                'destroy'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }}

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

        return;

        // Fly the camera to San Francisco at the given longitude, latitude, and height.
        viewer.camera.flyTo({
            destination : Cesium.Cartesian3.fromDegrees(-122.4175, 37.655, 400),
            orientation : {
                heading : Cesium.Math.toRadians(0.0),
                pitch : Cesium.Math.toRadians(-15.0),
            }
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

Neo.applyClassConfig(CesiumJS);

let instance = Neo.create(CesiumJS);

Neo.applyToGlobalNs(instance);

export default instance;
