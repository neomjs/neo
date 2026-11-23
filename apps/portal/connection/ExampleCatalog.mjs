import Xhr from '../../../src/data/connection/Xhr.mjs';

/**
 * @summary Reads the examples catalog from its folder for the catalog Store's pipeline: `url` names `index.json`,
 * which lists the groups, and each group's records sit in `<group>.json` beside it.
 *
 * The group files load in parallel and come back as one list in catalog order, so `Neo.data.Store#load()` keeps its
 * own lifecycle around the read: the pending and loading state, the count and the `load` event, and the rejection when
 * the Store is destroyed before the read settles. `buildScripts/util/exampleCatalog.mjs` reads the same files for the
 * build.
 * @class Portal.connection.ExampleCatalog
 * @extends Neo.data.connection.Xhr
 */
class ExampleCatalog extends Xhr {
    static config = {
        /**
         * @member {String} className='Portal.connection.ExampleCatalog'
         * @protected
         */
        className: 'Portal.connection.ExampleCatalog'
    }

    /**
     * @summary Puts records into catalog order: ascending `order`, a record without one after the records that have
     * one, ties in the order given. `orderCatalog()` in `buildScripts/util/exampleCatalog.mjs` is the same rule for the
     * build.
     * @param {Object[]} records
     * @returns {Object[]} A new array
     */
    static order(records) {
        const rank = record => record.order ?? Number.MAX_VALUE;

        return [...records].sort((a, b) => rank(a) - rank(b))
    }

    /**
     * @summary Reads the index, then every group file beside it, and answers the records in catalog order. The Store's
     * paging params name no query a static file answers, so only `url` and `headers` reach the requests.
     * @param {Object} [params={}]
     * @param {Object} [params.headers] Request headers
     * @param {String} [params.url] The index to read instead of the connection's `url`
     * @returns {Promise<{json: Object[]}>} The catalog's records as `json`, the body `Neo.data.Store#readResponse()` reads
     */
    async read({headers, url}={}) {
        const index  = url || this.url,
              folder = index.slice(0, index.lastIndexOf('/') + 1),
              {json} = await super.read({headers, url: index}),
              groups = await Promise.all(json.map(group => super.read({headers, url: `${folder}${group}.json`})));

        return {json: ExampleCatalog.order(groups.flatMap(group => group.json))}
    }
}

export default Neo.setupClass(ExampleCatalog);
