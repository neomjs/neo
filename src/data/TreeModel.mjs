import Model from './Model.mjs';

/**
 * @summary Defines the schema for hierarchical data structures.
 *
 * This class extends `Neo.data.Model` to provide standard fields required for 
 * Tree Grids and hierarchical lists. It tracks relationships (`parentId`), 
 * node state (`collapsed`, `isLeaf`), and visual hierarchy (`depth`).
 *
 * @class Neo.data.TreeModel
 * @extends Neo.data.Model
 */
class TreeModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.data.TreeModel'
         * @protected
         */
        className: 'Neo.data.TreeModel',
        /**
         * @member {String} ntype='tree-model'
         * @protected
         */
        ntype: 'tree-model',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name        : 'collapsed',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name        : 'depth',
            type        : 'Integer',
            defaultValue: 0
        }, {
            name        : 'hasError',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name        : 'isLeaf',
            type        : 'Boolean',
            defaultValue: true
        }, {
            name        : 'isLoading',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name    : 'parentId',
            type    : 'String',
            nullable: true
        }]
    }
}

export default Neo.setupClass(TreeModel);
