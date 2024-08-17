import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Fetch
 * @extends Neo.core.Base
 */
class Fetch extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.connection.Fetch'
         * @protected
         */
        className: 'Neo.data.connection.Fetch'
    }

    /**
     * @member {Object} defaultHeaders=null
     */
    defaultHeaders = null

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
     * @returns {Promise<any>}
     */
    options(url, config) {
        return this.request(url, config, 'options');
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
     * @param {Object} data
     * @returns {Promise<any>}
     */
    post(url, config, data) {
        return this.request(url, config, 'post', data);
    }

    /**
     * @param {Object|String} url
     * @param {Object} config
     * @param {Object} data
     * @returns {Promise<any>}
     */
    put(url, config, data) {
        return this.request(url, config, 'put', data);
    }

    /**
     * @param {Object|String} url
     * @param {Object} config={}
     * @param {String} method
     * @param {Object} [data]
     * @returns {Promise<any>}
     */
    request(url, config={}, method, data) {
        if (!Neo.isString(url)) {
            config = url;
            url    = config.url
        } else {
            config.url = config
        }

        return fetch(url, {
            body  : data,
            method: method || config.method
        }).then(resp => {
            let response = {
                ok        : resp.ok,
                redirected: resp.redirected,
                request   : config,
                status    : resp.status,
                statusText: resp.statusText,
                type      : resp.type,
                url       : resp.url
            };

            return resp[config.responseType || 'json']()
                .then(data => {
                    response.data = data;
                })
                .then(() => (resp.ok ? response : Promise.reject(response)))
        })
    }
}

export default Neo.setupClass(Fetch);
