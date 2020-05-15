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
     *
     * @private
     */
    insertGoogleAnalyticsScript() {
        window.dataLayer = window.dataLayer || [];

        function gtag() {
            dataLayer.push(arguments);
        }

        gtag('js', new Date());
        gtag('config', 'UA-153734404-1');

        const script = document.createElement('script');

        Object.assign(script, {
            async: true,
            src  : 'https://www.googletagmanager.com/gtag/js?id=UA-153734404-1'
        });

        document.head.appendChild(script);
    }

    /**
     *
     */
    onDomContentLoaded() {
        this.insertGoogleAnalyticsScript();
    }
}

Neo.applyClassConfig(GoogleAnalytics);

let instance = Neo.create(GoogleAnalytics);

Neo.applyToGlobalNs(instance);

export default instance;