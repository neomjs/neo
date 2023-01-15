import Base from '../../core/Base.mjs';

/**
 * Basic Read and write access for document.cookie
 * @class Neo.main.addon.Cookie
 * @extends Neo.core.Base
 * @singleton
 */
class Cookie extends Base {
    static getConfig() {return {
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
    }}

    /**
     * @param {String} name
     * @returns {String}
     */
    getCookie(name) {
        return document.cookie
            .split('; ')
            .find(row => row.startsWith(name))
            .split('=')[1];
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

export default Neo.applyClassConfig(Cookie);
