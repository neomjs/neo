import Base from '../../core/Base.mjs';

/**
 * @class Neo.data.connection.Xhr
 * @extends Neo.core.Base
 */
class Xhr extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.data.connection.Xhr'
         * @protected
         */
        className: 'Neo.data.connection.Xhr',
        /**
         * @member {String} ntype='xhr'
         * @protected
         */
        ntype: 'xhr-connection',
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
    }}

    /**
     * We cannot clone event objects across messaging
     * @param {Object} event
     */
    getResponse(event) {
        let target = event.target;

        return {
            readyState: target.readyState,
            response  : target.response,
            status    : target.status,
            statusText: target.statusText,
            headers   : target.getAllResponseHeaders()
        };
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

        delete me.requests[id];
    }

    /**
     * @param {Object} e
     */
    onLoad(e) {
        let me      = this,
            id      = e.currentTarget.neoId,
            request = me.requests[id],
            cb      = request.callback;

        cb?.apply(request.scope || me, [me.getResponse(e), true]);

        Object.entries(request).forEach(([key, value]) => {
            request[key] = null;
        });

        delete me.requests[id];
    }

    /**
     *
     */
    onProgress() {

    }

    /**
     * @param {Object} opts
     * @returns {Promise<any>}
     */
    promiseJson(opts) {
        let me = this;

        return new Promise((resolve, reject) => {
            opts.callback = function(data, success) {
                if (success) {
                    let json;
                    try {
                        json = JSON.parse(data.response);

                        resolve(Object.assign(data, { json }));
                    } catch(err) {
                        reject({
                            reject : true,
                            error  : err.message
                        });
                    }
                } else {
                    reject(data);
                }
            };
            me.request(opts);
        });
    }

    /**
     * @param {Object} opts
     * @returns {Promise<any>}
     */
    promiseRequest(opts) {
        let me = this;

        return new Promise((resolve, reject) => {
            opts.callback = function(data, success) {
                if (success) {
                    resolve(data);
                } else {
                    reject(data);
                }
            };
            me.request(opts);
        });
    }

    /**
     * @param {Object} opts
     * @param {Function} opts.callback
     * @param {Object} opts.data
     * @param {Object} opts.headers
     * @param {Boolean} opts.insideNeo true for calls with relative URLs inside the framework scope
     * @param {String} opts.method DELETE, GET, POST, PUT
     * @param {Object} opts.params
     * @param {String} opts.responseType
     * @param {Object} opts.scope
     * @param {String} opts.url
     * @returns {XMLHttpRequest}
     * @protected
     */
    request(opts) {
        let me      = this,
            headers = {...me.defaultHeaders, ...opts.headers || {}},
            id      = Neo.getId('xhr-request'),
            method  = opts.method || 'GET',
            xhr     = new XMLHttpRequest();

        if (!opts.url) {
            console.error('Neo.Xhr.request without a given url' + JSON.stringify(opts));
        } else {
            if (!opts.insideNeo && location.href.includes('/node_modules/neo.mjs/') && !location.href.startsWith('https://neomjs.github.io/')) {
                if (opts.url.startsWith('./') || opts.url.startsWith('../')) {
                    opts.url = '../../' + opts.url;
                }
            }

            if (opts.params) {
                opts.url += ('?' + new URLSearchParams(opts.params).toString());
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

            Object.entries(headers).forEach(([key, value]) => {
                xhr.setRequestHeader(key, value);
            });

            xhr.send(opts.data);

            return xhr;
        }
    }

    /**
     * @param form
     * @param {Object} opts
     * @returns {XMLHttpRequest}
     */
    sendForm(form, opts) {
        opts.data = new FormData(form);

        return this.request(opts);
    }

    /**
     * Needed for remote method access
     * 
     * @param {Object} value
     */
    setDefaultHeaders(value) {
        this.defaultHeaders = value;
    }
}

Neo.applyClassConfig(Xhr);

export default Xhr;
