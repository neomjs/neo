import Base       from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.proxy.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 *
 * @summary Abstract base class for Data Proxies.
 *
 * Proxies decouple the `Neo.data.Store` from the underlying data retrieval mechanism.
 * While a Store manages the *state* (records, sorting, filtering), a Proxy manages the *transport*
 * (Ajax, Streaming, WebSockets, LocalStorage).
 *
 * **Architecture:**
 * - **`read(operation)`**: The primary interface method. Implementations must return a Promise.
 * - **Events**: Proxies can fire events (like `data`) to support progressive loading patterns.
 *
 * **Future Roadmap:**
 * - `Neo.data.proxy.Ajax`: Standard XHR/Fetch wrapper (replacing Store.url).
 * - `Neo.data.proxy.WebSocket`: Real-time data updates.
 * - `Neo.data.proxy.LocalStorage`: Offline persistence.
 */
class Proxy extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.proxy.Base'
         * @protected
         */
        className: 'Neo.data.proxy.Base',
        /**
         * @member {String} ntype='proxy'
         * @protected
         */
        ntype: 'proxy',
        /**
         * @member {Neo.data.Store|null} store=null
         */
        store: null,
        /**
         * @member {String|null} store=null
         */
        url: null
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    read(operation) {
        return Promise.reject('read method not implemented');
    }
}

export default Neo.setupClass(Proxy);
