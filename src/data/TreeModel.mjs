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
            name        : 'childCount',
            type        : 'Integer',
            defaultValue: 0
        }, {
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
        }, {
            /**
             * Architectural Note:
             * `siblingCount` and `siblingIndex` are maintained as fields on the record rather than
             * calculated dynamically via getters. This is a deliberate trade-off.
             *
             * While updating these values during data mutation (e.g. adding/removing nodes) requires O(N) operations,
             * it ensures that the `grid.Row` can access them in O(1) time during its `createVdom` hot path.
             * Since scrolling occurs at 60-120fps and mutations are comparatively rare, optimizing the read path
             * is critical for rendering performance in massive TreeGrids.
             */
            name        : 'siblingCount',
            type        : 'Integer',
            defaultValue: 1
        }, {
            name        : 'siblingIndex',
            type        : 'Integer',
            defaultValue: 1
        }]
    }
}

export default Neo.setupClass(TreeModel);
