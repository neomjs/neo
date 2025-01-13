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
         * @member {Number} amountColumns_=50
         */
        amountColumns_: 50,
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
     * Triggered after the amountColumns config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.data = me.generateData(me.amountRows, value)
        }
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        let me = this;

        me.data = me.generateData(value, me.amountColumns)
    }

    /**
     * @param {Number} amountRows
     * @param {Number} amountColumns
     * @returns {Object[]}
     */
    generateData(amountRows, amountColumns) {
        let records = [],
            row     = 0,
            column, record;

        for (; row < amountRows; row++) {
            column = 1;
            record = {id: row + 1, firstname: 'Tobias', lastname: 'Uhlig'};

            for (; column < amountColumns - 2; column++) {
                record['number' + column] = Math.round(Math.random() * 10000)
            }

            records.push(record)
        }

        return records
    }
}

export default Neo.setupClass(MainStore);
