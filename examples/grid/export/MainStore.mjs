import Model                from './MainModel.mjs';
import Store                from '../../../src/data/Store.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';

export const
    /**
     * A customer name a spreadsheet would run as a formula. `toCsv()` writes it with a leading `'`.
     */
    FORMULA_CUSTOMER = '=SUM(B2:B9) Holdings',
    /**
     * The invoice that carries it, on the first screen of the unsorted grid
     */
    FORMULA_INVOICE  = 'INV-1004',
    ROWS             = 300;

const
    CUSTOMERS = ['Acme Corp', 'Birchwood Ltd', 'Cobalt Systems', 'Delta Freight', 'Evergreen Foods', 'Fjord Analytics',
                 'Granite Works', 'Harbor Labs', 'Ironleaf Media', 'Juniper Health', 'Keystone Retail', 'Lumen Energy'],
    STATUSES  = ['Paid', 'Paid', 'Paid', 'Open', 'Open', 'Overdue'];

/**
 * @summary 300 invoices from a seeded generator, so every load, the catalog cover and the specs see the same rows.
 *
 * One customer name starts with `=`, so the CSV preview shows how `toCsv()` escapes a formula-like cell.
 * @class Neo.examples.grid.export.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.export.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.export.MainStore',
        /**
         * @member {Object[]} data
         */
        data: (() => {
            let random  = createSeededRandom(21188),
                day     = Date.UTC(2026, 0, 2),
                records = [],
                i       = 0;

            for (; i < ROWS; i++) {
                // One to three days apart, so 300 invoices span about two years
                day += (1 + Math.floor(random() * 3)) * 86400000;

                records.push({
                    amount  : Math.round((80 + random() * 9920) * 100) / 100,
                    customer: i === 3 ? FORMULA_CUSTOMER : CUSTOMERS[Math.floor(random() * CUSTOMERS.length)],
                    date    : new Date(day).toISOString().slice(0, 10),
                    id      : i + 1,
                    invoice : `INV-${1001 + i}`,
                    status  : STATUSES[Math.floor(random() * STATUSES.length)]
                })
            }

            return records
        })(),
        /**
         * Inactive until the filter field sets a value
         * @member {Object[]} filters
         */
        filters: [{operator: 'like', property: 'customer', value: null}],
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
