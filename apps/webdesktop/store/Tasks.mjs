import Store from '../../../src/data/Store.mjs';
import Task  from '../model/Task.mjs';

/**
 * @summary The open apps, in the order they were opened. The taskbar renders it.
 * @class WebDesktop.store.Tasks
 * @extends Neo.data.Store
 */
class Tasks extends Store {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Tasks'
         * @protected
         */
        className: 'WebDesktop.store.Tasks',
        /**
         * @member {Neo.data.Model} model=Task
         */
        model: Task
    }
}

export default Neo.setupClass(Tasks);
