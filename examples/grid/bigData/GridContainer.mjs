import BaseGridContainer from '../../../src/grid/Container.mjs';
import Button            from '../../../src/button/Base.mjs';
import FooterToolbar     from './FooterToolbar.mjs';
import MainStore         from './MainStore.mjs';
import NestedCell        from './NestedCell.mjs';

const
    monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    lastMonth  = 2025 * 12 + 11; // Dec 2025, counted in months

/**
 * @summary A wide sheet of generated rows: cells holding components, then one value column per month.
 * Its footer states the size.
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
         * @reactive
         */
        amountColumns_: 50,
        /**
         * @member {Object} body
         */
        body: {
            bufferColumnRange: 3,
            bufferRowRange   : 5
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
         * The size readout below the rows
         * @member {Object} footerToolbar={module:FooterToolbar}
         * @reactive
         */
        footerToolbar: {module: FooterToolbar},
        /**
         * @member {Object[]} store=MainStore
         * @reactive
         */
        store: MainStore
    }

    /**
     * @summary Builds the columns for a new width: seven fixed ones, then months in order up to Dec 2025.
     * The data field of a value column stays `number<index>` at every width, so only its header moves.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        let i       = 7,
            columns = [
                {type: 'index', dataField: 'id', text: '#', width: 60},
                {cellAlign: 'left', dataField: 'firstname', defaultSortDirection: 'ASC', text: 'Firstname', width: 150},
                {cellAlign: 'left', dataField: 'lastname',  defaultSortDirection: 'ASC', text: 'Lastname',  width: 150},
                {cellAlign: 'left', dataField: 'countAction', text: 'Button in a cell', width: 150,  component: ({record}) => ({
                    module: Button,
                    handler() {record.counter++},
                    text  : record.firstname + ' ++',
                    width : 130
                })},
                // A cell whose content lives in a CHILD component, one boundary further out than the
                // flat button above. Both are fed from `firstname`, so the two columns and the plain
                // `firstname` cell must agree at every scroll position.
                {cellAlign: 'left', dataField: 'nestedCell', text: 'Nested component', width: 150, component: ({record}) => ({
                    module   : NestedCell,
                    firstname: record.firstname
                })},
                {type: 'animatedChange', dataField: 'counter', text: 'Live value', width: 120},
                {type: 'progress',       dataField: 'progress', text: 'Progress bar', width: 150}
            ],
            month;

        for (; i <= value; i++) {
            month = lastMonth - (value - i);
            columns.push({dataField: 'number' + i, text: `${monthNames[month % 12]} ${Math.floor(month / 12)}`})
        }

        this.columns = columns;

        this.store.amountColumns = value
    }

    /**
     * Triggered after the columnMenu config got changed.
     * Fires `columnMenuChange`, so the Settings checkbox follows a change made anywhere else.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetColumnMenu(value, oldValue) {
        super.afterSetColumnMenu(value, oldValue);

        oldValue !== undefined && this.fire('columnMenuChange', {value})
    }
}

export default Neo.setupClass(GridContainer);
