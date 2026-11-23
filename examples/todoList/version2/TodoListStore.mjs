import Store         from '../../../src/data/Store.mjs';
import TodoListModel from './TodoListModel.mjs';

/**
 * @summary The items a first visit opens on: a few believable ones, the first already done.
 * @type {Object[]}
 */
export const startItems = [
    {id: 1, done: true,  text: 'Book a room for the team retro'},
    {id: 2, done: false, text: 'Review the onboarding checklist'},
    {id: 3, done: false, text: 'Order a second monitor'},
    {id: 4, done: false, text: 'Water the office plants'}
];

/**
 * @summary The todo items, in the order they were added. It starts empty: the controller loads what the browser's
 * storage kept, or the {@link startItems} on a first visit.
 * @class Neo.examples.todoList.version2.TodoListStore
 * @extends Neo.data.Store
 */
class TodoListStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.todoList.version2.TodoListStore'
         * @protected
         */
        className: 'Neo.examples.todoList.version2.TodoListStore',
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=TodoListModel
         */
        model: TodoListModel
    }
}

export default Neo.setupClass(TodoListStore);
