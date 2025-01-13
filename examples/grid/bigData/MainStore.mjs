import Model from './MainModel.mjs';
import Store from '../../../src/data/Store.mjs';

/**
 * @class Neo.examples.grid.bigData.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        className: 'Neo.examples.grid.bigData.MainStore',
        model    : Model
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.data = this.generateData(10000);
        console.log(this);
    }

    /**
     * @param {Number} countRows
     * @returns {Object[]}
     */
    generateData(countRows) {
        let countColumns = 48,
            records      = [],
            row          =  0,
            column, record;

        for (; row < countRows; row++) {
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
