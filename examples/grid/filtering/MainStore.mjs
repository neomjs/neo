import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * The categories an order belongs to, also the choices of the category filter
 * @type {String[]}
 */
export const categories = ['Furniture', 'Kitchen', 'Lighting', 'Outdoor', 'Textiles'];

/**
 * The number of orders: the whole the count line names
 * @type {Number}
 */
export const orderCount = 10000;

const customers = [
    'Acme Studio', 'Alder & Co', 'Atlas Works', 'Beacon Homes', 'Birch Lane', 'Brightside', 'Cobalt Rooms', 'Copper Hill',
    'Dune Living', 'Elm Street', 'Fernwood', 'Foxglove', 'Granite Bay', 'Harbor Loft', 'Hearth & Co', 'Ivy House',
    'Juniper Hall', 'Keystone', 'Lantern Co', 'Larkspur', 'Meadowlark', 'Northwind', 'Oakmont', 'Pebble Row',
    'Quarry Lane', 'Redwood', 'Saltmarsh', 'Silverline', 'Tidewater', 'Umber & Co', 'Willow Den', 'Zephyr Home'
];

/**
 * @summary 10,000 orders from a formula over the row index, so every load, the cover and the specs see the same rows.
 * @class Neo.examples.grid.filtering.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.filtering.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.filtering.MainStore',
        /**
         * @member {Object[]} data
         */
        data: Array.from({length: orderCount}, (_, index) => ({
            id      : index + 1,
            customer: customers[(index * 7) % customers.length],
            category: categories[(index * 3 + Math.floor(index / 5)) % categories.length],
            amount  : 50 + (index * 137) % 4950,
            date    : new Date(Date.UTC(2026, 0, 1 + (index * 13) % 365)).toISOString().slice(0, 10),
            // A quarter of the orders are open, spread over every customer (customers repeat every 32 rows)
            paid    : (index + Math.floor(index / 32)) % 4 !== 0
        })),
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=Model
         */
        model: Model
    }
}

export default Neo.setupClass(MainStore);
