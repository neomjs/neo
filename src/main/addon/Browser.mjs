import Base from './Base.mjs';

/**
 * Basic information abut the browser using navigator
 * @class Neo.main.addon.Browser
 * @extends Neo.main.addon.Base
 */
class Browser extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Browser'
         * @protected
         */
        className: 'Neo.main.addon.Browser',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'getBrowserType',
                'checkBrowserName'
            ]
        }
    }

    construct(config) {
        super.construct(config);

        this.getBrowserType(true);
    }

    /**
     * @param {Boolean} addBaseClass
     * @returns {String}
     */
    getBrowserType(addBaseClass = false) {
        const ua = navigator.userAgent || navigator.vendor || window.opera,
            mobileRegex = /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i,
            tabletRegex = /android|ipad|playbook|silk/i;
        let type = 'desktop';

        if (mobileRegex.test(ua) || tabletRegex.test(ua)) {
            type = 'tablet';

            // It's a mobile device or tablet, now let's distinguish between them
            if (window.innerWidth <= 800 && window.innerHeight <= 900) {
                type = 'phone';
            }
        }

        if (addBaseClass) {
            document.body.classList.add(`neo-${type}`);
            if (type !== 'desktop') {
                document.body.classList.add(`neo-mobile`);
            }
        }

        return type;
    }

    /**
     * @param {String} str
     * @returns {String}
     */
    checkBrowserName(str) {
        return navigator.userAgent.toLowerCase().indexOf(str.toLowerCase()) !== -1;
    }
}

Neo.setupClass(Browser);

export default Browser;
