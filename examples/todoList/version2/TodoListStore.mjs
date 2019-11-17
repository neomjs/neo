import Store         from '../../../src/data/Store.mjs';
import TodoListModel from './TodoListModel.mjs';

/**
 * @class TestApp.TodoListStore
 * @extends Neo.data.Store
 */
class TodoListStore extends Store {
    static getConfig() {return {
        className: 'TestApp.TodoListStore',
        ntype    : 'todolist-store',

        keyProperty: 'id',
        model      : TodoListModel,

        data: [
            {id: 1, done: true,  text: 'Todo Item 1'},
            {id: 2, done: false, text: 'Todo Item 2'},
            {id: 3, done: false, text: 'Todo Item 3'}
        ],

        sorters: [{
            property : 'done',
            direction: 'DESC'
        }, {
            property : 'text',
            direction: 'ASC'
        }]
    }}
}

Neo.applyClassConfig(TodoListStore);

export {TodoListStore as default};