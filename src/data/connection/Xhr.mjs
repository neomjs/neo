import Base from './Base.mjs';

/**
 * @class Neo.data.connection.Xhr
 * @extends Neo.data.connection.Base
 */
class Xhr extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.connection.Xhr'
         * @protected
         */
        className: 'Neo.data.connection.Xhr',
        /**
         * @member {String} ntype='connection-xhr'
         * @protected
         */
        ntype: 'connection-xhr',
        /**
         * @member {Function} callback=null
         */
        callback: null,
        /**
         * @member {Object|null} defaultHeaders=null
         */
        defaultHeaders: null,
        /**
         * @member {Object} requests={}
         */
        requests: {},
        /**
         * @member {Object} scope=null
         */
        scope: null,
        /**
         * @member {Number} timeout=5000
         */
        timeout: 5000
    }

    /**
     * @summary GETs the connection's `url` with the read params composed into its query by `appendParams()`.
     * Two read params are not query params: `url` replaces the connection's URL for this read, and `headers` are
     * sent as request headers over `defaultHeaders`.
     * @param {Object} [params={}]
     * @param {Object} [params.headers] Request headers for this read
     * @param {String} [params.url] The URL to read instead of the connection's
     * @returns {Promise<any>}
     */
    async read({headers, url, ...query}={}) {
        return this.promiseJson({headers, params: query, url: url || this.url})
    }

    /**
     * We cannot clone event objects across messaging
     * @param {Object} event
     */
    getResponse(event) {
        let {target} = event,
            {readyState, response, status, statusText} = target;

        return {
            readyState,
            response,
            status,
            statusText,
            headers: target.getAllResponseHeaders()
        }
    }

    /**
     * @param {Object} e
     */
    onError(e) {
        let me      = this,
            id      = e.currentTarget.neoId,
            request = me.requests[id],
            cb      = request.callback;

        cb?.apply(request.scope || me, [me.getResponse(e), false]);

        Object.entries(request).forEach(([key, value]) => {
            request[key] = null;
        });

        delete me.requests[id]
    }

    /**
     * @summary Calls the request back with its response, as a success only for an answer the server accepted.
     * A status outside 200–299 is a failure, as the Fetch connection rejects it. A `file://` read reports status 0
     * on its `load` event, so status 0 with a body is a success; a failed network request fires `error` instead.
     * @param {Object} e
     */
    onLoad(e) {
        let me                 = this,
            id                 = e.currentTarget.neoId,
            request            = me.requests[id],
            cb                 = request.callback,
            {response, status} = e.target,
            success            = (status >= 200 && status < 300) || (status === 0 && Boolean(response));

        cb?.apply(request.scope || me, [me.getResponse(e), success]);

        Object.entries(request).forEach(([key, value]) => {
            request[key] = null
        });

        delete me.requests[id]
    }

    /**
     *
     */
    onProgress() {

    }

    /**
     * @summary Resolves an accepted answer with its parsed body as `json`, and rejects a refused one with its response.
     * The rejection carries the response's `status` and `statusText`, and `json` when the refused body parses, so a
     * caller reads a server's error body from it. An accepted body that does not parse rejects with the parse error.
     * @param {Object} opts The request options of {@link #request}
     * @returns {Promise<Object>} The response, with its parsed body as `json`
     */
    promiseJson(opts) {
        let me = this;

        return new Promise((resolve, reject) => {
            opts.callback = function(data, success) {
                if (success) {
                    let json;
                    try {
                        json = JSON.parse(data.response);

                        resolve(Object.assign(data, { json }))
                    } catch(err) {
                        reject({
                            reject: true,
                            error : err.message
                        })
                    }
                } else {
                    try {
                        data.json = JSON.parse(data.response)
                    } catch {}

                    reject(data)
                }
            };

            me.request(opts)
        })
    }

    /**
     * @summary Resolves an accepted answer with its response, and rejects a refused one with its response and `status`.
     * @param {Object} opts The request options of {@link #request}
     * @returns {Promise<Object>} The response
     */
    promiseRequest(opts) {
        let me = this;

        return new Promise((resolve, reject) => {
            opts.callback = function(data, success) {
                if (success) {
                    resolve(data)
                } else {
                    reject(data)
                }
            };

            me.request(opts)
        })
    }

    /**
     * @summary Dispatches Xhr after URL resolution, retaining the framework-scope bypass.
     * @param {Object} opts
     * @param {Function} opts.callback
     * @param {Object} opts.data
     * @param {Object} opts.headers Request headers. They replace `defaultHeaders` of the same name in any case, as HTTP
     * header names are, the way the Fetch connection merges them
     * @param {Boolean} opts.insideNeo true for calls with relative URLs inside the framework scope
     * @param {String} opts.method DELETE, GET, POST, PUT
     * @param {Object|URLSearchParams|Array[]|String} opts.params Composed into the query by `appendParams()`
     * @param {String} opts.responseType
     * @param {Object} opts.scope
     * @param {String} opts.url
     * @returns {XMLHttpRequest}
     * @protected
     */
    request(opts) {
        let me      = this,
            headers = new Headers(me.defaultHeaders ?? undefined),
            id      = Neo.getId('xhr-request'),
            method  = opts.method || 'GET',
            xhr     = new XMLHttpRequest();

        new Headers(opts.headers ?? undefined).forEach((value, name) => headers.set(name, value));

        if (!opts.url) {
            console.error('Neo.Xhr.request without a given url' + JSON.stringify(opts))
        } else {
            opts.url = me.resolveUrl(opts.url, opts.insideNeo);

            if (opts.params) {
                opts.url = me.appendParams(opts.url, opts.params)
            }

            xhr.neoId = id;

            me.requests[id] = {
                callback: typeof opts.callback === 'function' && opts.callback,
                scope   : opts.scope,
                xhr
            };

            xhr.responseType = opts.responseType || 'text';
            xhr.timeout      = me.timeout;

            xhr.addEventListener('abort',    me.onError.bind(me));
            xhr.addEventListener('error',    me.onError.bind(me));
            xhr.addEventListener('load',     me.onLoad.bind(me));
            xhr.addEventListener('progress', me.onProgress.bind(me));

            xhr.open(method, opts.url, true);

            headers.forEach((value, name) => {
                xhr.setRequestHeader(name, value)
            });

            xhr.send(opts.data);

            return xhr
        }
    }

    /**
     * @param form
     * @param {Object} opts
     * @returns {XMLHttpRequest}
     */
    sendForm(form, opts) {
        opts.data = new FormData(form);

        return this.request(opts)
    }

    /**
     * Needed for remote method access
     *
     * @param {Object} value
     */
    setDefaultHeaders(value) {
        this.defaultHeaders = value
    }
}

export default Neo.setupClass(Xhr);
