import Connection from '../../../src/data/connection/Base.mjs';

export const countries = ['DE', 'DK', 'FI', 'FR', 'GB', 'NL', 'SE', 'US'];
export const rowCount = 100000;

/**
 * @summary A seeded, in-memory server: only its selected page crosses the connection boundary.
 * @class Neo.examples.grid.serverSide.SimulatedConnection
 * @extends Neo.data.connection.Base
 */
class SimulatedConnection extends Connection {
    static config = {
        className: 'Neo.examples.grid.serverSide.SimulatedConnection',
        /** @member {Number} delay=350 A visible simulated network delay, in milliseconds. */
        delay: 350
    }

    /** @member {Number} requestCount=0 Number of transport reads, including the initial load. */
    requestCount = 0

    /** @member {Object|null} lastRequest=null Last request and its response metrics. */
    lastRequest = null

    /** @member {Object[]|null} #rows=null The simulated server's dataset, never assigned to the Store. */
    #rows = null

    /**
     * @summary Recreates the same fictional orders from a fixed seed on every example load.
     * @returns {Object[]}
     */
    generateRows() {
        let   seed      = 21189;
        const customers = ['Alder Studio', 'Beacon Foods', 'Cedar Works', 'Delta Supply',
                           'Elm Partners', 'Fjord Design', 'Grove Retail', 'Harbor Labs',
                           'Atlas Books', 'Birch Cafe', 'Copper Mill', 'Dune Media',
                           'Echo Print', 'Fern Market', 'Granite Co', 'Hazel House',
                           'Iris Health', 'Juniper Co', 'Kite Solar', 'Linden Tech',
                           'Maple Farm', 'North Glass', 'Oak Textiles', 'Pine Motors',
                           'Quartz Lab', 'Reed Bakery', 'Sage Travel', 'Terra Tools',
                           'Union Paper', 'Vale Music', 'Willow Home', 'Yarrow Co'];

        /** @summary Advances the fixed seed and samples using its full unsigned range, avoiding low-bit cycles. */
        function draw(length) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return Math.floor(seed / 4294967296 * length)
        }

        return Array.from({length: rowCount}, (_, index) => {
            return {
                id      : index + 1,
                customer: customers[draw(customers.length)],
                country : countries[draw(countries.length)],
                amount  : 100 + draw(9900)
            }
        })
    }

    /**
     * @summary Applies the Store's remote query before slicing; each reply owns fresh row objects.
     * @param {Object} params Store-exported page, pageSize, filters and sorters.
     * @returns {Promise<Object>} A responseRoot-compatible page and the filtered total.
     */
    async read({page = 1, pageSize = 50, filters = [], sorters = []} = {}) {
        const me      = this,
              started = performance.now(),
              request = {number: ++me.requestCount, page, pageSize,
                  filters: filters.map(filter => ({...filter})), sorters: sorters.map(sorter => ({...sorter}))};

        me.lastRequest = request;
        me.fire('request', request);
        await new Promise(resolve => setTimeout(resolve, me.delay));
        if (me.isDestroyed) throw Neo.isDestroyed;

        me.#rows ||= me.generateRows();
        let rows = me.#rows;

        for (const filter of filters) {
            if (filter.property !== 'country' || filter.operator !== '===') {
                throw new Error('The simulated server supports country equality filters only')
            }
            rows = rows.filter(row => row.country === filter.value)
        }

        rows = rows.slice().sort((a, b) => {
            for (const {property, direction} of sorters) {
                const order = a[property] < b[property] ? -1 : a[property] > b[property] ? 1 : 0;
                if (order) return direction === 'DESC' ? -order : order
            }
            return a.id - b.id
        });

        const totalCount = rows.length,
              data       = rows.slice((page - 1) * pageSize, page * pageSize).map(row => ({...row}));

        Object.assign(request, {totalCount, returned: data.length, duration: Math.round(performance.now() - started)});
        me.fire('response', request);

        return {data, totalCount}
    }
}

export default Neo.setupClass(SimulatedConnection);
