import BaseGridContainer from '../../../src/grid/Container.mjs';
import Button            from '../../../src/button/Base.mjs';
import FooterToolbar     from './FooterToolbar.mjs';
import MainStore         from './MainStore.mjs';

const
    format     = new Intl.NumberFormat('en-US').format,
    hours      = ({value}) => format(value),
    monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    lastMonth  = 2025 * 12 + 11; // Dec 2025, counted in months

/**
 * @summary The organization as a tree grid: unit and person names in the tree column, role and location, a cell
 * holding a button, a live value, a utilization bar, then the hours booked per month. Its footer states the size.
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
     * The data field of a month stays `number<index>` at every width, so only its header moves.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountColumns(value, oldValue) {
        let i       = 7,
            columns = [
                {type: 'index', dataField: 'id', text: '#', width: 60},
                {type: 'tree', dataField: 'name', text: 'Organization', width: 280},
                {cellAlign: 'left', dataField: 'role',     defaultSortDirection: 'ASC', text: 'Role',     width: 190},
                {cellAlign: 'left', dataField: 'location', defaultSortDirection: 'ASC', text: 'Location', useValueBanding: true, width: 140},
                {cellAlign: 'left', dataField: 'countAction', text: 'Button in a cell', width: 150, component: ({record}) => ({
                    module: Button,
                    handler() {record.counter++},
                    text : 'Kudos +1',
                    width: 130
                })},
                {type: 'animatedChange', dataField: 'counter',  text: 'Kudos',       width: 100},
                {type: 'progress',       dataField: 'progress', text: 'Utilization', width: 150}
            ],
            month;

        // Hours booked per month: a person's own, a unit's the sum of its people
        for (; i <= value; i++) {
            month = lastMonth - (value - i);
            columns.push({dataField: 'number' + i, renderer: hours, text: `${monthNames[month % 12]} ${Math.floor(month / 12)}`})
        }

        this.store.amountColumns = value;

        this.columns = columns
    }
}

export default Neo.setupClass(GridContainer);
