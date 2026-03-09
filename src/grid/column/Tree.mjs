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
        let me        = this,
            dataValue = record[me.dataField];

        return {
            depth   : record.depth || 0,
            expanded: record.expanded || false,
            isLeaf  : record.isLeaf || false,
            value   : dataValue,
            ...config
        };
    }
}

export default Neo.setupClass(Tree);