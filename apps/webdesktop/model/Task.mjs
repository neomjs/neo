import Model from '../../../src/data/Model.mjs';

/**
 * @summary An open app in the taskbar. Its id is the app's: one window per app.
 * @class WebDesktop.model.Task
 * @extends Neo.data.Model
 */
class Task extends Model {
    static config = {
        /**
         * @member {String} className='WebDesktop.model.Task'
         * @protected
         */
        className: 'WebDesktop.model.Task',
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
