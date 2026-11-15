import CoreBase   from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.connection.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 */
class Base extends CoreBase {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.connection.Base'
         * @protected
         */
        className: 'Neo.data.connection.Base',
        /**
         * @member {String} ntype='connection'
         * @protected
         */
        ntype: 'connection',
        /**
         * The url to connect to
         * @member {String|null} url=null
         */
        url: null
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<any>}
     */
    async read(params) {
        throw new Error('connection.Base: read() needs to get implemented in subclasses')
    }

    /**
     * @summary Adds query params to a URL that may already carry a query or a fragment.
     *
     * The params go before a `#fragment` and join an existing query with `&`. An empty query (`/data?`) or one that
     * ends in `&` gets no second separator; a `?` inside a query value (`/data?q=why?`) is part of that value, so
     * the params still join with `&`. Empty params leave the URL as it is. String composition keeps relative URLs
     * relative, which `new URL()` cannot do without a base.
     *
     * A plain object is a record of params, as a Store's read sends them. Its arrays and plain objects are sent as
     * JSON (`sorters=[{"direction":"DESC","property":"score"}]`, URL-encoded), so a server can parse them back,
     * `null` and `undefined` values are left out, and any other value is sent as its string. Any other input, such as
     * a query string, a `URLSearchParams` or an iterable of `[key, value]` pairs, composes as `new URLSearchParams()`
     * reads it, with repeated keys kept in order.
     * @param {String} url
     * @param {Object|URLSearchParams|Array[]|String} params
     * @returns {String}
     */
    appendParams(url, params) {
        let hashIndex  = url.indexOf('#'),
            base       = hashIndex > -1 ? url.substring(0, hashIndex) : url,
            hash       = hashIndex > -1 ? url.substring(hashIndex)    : '',
            queryIndex = base.indexOf('?'),
            existing   = queryIndex > -1 ? base.substring(queryIndex + 1) : null,
            record     = Neo.isObject(params),
            search     = new URLSearchParams(record ? undefined : params),
            query, separator;

        if (record) {
            for (const [key, value] of Object.entries(params)) {
                if (value != null) {
                    search.append(key, Array.isArray(value) || Neo.isObject(value) ? JSON.stringify(value) : value)
                }
            }
        }

        query = search.toString();

        if (!query) {
            return url
        }

        separator = existing === null ? '?' : existing === '' || existing.endsWith('&') ? '' : '&';

        return base + separator + query + hash
    }

    /**
     * @summary Resolves workspace-relative data URLs against the realm's registered document base.
     * Package-hosted workers sit at a different depth from the page. Only that layout uses the
     * effective document base; Engine/dist workers and pages inside the package keep worker-relative
     * URLs. The base belongs to the realm's registration owner. Use an absolute URL for another base.
     * @param {String} url
     * @param {Boolean} [insideNeo=false] True retains a framework-scoped worker-relative URL.
     * @returns {String} The resolved workspace URL, or the original URL outside that layout.
     */
    resolveUrl(url, insideNeo=false) {
        const base = Neo.config.url?.base,
              href = globalThis.location?.href;

        if (insideNeo || !base || !href || typeof url !== 'string' ||
            !(url.startsWith('./') || url.startsWith('../'))) {
            return url
        }

        const packagePath = '/node_modules/neo.mjs/';

        return new URL(href).pathname.includes(packagePath) && !new URL(base).pathname.includes(packagePath)
            ? new URL(url, base).href
            : url
    }

}

export default Neo.setupClass(Base);
