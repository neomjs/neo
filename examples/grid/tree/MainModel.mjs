import TreeModel from '../../../src/data/TreeModel.mjs';

/**
 * @summary Schema for the three-level operating budget hierarchy in `examples/grid/tree`.
 *
 * Leaf rows (`levelKind: 'Item'`) supply raw `headcount`, `budget`, and `spent` figures;
 * `MainStore` derives those same numeric fields for every `Team` and `Department` parent row
 * from its children so parent totals can never drift from their underlying items.
 *
 * @class Neo.examples.grid.tree.MainModel
 * @extends Neo.data.TreeModel
 */
class MainModel extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.tree.MainModel'
         * @protected
         */
        className: 'Neo.examples.grid.tree.MainModel',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name        : 'levelKind',
            type        : 'String',
            defaultValue: 'Item'
        }, {
            name        : 'owner',
            type        : 'String',
            defaultValue: ''
        }, {
            name        : 'status',
            type        : 'String',
            defaultValue: 'On track'
        }, {
            name        : 'headcount',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name        : 'budget',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name        : 'spent',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name     : 'utilization',
            type     : 'Integer',
            calculate: data => data.budget > 0 ? Math.round((data.spent / data.budget) * 100) : 0
        }]
    }
}

export default Neo.setupClass(MainModel);
