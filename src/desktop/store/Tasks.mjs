import Store from '../../data/Store.mjs';
import Task  from '../model/Task.mjs';

/**
 * @summary A desktop's open apps, in the order they were opened. `Neo.desktop.WindowManager` keeps it in step with the
 * windows, and a taskbar renders it.
 * @class Neo.desktop.store.Tasks
 * @extends Neo.data.Store
 */
class Tasks extends Store {
    static config = {
        /**
         * @member {String} className='Neo.desktop.store.Tasks'
         * @protected
         */
        className: 'Neo.desktop.store.Tasks',
        /**
         * @member {Neo.data.Model} model=Task
         */
        model: Task
    }
}

export default Neo.setupClass(Tasks);
