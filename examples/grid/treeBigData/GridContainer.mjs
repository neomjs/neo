import BaseGridContainer from '../../../src/grid/Container.mjs';
import Button            from '../../../src/button/Base.mjs';
import MainStore         from './MainStore.mjs';

/**
 * @class Neo.examples.grid.treeBigData.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.treeBigData.GridContainer'
         * @protected
         */
        className: 'Neo.examples.grid.treeBigData.GridContainer',
        /**
         * @member {Number} amountColumns_=50
         * @reactive
         */
        amountColumns_: 50,
        /**
         * @member {Object} body
         */
        body: {
            bufferColumnRange: 3,
            bufferRowRange   : 5,
            stripedRows      : false
        },
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
         * @reactive
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
        let i       = 7,
            columns = [
                {type: 'index', dataField: 'id', text: '#', width: 60},
                {type: 'tree', dataField: 'name', text: 'Tree', width: 250},
                {cellAlign: 'left', dataField: 'firstname', defaultSortDirection: 'ASC', text: 'Firstname', width: 150},
                {cellAlign: 'left', dataField: 'lastname',  defaultSortDirection: 'ASC', text: 'Lastname',  useValueBanding: true, width: 150},
                {cellAlign: 'left', dataField: 'countAction', text: 'Increase Counter', width: 150,  component: ({record}) => ({
                    module: Button,
                    handler() {record.counter++},
                    text  : record.firstname + ' ++',
                    width : 130
                })},
                {type: 'animatedChange', dataField: 'counter', text: 'Counter'},
                {type: 'progress',       dataField: 'progress', text: 'Progress', width: 150}
            ];

        for (; i <= value; i++) {
            columns.push({dataField: 'number' + i, text: 'Number ' + i})
        }

        this.store.amountColumns = value;

        this.columns = columns
    }
}

export default Neo.setupClass(GridContainer);
