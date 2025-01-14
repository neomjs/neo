import BaseGridContainer from '../../../src/grid/Container.mjs';
import MainStore         from './MainStore.mjs';

/**
 * @class Neo.examples.grid.bigData.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.GridContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.GridContainer',
        /**
         * @member {Number} amountColumns_=50
         */
        amountColumns_: 50,
        /**
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            width               : 100
        },
        /**
         * @member {Object[]} store=MainStore
         */
        store: MainStore
    }

    /**
     * Triggered after the amountColumns config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        let i       = 4,
            columns = [
                {dataField: 'id', text: '#', width: 60},
                {cellAlign: 'left', dataField: 'firstname', defaultSortDirection: 'ASC', text: 'Firstname', width: 150},
                {cellAlign: 'left', dataField: 'lastname',  defaultSortDirection: 'ASC', text: 'Lastname',  width: 150}
            ];

        for (; i <= value; i++) {
            columns.push({dataField: 'number' + i, text: 'Number ' + i})
        }

        this.store.amountColumns = value;

        this.columns = columns
    }
}

export default Neo.setupClass(GridContainer);
