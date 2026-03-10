import ComponentColumn from './Component.mjs';
import TreeComponent   from './component/Tree.mjs';

/**
 * @class Neo.grid.column.Tree
 * @extends Neo.grid.column.Component
 */
class Tree extends ComponentColumn {
    static config = {
        /**
         * @member {String} className='Neo.grid.column.Tree'
         * @protected
         */
        className: 'Neo.grid.column.Tree',
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: TreeComponent
        },
        /**
         * @member {String} type='tree'
         * @protected
         */
        type: 'tree'
    }

    /**
     * @param {Object} config
     * @param {Neo.data.Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            collapsed    : record.collapsed,
            depth        : record.depth,
            hasError     : record.hasError,
            isLeaf       : record.isLeaf,
            isNodeLoading: record.isLoading,
            value        : record[this.dataField],
            ...config
        };
    }
}

export default Neo.setupClass(Tree);