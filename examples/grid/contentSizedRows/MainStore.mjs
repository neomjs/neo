import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

const
    COUNTRIES = ['Brazil', 'Canada', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Norway', 'Spain', 'Vietnam'],
    OWNERS    = ['Ada', 'Clio', 'Emmy', 'Euclid', 'Fable', 'Grace', 'Sophie', 'Vega'],
    STATUSES  = ['Draft', 'Review', 'Approved', 'Shipped', 'Archived'],
    WORDS     = [
        'grid', 'rows', 'wrap', 'their', 'text', 'and', 'grow', 'to', 'fit', 'content', 'workers', 'measure',
        'heights', 'offsets', 'scroll', 'anchor', 'virtual', 'buffer', 'stable', 'engine', 'layout', 'pixels',
        'records', 'columns'
    ];

/**
 * @summary 10k records whose text fields wrap to one to four lines: `title` and `notes` in the locked bodies,
 * `summary` in the center, and `details`, the tallest, in a center column that starts past the horizontal range.
 *
 * The content comes from a seeded generator, so every load shows the same records. Browsers cap element heights, each
 * at its own limit: 10k of these rows reach about 0.9M px, while 100k would reach 8.7M px, past the 2^23 px beyond
 * which Chrome rounds scroll offsets to 2px.
 * @class Neo.examples.grid.contentSizedRows.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.contentSizedRows.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.contentSizedRows.MainStore',
        /**
         * @member {Number} amountRows_=10000
         * @reactive
         */
        amountRows_: 10000,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * Inactive until the filter field sets a value
         * @member {Object[]} filters
         * @reactive
         */
        filters: [{operator: 'like', property: 'summary', value: null}],
        /**
         * @member {Neo.data.Model} model=Model
         * @reactive
         */
        model: Model
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        let me = this;

        // The unfiltered copy a first filter creates receives the items, it does not generate them
        if (me.preventDataGeneration) {
            return
        }

        me.items?.length > 0 && me.clear(false);

        // Raw items: the store creates a record when a row first needs it
        me.add(me.generateData(value), false)
    }

    /**
     * @param {Object} config
     * @returns {Neo.collection.Base}
     * @protected
     */
    createAllItems(config) {
        config.preventDataGeneration = true;
        return super.createAllItems(config)
    }

    /**
     * @param {Number} amountRows
     * @returns {Object[]}
     */
    generateData(amountRows) {
        let random = MainStore.random(19666),
            pick   = list => list[Math.floor(random() * list.length)],
            text   = (lines, perLine) => {
                let count = Math.max(1, lines * perLine - Math.floor(random() * perLine));
                return Array.from({length: count}, pick.bind(null, WORDS)).join(' ')
            },
            records = [],
            row     = 0;

        for (; row < amountRows; row++) {
            records.push({
                country: pick(COUNTRIES),
                details: text(3 + Math.floor(random() * 4), 5),
                id     : row + 1,
                notes  : text(1 + Math.floor(random() * 4), 3),
                owner  : pick(OWNERS),
                score  : Math.floor(random() * 100),
                status : pick(STATUSES),
                summary: text(1 + Math.floor(random() * 4), 6),
                title  : text(1 + Math.floor(random() * 4), 3)
            })
        }

        return records
    }

    /**
     * A seeded generator (mulberry32) for content that is the same on every load
     * @param {Number} seed
     * @returns {Function} Returns a number in `[0, 1)` per call
     */
    static random(seed) {
        return () => {
            seed = seed + 0x6D2B79F5 | 0;

            let t = Math.imul(seed ^ seed >>> 15, 1 | seed);

            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296
        }
    }
}

export default Neo.setupClass(MainStore);
