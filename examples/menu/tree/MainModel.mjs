import TreeModel from '../../../src/data/TreeModel.mjs';

/**
 * @class Neo.examples.menu.tree.MainModel
 * @extends Neo.data.TreeModel
 */
class MainModel extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.examples.menu.tree.MainModel'
         * @protected
         */
        className: 'Neo.examples.menu.tree.MainModel',
        /**
         * The hierarchy fields (parentId, isLeaf, depth, …) come from Neo.data.TreeModel.
         * Only the menu-facing fields are declared here.
         * @member {Object[]} fields
         */
        fields: [{
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);
