import Base from '../../core/Base.mjs';

/**
 * Basic Read and write access for document.cookie
 * @class Neo.main.addon.Cookie
 * @extends Neo.core.Base
 * @singleton
 */
class Cookie extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Cookie'
         * @protected
         */
        className: 'Neo.main.addon.Cookie',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'getCookie',
                'getCookies',
                'setCookie'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @param {String} name
     * @returns {String}
     */
    getCookie(name) {
        const cookie = document.cookie
            .split('; ')
            .find(row => row.startsWith(name));

        return cookie ? cookie.split('=')[1] : null;
    }

    /**
     * @returns {String}
     */
    getCookies() {
        return document.cookie;
    }

    /**
     * @param {String} value
     */
    setCookie(value) {
        document.cookie = value;
    }
}

let instance = Neo.applyClassConfig(Cookie);

export default instance;
