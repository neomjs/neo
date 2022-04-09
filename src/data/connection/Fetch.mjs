import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Fetch
 * @extends Neo.core.Base
 */
class Fetch extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.connection.Fetch'
         * @protected
         */
        className: 'Neo.data.connection.Fetch'
    }}

    /**
     * @param {Object|String} url
     * @param {Object} config
     */
    delete(url, config) {
        return this.request(url, config, 'delete');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     */
    get(url, config) {
        return this.request(url, config, 'get');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     */
    post(url, config) {
        return this.request(url, config, 'post');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @param {String} method
     * @param {Object} [data]
     */
    request(url, config, method, data) {
        if (!Neo.isString(url)) {
            config = url;
            url    = config.url;
        }
    }
}

Neo.applyClassConfig(Fetch);

export default Fetch;
