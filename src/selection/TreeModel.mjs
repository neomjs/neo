import ListModel from './ListModel.mjs';

/**
 * @class Neo.selection.TreeModel
 * @extends Neo.selection.ListModel
 */
class TreeModel extends ListModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.TreeModel'
         * @protected
         */
        className: 'Neo.selection.TreeModel',
        /**
         * @member {String} ntype='selection-treemodel'
         * @protected
         */
        ntype: 'selection-treemodel'
    }

    /**
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        console.log('onKeyDownEnter', data)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        console.log('onNavKey', data, step)
    }
}

Neo.applyClassConfig(TreeModel);

export default TreeModel;
