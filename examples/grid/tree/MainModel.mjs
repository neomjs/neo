import TreeModel from '../../../src/data/TreeModel.mjs';

/**
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
         * @member {Object[]|null} fields
         */
        fields: [{
            name: 'id',
            type: 'String'
        }, {
            name: 'name',
            type: 'String'
        }, {
            name: 'type',
            type: 'String'
        }, {
            name: 'size',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(MainModel);