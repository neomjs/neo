import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * See: https://github.com/CesiumGS/cesium
 * @class Neo.main.addon.CesiumJS
 * @extends Neo.core.Base
 * @singleton
 */
class CesiumJS extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.CesiumJS'
         * @protected
         */
        className: 'Neo.main.addon.CesiumJS',
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
        console.log('onFilesLoaded');
    }
}

Neo.applyClassConfig(CesiumJS);

let instance = Neo.create(CesiumJS);

Neo.applyToGlobalNs(instance);

export default instance;
