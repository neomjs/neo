import BaseListModel from '../ListModel.mjs';

/**
 * Keyboard navigation of a menu cascade. Arrow Up and Down move focus through `Neo.main.addon.Navigator`, and
 * focus is the cursor: Right and Left walk between levels, while Enter and Space activate the focused item.
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
     * @summary Returns the item a key event was pressed on.
     * @param {Object}   data
     * @param {Object[]} data.path
     * @returns {Object|undefined} The item's path entry
     * @protected
     */
    getKeyItem({path}) {
        return path[this.view.getInteractiveItemIndex(path)]
    }

    /**
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        this.view.onKeyDownEscape(data)
    }

    /**
     * Left leaves a submenu for the item that opened it. A root menu has no level to go back to.
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.view.leaveSubMenu()
    }

    /**
     * Right enters the submenu of the focused parent item, showing it first when it is not showing yet.
     * @param {Object} data
     */
    onKeyDownRight(data) {
        let {view} = this,
            item   = this.getKeyItem(data),
            record = item && view.store.get(view.getItemRecordId(item.id));

        record && view.hasChildren(record) && view.showSubMenu(item.id, record)
    }

    /**
     * Space activates the focused item the way Enter does. The Navigator turns Enter into a click on the main
     * thread; Space reaches this model instead, so it replays both halves of that click here, in listener order.
     * @param {Object} data
     */
    onKeyDownSpace(data) {
        let me   = this,
            item = me.getKeyItem(data);

        if (item) {
            me.view.onItemClick(item, data);
            me.onListClick({currentTarget: item.id})
        }
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        this.view.keys?._keys.push({fn: 'onKeyDownSpace', key: 'Space', scope: this.id})
    }

    /**
     *
     */
    unregister() {
        this.view.keys?.removeKeys([{fn: 'onKeyDownSpace', key: 'Space', scope: this.id}]);

        super.unregister()
    }
}

export default Neo.setupClass(ListModel);
