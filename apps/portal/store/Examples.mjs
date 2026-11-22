import Example from '../model/Example.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @class Portal.store.Examples
 * @extends Neo.data.Store
 */
class Examples extends Store {
    static config = {
        /**
         * @member {String} className='Portal.store.Examples'
         * @protected
         */
        className: 'Portal.store.Examples',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Example
         * @reactive
         */
        model: Example
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
     * @summary Reads the catalog from its folder: `url` names its `index.json`, which lists the groups, and each
     * group's records sit in `<group>.json` beside it. The groups load in parallel, and the records take their catalog
     * order from `order`, so the catalog reads as one list while an examples PR edits only its group's file.
     * @param {Object} [opts={}]
     * @param {String} [opts.url] The index to read instead of `url`
     * @returns {Promise<Object[]>} The records
     * @protected
     */
    async load(opts={}) {
        const me = this;

        if (me.urlPipelinePromise) await me.urlPipelinePromise;

        const {connection} = me.pipeline,
              url          = opts.url || me.url,
              folder       = url.slice(0, url.lastIndexOf('/') + 1),
              {json}       = await connection.read({url}),
              groups       = await Promise.all(json.map(group => connection.read({url: `${folder}${group}.json`})));

        me.data     = Examples.order(groups.flatMap(group => group.json)); // fires the load event
        me.isLoaded = true;

        return me.items
    }
}

export default Neo.setupClass(Examples);
