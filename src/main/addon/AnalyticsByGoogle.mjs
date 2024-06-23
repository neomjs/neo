import Base from './Base.mjs';

/**
 * Required for the online version of the examples & docs app
 * We can not name the file GoogleAnalytics, since it does break when using uBlock origin for dist versions.
 * See: https://github.com/neomjs/neo/issues/651
 * @class Neo.main.addon.AnalyticsByGoogle
 * @extends Neo.main.addon.Base
 */
class AnalyticsByGoogle extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.AnalyticsByGoogle'
         * @protected
         */
        className: 'Neo.main.addon.AnalyticsByGoogle'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.insertGoogleAnalyticsScript()
    }

    /**
     * @protected
     */
    insertGoogleAnalyticsScript() {
        window.dataLayer = window.dataLayer || [];

        function gtag() {
            dataLayer.push(arguments)
        }

        gtag('js', new Date());
        gtag('config', Neo.config.gtagId);

        let script = document.createElement('script');

        Object.assign(script, {
            async: true,
            src  : `https://www.googletagmanager.com/gtag/js?id=${Neo.config.gtagId}`
        });

        document.head.appendChild(script)
    }
}

Neo.setupClass(AnalyticsByGoogle);

export default AnalyticsByGoogle;
