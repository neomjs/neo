import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';

/**
 * Helper class to include Google's Material Web Components into your neo.mjs app
 * https://www.amcharts.com/docs/v4/
 * @class Neo.main.addon.Mwc
 * @extends Neo.core.Base
 * @singleton
 */
class Mwc extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.main.addon.Mwc'
         * @protected
         */
        className: 'Neo.main.addon.Mwc',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'checkValidity',
                'loadButtonModule',
                'loadTextFieldModule'
            ]
        }
    }}

    /**
     *
     * @param {String} id
     * @returns {Boolean}
     */
    checkValidity(id) {
        return document.getElementById(id).checkValidity();
    }

    /**
     *
     */
    loadButtonModule() {
        if (Neo.config.environment === 'development') {
            import(
                /* webpackIgnore: true */
                'https://unpkg.com/@material/mwc-button@0.23.0-canary.78b1eaac.0/mwc-button.js?module'
                );
        } else {
            // dist/development & dist/production
            import('@material/mwc-button');
        }
    }

    /**
     *
     */
    loadTextFieldModule() {
        if (Neo.config.environment === 'development') {
            import(
                /* webpackIgnore: true */
                'https://unpkg.com/@material/mwc-textfield@0.23.0-canary.fe7cca31.0/mwc-textfield.js?module'
                );
        } else {
            // dist/development & dist/production
            import('@material/mwc-textfield');
        }
    }

    /**
     *
     * @param {String} id
     * @returns {Boolean}
     */
    reportValidity(id) {
        return document.getElementById(id).reportValidity();
    }
}

Neo.applyClassConfig(Mwc);

let instance = Neo.create(Mwc);

Neo.applyToGlobalNs(instance);

export default instance;
