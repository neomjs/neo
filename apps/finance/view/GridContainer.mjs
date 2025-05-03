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
            dataField: 'id',
            text     : '#',
            type     : 'index',
            width    : 40
        }, {
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
        }, {
            cellAlign: 'right',
            dataField: 'change',
            locale   : 'en-US',
            text     : 'Change',
            type     : 'animatedCurrency',
            width    : 120
        }, {
            cellAlign   : 'right',
            compareField: 'change',
            dataField   : 'value',
            locale      : 'en-US',
            text        : 'Value',
            type        : 'animatedCurrency',
            width       : 120
        }]
    }
}

export default Neo.setupClass(GridContainer);
