import Model from '../../data/Model.mjs';

/**
 * @summary An open app in a desktop's taskbar. Its id is the app's, since a desktop opens one window per app, and
 * `minimized` says whether that window is hidden into its task.
 * @class Neo.desktop.model.Task
 * @extends Neo.data.Model
 */
class Task extends Model {
    static config = {
        /**
         * @member {String} className='Neo.desktop.model.Task'
         * @protected
         */
        className: 'Neo.desktop.model.Task',
        /**
         * @member {Object[]} fields
         */
        fields: [{
            name: 'color',
            type: 'String'
        }, {
            name: 'iconCls',
            type: 'String'
        }, {
            name: 'id',
            type: 'String'
        }, {
            name        : 'minimized',
            type        : 'Boolean',
            defaultValue: false
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(Task);
