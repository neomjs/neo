import BaseTableContainer from '../../../src/table/Container.mjs';
import Store              from './Store.mjs';


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
        store: Store
    }}
}

Neo.applyClassConfig(TableContainer);

export default TableContainer;
