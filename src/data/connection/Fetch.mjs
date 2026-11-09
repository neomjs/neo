import Base from './Base.mjs';

/**
 * @class Neo.data.connection.Fetch
 * @extends Neo.data.connection.Base
 */
class Fetch extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.connection.Fetch'
         * @protected
         */
        className: 'Neo.data.connection.Fetch',
        /**
         * @member {String} ntype='connection-fetch'
         * @protected
         */
        ntype: 'connection-fetch'
    }

    /**
     * Defaults apply to every URL requested by this instance, including the Neo.Fetch singleton.
     * Per-request values override matching names case-insensitively.
     * @member {HeadersInit|null} defaultHeaders=null
     */
    defaultHeaders = null

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async read(params) {
        return this.get(this.url, params);
    }

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
     * @summary Dispatches a request through the connection's scoped URL resolver.
     * The response hands the request config back as `response.request`. In both URL forms its `url`
     * is the caller's original string; the resolved or redirected address is `response.url`.
     * Header inputs are copied; remote callers use serializable records or tuple lists.
     * @param {Object|String} url
     * @param {Object} config={}
     * @param {HeadersInit} [config.headers] Request headers, merged over connection defaults.
     * @param {String} method
     * @param {Object} [data]
     * @returns {Promise<any>}
     */
    async request(url, config={}, method, data) {
        if (!Neo.isString(url)) {
            config = url;
            url    = config.url
        } else {
            config.url = url
        }

        const headers = new Headers(this.defaultHeaders ?? undefined);
        new Headers(config.headers ?? undefined).forEach((value, name) => headers.set(name, value));

        return fetch(this.resolveUrl(url), {
            body  : data,
            headers,
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
