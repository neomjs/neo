import Container from '../../../src/grid/Container.mjs';
import MainStore from './MainStore.mjs';

/**
 * @class Neo.examples.grid.tree.GridContainer
 * @extends Neo.grid.Container
 */
class GridContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.GridContainer'
         * @protected
         */
        className: 'Neo.examples.grid.tree.GridContainer',
        /**
         * @member {Neo.data.Store} store=MainStore
         */
        store: MainStore,
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'name',
            text     : 'Name',
            type     : 'tree', // Our new Neo.grid.column.Tree
            width    : 250
        }, {
            dataField: 'type',
            text     : 'Type',
            width    : 100
        }, {
            dataField: 'size',
            text     : 'Size',
            width    : 100
        }]
    }
}

export default Neo.setupClass(GridContainer);
