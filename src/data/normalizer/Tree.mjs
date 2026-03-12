import Base from './Base.mjs';
import Neo  from '../../Neo.mjs';

/**
 * @summary A data normalizer specifically for hierarchical tree structures.
 *
 * This class is a crucial part of the `Neo.data.TreeStore` pipeline. External APIs
 * often return hierarchical data with nested `children` arrays. However, the `TreeStore`
 * (and the virtual scroller) operates on a flattened 1D array of records, relying on
 * `parentId` references to construct the internal `#childrenMap`.
 *
 * The `Tree` normalizer recursively traverses nested objects and flattens them,
 * automatically injecting `parentId` and `isLeaf` metadata.
 *
 * @class Neo.data.normalizer.Tree
 * @extends Neo.data.normalizer.Base
 */
class Tree extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.normalizer.Tree'
         * @protected
         */
        className: 'Neo.data.normalizer.Tree',
        /**
         * @member {String} ntype='normalizer-tree'
         * @protected
         */
        ntype: 'normalizer-tree',
        /**
         * The property name in the raw data that contains the child nodes.
         * @member {String} childrenProperty='children'
         */
        childrenProperty: 'children',
        /**
         * The property name used for the primary key.
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id'
    }

    /**
     * Reshapes nested hierarchical data into a flat 1D array with parentId relationships.
     * @param {Object|Array} data The raw hierarchical JavaScript data structure.
     * @returns {Object} An object containing the flattened `data` array and the `totalCount`.
     */
    normalize(data) {
        let me         = this,
            flattened  = [];

        // Ensure data is an array to start with
        let items = Array.isArray(data) ? data : (data ? [data] : []);

        me.flattenNodes(items, null, flattened);

        return {
            data      : flattened,
            totalCount: flattened.length
        };
    }

    /**
     * Recursively traverses nodes, flattening them into the target array and setting parentIds.
     * @param {Array} nodes The current array of nodes to process.
     * @param {String|Number|null} parentId The ID of the parent node.
     * @param {Array} target The flattened output array.
     * @protected
     */
    flattenNodes(nodes, parentId, target) {
        let me               = this,
            childrenProperty = me.childrenProperty,
            keyProperty      = me.keyProperty,
            node, children;

        for (node of nodes) {
            children = node[childrenProperty];

            // Inject parent reference
            node.parentId = parentId;

            // Determine if it's a leaf node. If it has children, it's definitively not a leaf.
            // If it doesn't have children, we mark it as a leaf unless the data explicitly says otherwise.
            if (children && children.length > 0) {
                node.isLeaf = false;
            } else if (!Object.hasOwn(node, 'isLeaf')) {
                node.isLeaf = true;
            }

            // Remove the nested children array from the flattened object to save memory
            // as the TreeStore will manage the hierarchy via `#childrenMap`
            if (Object.hasOwn(node, childrenProperty)) {
                delete node[childrenProperty];
            }

            target.push(node);

            // Recursively process children
            if (children && children.length > 0) {
                me.flattenNodes(children, node[keyProperty], target);
            }
        }
    }
}

export default Neo.setupClass(Tree);