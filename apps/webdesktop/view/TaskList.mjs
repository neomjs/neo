import List from '../../../src/list/Base.mjs';

/**
 * @summary The open apps in the taskbar, one entry per window, read from the tasks store.
 * @class WebDesktop.view.TaskList
 * @extends Neo.list.Base
 */
class TaskList extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.TaskList'
         * @protected
         */
        className: 'WebDesktop.view.TaskList',
        /**
         * The root state provider owns the store
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['webdesktop-task-list','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-task-list', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {store: 'stores.tasks'},
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
     * @param {WebDesktop.model.Task} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            cls: record.minimized ? ['webdesktop-task-minimized'] : [],
            cn : [{
                cls  : ['webdesktop-task-icon'],
                style: {'--webdesktop-app-color': record.color},
                cn   : [{tag: 'i', cls: record.iconCls.split(' ')}]
            }, {
                cls : ['webdesktop-task-text'],
                text: record.text
            }]
        }
    }
}

export default Neo.setupClass(TaskList);
