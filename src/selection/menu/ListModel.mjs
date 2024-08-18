import BaseListModel from '../ListModel.mjs';

/**
 * @class Neo.selection.menu.ListModel
 * @extends Neo.selection.ListModel
 */
class ListModel extends BaseListModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.menu.ListModel'
         * @protected
         */
        className: 'Neo.selection.menu.ListModel',
        /**
         * @member {String} ntype='selection-menu-listmodel'
         * @protected
         */
        ntype: 'selection-menu-listmodel'
    }

    /**
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        this.view.onKeyDownEscape(data)
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        let {view}       = this,
            {parentMenu} = view;

        if (parentMenu) {
            view.hideSubMenu();
            view.selectionModel.deselectAll();
            parentMenu.selectionModel.selectAt(view.parentIndex)
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        let activeSubMenu = this.view.activeSubMenu;

        if (activeSubMenu) {
            activeSubMenu.selectionModel.selectAt(0)
        }
    }
}

export default Neo.setupClass(ListModel);
