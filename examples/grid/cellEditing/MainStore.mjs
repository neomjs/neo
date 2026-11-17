import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * The office furniture an order line can name, with its catalog price
 * @type {Array[]}
 */
const catalog = [
    ['Oak desk', 420], ['Task chair', 189], ['Desk lamp', 39.9], ['Monitor arm', 74.5], ['Bookshelf', 249],
    ['Filing cabinet', 159], ['Standing mat', 59], ['Whiteboard', 129], ['Cable tray', 24.9], ['Footrest', 34.5]
];

const countries = ['DE', 'US', 'FR', 'NL', 'SK', 'AT', 'GB', 'DK'];

/**
 * @summary 40 order lines from a formula over the row index, so every load, the cover and the specs see the same
 * sheet. Deliveries fall between 1 December 2026 and 31 January 2027, the range the date editor accepts. Each is a local
 * calendar day, the day the cell and the editor show: a date-only string would parse as UTC midnight, which reads as
 * the previous day west of Greenwich.
 * @class Neo.examples.grid.cellEditing.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className  : 'Neo.examples.grid.cellEditing.MainStore',
        keyProperty: 'orderId',
        model      : Model,

        data: Array.from({length: 40}, (_, index) => {
            const [item, unitPrice] = catalog[(index * 3) % catalog.length];

            return {
                country : countries[index % countries.length],
                delivery: new Date(2026, 11, 1 + (index * 5) % 60),
                item,
                orderId : `SO-${1001 + index}`,
                quantity: 1 + (index * 7) % 24,
                unitPrice
            }
        })
    }
}

export default Neo.setupClass(MainStore);
