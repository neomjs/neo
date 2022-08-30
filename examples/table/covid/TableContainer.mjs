import BaseTableContainer from '../../../src/table/Container.mjs';
import MainStore          from './MainStore.mjs';


/**
 * @class Neo.examples.table.covid.TableContainer
 * @extends Neo.table.Container
 */
class TableContainer extends BaseTableContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.table.covid.TableContainer'
         * @protected
         */
        className: 'Neo.examples.table.covid.TableContainer',
        /**
         * @member {Object[]} columns
         */
        columns: [
            {dataField: 'firstname', text: 'Firstname'},
            {dataField: 'lastname',  text: 'Lastname'},
            {dataField: 'githubId',  text: 'Github Id'},
            {dataField: 'country',   text: 'Country'}
        ],
        /**
         * @member {Object[]} store=MainStore
         */
        store: MainStore
    }}
}

Neo.applyClassConfig(TableContainer);

export default TableContainer;
