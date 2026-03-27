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
         * @member {Function|String|String[]|null} cellCls
         */
        cellCls: ({column}) => {
            let cls = ['neo-grid-tree-column-cell'];

            if (column.showHelperLines) {
                cls.push('show-helper-lines')
            }

            return cls
        },
        /**
         * @member {Object} defaults
         * @protected
         */
        defaults: {
            module: TreeComponent
        },
        /**
         * @member {Boolean} showHelperLines_=true
         * @reactive
         */
        showHelperLines_: true,
        /**
         * @member {String} type='tree'
         * @protected
         */
        type: 'tree'
    }

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowHelperLines(value, oldValue) {
        if (oldValue !== undefined) {
            let me            = this,
                gridContainer = me.parent,
                body          = gridContainer?.body;

            if (body) {
                body.createViewData(false, true)
            }
        }
    }

    /**
     * @param {Object} config
     * @param {Neo.data.Record} record
     * @returns {Object}
     */
    applyRecordConfigs(config, record) {
        return {
            collapsed      : record.collapsed,
            depth          : record.depth,
            hasError       : record.hasError,
            isLastChild    : record.siblingIndex === record.siblingCount,
            isLeaf         : record.isLeaf,
            isNodeLoading  : record.isLoading,
            showHelperLines: this.showHelperLines,
            value          : record[this.dataField],
            ...config
        }
    }
}

export default Neo.setupClass(Tree);
