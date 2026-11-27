import Store     from '../../../src/data/Store.mjs';
import TaskModel from './TaskModel.mjs';

/**
 * Sixty tasks, enough to scroll a phone screen several times.
 * @class Neo.examples.button.floatingAction.TaskStore
 * @extends Neo.data.Store
 */
class TaskStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.button.floatingAction.TaskStore'
         * @protected
         */
        className: 'Neo.examples.button.floatingAction.TaskStore',
        /**
         * Every third task starts done, so the filter button has something to hide
         * @member {Object[]} data
         */
        data: Array.from({length: 60}, (item, index) => ({
            done: index % 3 === 0,
            id  : index + 1,
            name: `Task ${index + 1}`
        })),
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=TaskModel
         */
        model: TaskModel
    }
}

export default Neo.setupClass(TaskStore);
