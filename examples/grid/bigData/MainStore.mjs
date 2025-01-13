import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.bigData.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.MainStore',
        /**
         * @member {Number} amountRows_=10000
         */
        amountRows_: 10000,
        /**
         * @member {Neo.data.Model} model=Model
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
        this.data = this.generateData(value)
    }

    /**
     * @param {Number} amountRows
     * @returns {Object[]}
     */
    generateData(amountRows) {
        let countColumns = 48,
            records      = [],
            row          =  0,
            column, record;

        for (; row < amountRows; row++) {
            column = 1;
            record = {id: row + 1, firstname: 'Tobias', lastname: 'Uhlig'};

            for (; column < countColumns; column++) {
                record['number' + column] = Math.round(Math.random() * 10000)
            }

            records.push(record)
        }

        return records
    }
}

export default Neo.setupClass(MainStore);
