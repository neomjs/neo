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
         * Default configs for each column
         * @member {Object} columnDefaults
         */
        columnDefaults: {
            cellAlign           : 'right',
            defaultSortDirection: 'DESC',
            width               : 100
        },
        /**
         * @member {Object[]} columns
         */
        columns: [
            {cls: ['neo-index-column'], dataField: 'id', text: '#', width: 60},
            {cellAlign: 'left', dataField: 'firstname', defaultSortDirection: 'ASC', text: 'Firstname', width: 150},
            {cellAlign: 'left', dataField: 'lastname',  defaultSortDirection: 'ASC', text: 'Lastname',  width: 150},
            {dataField: 'number1',  text: 'Number 1'},
            {dataField: 'number2',  text: 'Number 2'},
            {dataField: 'number3',  text: 'Number 3'},
            {dataField: 'number4',  text: 'Number 4'},
            {dataField: 'number5',  text: 'Number 5'},
            {dataField: 'number6',  text: 'Number 6'},
            {dataField: 'number7',  text: 'Number 7'},
            {dataField: 'number8',  text: 'Number 8'},
            {dataField: 'number9',  text: 'Number 9'},
            {dataField: 'number10', text: 'Number 10'},
            {dataField: 'number11', text: 'Number 11'},
            {dataField: 'number12', text: 'Number 12'},
            {dataField: 'number13', text: 'Number 13'},
            {dataField: 'number14', text: 'Number 14'},
            {dataField: 'number15', text: 'Number 15'},
            {dataField: 'number16', text: 'Number 16'},
            {dataField: 'number17', text: 'Number 17'},
            {dataField: 'number18', text: 'Number 18'},
            {dataField: 'number19', text: 'Number 19'},
            {dataField: 'number20', text: 'Number 20'},
            {dataField: 'number21', text: 'Number 21'},
            {dataField: 'number22', text: 'Number 22'},
            {dataField: 'number23', text: 'Number 23'},
            {dataField: 'number24', text: 'Number 24'},
            {dataField: 'number25', text: 'Number 25'},
            {dataField: 'number26', text: 'Number 26'},
            {dataField: 'number27', text: 'Number 27'},
            {dataField: 'number28', text: 'Number 28'},
            {dataField: 'number29', text: 'Number 29'},
            {dataField: 'number30', text: 'Number 30'},
            {dataField: 'number31', text: 'Number 31'},
            {dataField: 'number32', text: 'Number 32'},
            {dataField: 'number33', text: 'Number 33'},
            {dataField: 'number34', text: 'Number 34'},
            {dataField: 'number35', text: 'Number 35'},
            {dataField: 'number36', text: 'Number 36'},
            {dataField: 'number37', text: 'Number 37'},
            {dataField: 'number38', text: 'Number 38'},
            {dataField: 'number39', text: 'Number 39'},
            {dataField: 'number40', text: 'Number 40'},
            {dataField: 'number41', text: 'Number 41'},
            {dataField: 'number42', text: 'Number 42'},
            {dataField: 'number43', text: 'Number 43'},
            {dataField: 'number44', text: 'Number 44'},
            {dataField: 'number45', text: 'Number 45'},
            {dataField: 'number46', text: 'Number 46'},
            {dataField: 'number47', text: 'Number 47'}
        ],
        /**
         * @member {Object[]} store=MainStore
         */
        store: MainStore
    }
}

export default Neo.setupClass(GridContainer);
