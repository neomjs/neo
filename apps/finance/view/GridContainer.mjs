import BaseGridContainer from '../../../src/grid/Container.mjs';

/**
 * @class Finance.view.GridContainer
 * @extends Neo.table.Container
 */
class GridContainer extends BaseGridContainer {
    static config = {
        /**
         * @member {String} className='Finance.view.GridContainer'
         * @protected
         */
        className: 'Finance.view.GridContainer',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.companies'
        },
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'symbol',
            text     : 'Symbol',
            width    : 100
        }, {
            dataField: 'name',
            text     : 'Name',
            width    : 250
        }, {
            dataField: 'sector',
            text     : 'Sector',
            width    : 200
        }]
    }
}

export default Neo.setupClass(GridContainer);
