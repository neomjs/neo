import List from '../list/Base.mjs';

/**
 * @summary A web desktop's open apps in its taskbar: one entry per app window, read from a `Neo.desktop.store.Tasks`.
 *
 * A minimized app's entry dims, and its open indicator shrinks to a dot. The list only fires `itemClick`: the owner
 * of the window manager restores the window or brings it to the front (`Neo.desktop.Container#onTaskItemClick`).
 * @class Neo.desktop.TaskList
 * @extends Neo.list.Base
 */
class TaskList extends List {
    static config = {
        /**
         * @member {String} className='Neo.desktop.TaskList'
         * @protected
         */
        className: 'Neo.desktop.TaskList',
        /**
         * The window manager's owner owns the tasks store
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['neo-desktop-task-list','neo-list']
         * @protected
         */
        baseCls: ['neo-desktop-task-list', 'neo-list'],
        /**
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {String} displayField='text'
         */
        displayField: 'text'
    }

    /**
     * @param {Neo.desktop.model.Task} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            cls: record.minimized ? ['neo-desktop-task-minimized'] : [],
            cn : [{
                cls  : ['neo-desktop-task-icon'],
                style: {'--desktop-app-color': record.color},
                cn   : [{tag: 'i', cls: record.iconCls ? record.iconCls.split(' ') : []}]
            }, {
                cls : ['neo-desktop-task-text'],
                text: record.text
            }]
        }
    }
}

export default Neo.setupClass(TaskList);
