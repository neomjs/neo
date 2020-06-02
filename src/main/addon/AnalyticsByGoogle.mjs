import Base from '../../core/Base.mjs';

/**
 * Required for the online version of the examples & docs app
 * We can not name the file GoogleAnalytics, since it does break when using uBlock origin for dist versions.
 * @class Neo.main.addon.AnalyticsByGoogle
 * @extends Neo.core.Base
 * @singleton
 */
class AnalyticsByGoogle extends Base {
    static getConfig() {
        return {
            /**
             * @member {String} className='Neo.main.addon.AnalyticsByGoogle'
             * @private
             */
            className: 'Neo.main.addon.AnalyticsByGoogle',
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

Neo.applyClassConfig(AnalyticsByGoogle);

let instance = Neo.create(AnalyticsByGoogle);

Neo.applyToGlobalNs(instance);

export default instance;