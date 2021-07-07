import BaseListModel from '../ListModel.mjs';

/**
 * @class Neo.selection.menu.ListModel
 * @extends Neo.selection.ListModel
 */
class ListModel extends BaseListModel {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.selection.menu.ListModel'
         * @protected
         */
        className: 'Neo.selection.menu.ListModel',
        /**
         * @member {String} ntype='selection-menu-listmodel'
         * @protected
         */
        ntype: 'selection-menu-listmodel',
    }}

    /**
     *
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        console.log('onKeyDownLeft');
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownRight(data) {
        let activeSubMenu = this.view.activeSubMenu;

        if (activeSubMenu) {
            activeSubMenu.selectionModel.selectAt(0);
        }
    }
}

Neo.applyClassConfig(ListModel);

export {ListModel as default};
