import Base from '../../core/Base.mjs';

/**
 * Required for the online version of the examples & docs app
 * @class Neo.main.addon.GoogleAnalytics
 * @extends Neo.core.Base
 * @singleton
 */
class GoogleAnalytics extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.GoogleAnalytics'
             * @private
             */
            className: 'Neo.main.addon.GoogleAnalytics',
            /**
             * @member {Boolean} singleton=true
             * @private
             */
            singleton: true
        }
    }

    /**
     * @param {Object} config
     */
    constructor(config) {
        super(config);
        this.insertGoogleAnalyticsScript();
    }

    /**
     *
     * @private
     */
    insertGoogleAnalyticsScript() {
        window.dataLayer = window.dataLayer || [];

        function gtag() {
            dataLayer.push(arguments);
        }

        gtag('js', new Date());
        gtag('config', Neo.config.gtagId);

        const script = document.createElement('script');

        Object.assign(script, {
            async: true,
            src  : `https://www.googletagmanager.com/gtag/js?id=${Neo.config.gtagId}`
        });

        document.head.appendChild(script);
    }
}

Neo.applyClassConfig(GoogleAnalytics);

let instance = Neo.create(GoogleAnalytics);

Neo.applyToGlobalNs(instance);

export default instance;