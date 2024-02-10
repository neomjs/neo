import Base from './Base.mjs';

/**
 * Helper class to include Google's Material Web Components into your neo.mjs app
 * https://github.com/material-components/material-components-web
 *
 * You need to add the following dependencies into your package.json:
 * @material/mwc-button
 * @material/mwc-textfield
 *
 * You also need to un-comment the related imports.
 * Recommendation: Copy this file into your workspace (src/main/addon), adjust it there and add the custom addon
 * into the neo-config.json of your app. E.g.: [..., "WS/Mwc"].
 *
 * @class Neo.main.addon.Mwc
 * @extends Neo.main.addon.Base
 */
class Mwc extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Mwc'
         * @protected
         */
        className: 'Neo.main.addon.Mwc',
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'checkValidity',
                'loadButtonModule',
                'loadTextFieldModule',
                'reportValidity'
            ]
        }
    }

    /**
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
                'https://unpkg.com/@material/mwc-button@0.26.1/mwc-button.js?module'
                );
        } else {
            // dist/development & dist/production
            // import('@material/mwc-button'); // <= comment me in
        }
    }

    /**
     *
     */
    loadTextFieldModule() {
        if (Neo.config.environment === 'development') {
            import(
                /* webpackIgnore: true */
                'https://unpkg.com/@material/mwc-textfield@0.26.1/mwc-textfield.js?module'
                );
        } else {
            // dist/development & dist/production
            // import('@material/mwc-textfield'); // <= comment me in
        }
    }

    /**
     * @param {String} id
     * @returns {Boolean}
     */
    reportValidity(id) {
        return document.getElementById(id).reportValidity();
    }
}

Neo.applyClassConfig(Mwc);

export default Mwc;
