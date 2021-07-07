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
}

Neo.applyClassConfig(ListModel);

export {ListModel as default};
