import Base       from '../../core/Base.mjs';
import Observable from '../../core/Observable.mjs';

/**
 * @class Neo.data.parser.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 *
 * @summary Abstract base class for Data Parsers.
 *
 * Parsers decouple the `Neo.data.Store` from the underlying data retrieval mechanism.
 * While a Store manages the *state* (records, sorting, filtering), a Parser manages the *transport*
 * (Ajax, Streaming, WebSockets, LocalStorage).
 *
 * **Architecture:**
 * - **`read(operation)`**: The primary interface method. Implementations must return a Promise.
 * - **Events**: Parsers can fire events (like `data`) to support progressive loading patterns.
 *
 * **Future Roadmap:**
 * - `Neo.data.parser.Ajax`: Standard XHR/Fetch wrapper (replacing Store.url).
 * - `Neo.data.parser.WebSocket`: Real-time data updates.
 * - `Neo.data.parser.LocalStorage`: Offline persistence.
 */
class Parser extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true

    static config = {
        /**
         * @member {String} className='Neo.data.parser.Base'
         * @protected
         */
        className: 'Neo.data.parser.Base',
        /**
         * @member {String} ntype='parser'
         * @protected
         */
        ntype: 'parser',
        /**
         * @member {Neo.data.Store|null} store=null
         */
        store: null,
        /**
         * @member {String|null} url=null
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

export default Neo.setupClass(Parser);
