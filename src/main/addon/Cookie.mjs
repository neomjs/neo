import Base from './Base.mjs';

/**
 * Basic Read and write access for document.cookie
 * @class Neo.main.addon.Cookie
 * @extends Neo.main.addon.Base
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
        }
    }

    /**
     * @param {String} name
     * @returns {String}
     */
    getCookie(name) {
        let {cookie} = document
            .split('; ')
            .find(row => row.startsWith(name));

        return cookie ? cookie.split('=')[1] : null
    }

    /**
     * @returns {String}
     */
    getCookies() {
        return document.cookie
    }

    /**
     * @param {String} value
     */
    setCookie(value) {
        document.cookie = value
    }
}

Neo.setupClass(Cookie);

export default Cookie;
