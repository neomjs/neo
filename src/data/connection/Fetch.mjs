import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Fetch
 * @extends Neo.core.Base
 */
class Fetch extends Base {
    /**
     * @member {Object} defaultHeaders=null
     */
    defaultHeaders = null

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
     * @returns {Promise<any>}
     */
    delete(url, config) {
        return this.request(url, config, 'delete');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @returns {Promise<any>}
     */
    get(url, config) {
        return this.request(url, config, 'get');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @returns {Promise<any>}
     */
    head(url, config) {
        return this.request(url, config, 'head');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @param {Object} data
     * @returns {Promise<any>}
     */
    patch(url, config, data) {
        return this.request(url, config, 'patch', data);
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @returns {Promise<any>}
     */
    post(url, config) {
        return this.request(url, config, 'post');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @returns {Promise<any>}
     */
    put(url, config) {
        return this.request(url, config, 'put');
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @param {String} method
     * @param {Object} [data]
     * @returns {Promise<any>}
     */
    request(url, config, method, data) {
        if (!Neo.isString(url)) {
            config = url;
            url    = config.url;
        }

        return fetch(url)
            .then(resp => {
                console.log(resp);

                let response = {
                    ok        : resp.ok,
                    redirected: resp.redirected,
                    request   : config,
                    status    : resp.status,
                    statusText: resp.statusText,
                    type      : resp.type,
                    url       : resp.url
                };

                return response
            })
    }
}

Neo.applyClassConfig(Fetch);

export default Fetch;
