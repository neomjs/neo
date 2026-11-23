import Container from '../../../src/grid/Container.mjs';
import MainStore from './MainStore.mjs';

const STATUS_CLS = {
    'Committed': 'is-committed',
    'On track' : 'is-on-track',
    'Watch'    : 'is-watch'
};

/**
 * @summary Full-stage tree grid binding a three-level operating budget with rolled-up parent totals.
 *
 * Numeric roll-up columns (`Budget`, `Spent`, `Used`, `Seats`) sit immediately beside the `tree`
 * column so both phone viewports (`390 × 844`) and `640 × 360` catalog covers show parent-child sums
 * without horizontal scrolling.
 *
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
         * @member {Number} rowHeight=36
         */
        rowHeight: 36,
        /**
         * @member {Neo.data.Store} store=MainStore
         */
        store: MainStore,
        /**
         * @member {Object[]} columns
         */
        columns: [{
            dataField: 'name',
            flex     : 2,
            minWidth : 210,
            text     : 'Name',
            type     : 'tree'
        }, {
            cellAlign: 'right',
            currency : 'USD',
            dataField: 'budget',
            text     : 'Budget',
            type     : 'currency',
            width    : 136
        }, {
            cellAlign: 'right',
            currency : 'USD',
            dataField: 'spent',
            text     : 'Spent',
            type     : 'currency',
            width    : 136
        }, {
            dataField: 'utilization',
            text     : 'Used',
            type     : 'progress',
            width    : 132
        }, {
            cellAlign: 'right',
            dataField: 'headcount',
            text     : 'Seats',
            width    : 82
        }, {
            dataField: 'owner',
            flex     : 1,
            minWidth : 150,
            text     : 'Owner'
        }, {
            dataField   : 'status',
            text        : 'Status',
            width       : 116,
            cellRenderer: ({value}) => value ? {
                cn: [{
                    tag : 'span',
                    cls : ['tree-budget-status', STATUS_CLS[value] || 'is-on-track'],
                    text: value
                }]
            } : ''
        }]
    }
}

export default Neo.setupClass(GridContainer);
