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
     * @param {Function} method
     * @param {Object} data
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
