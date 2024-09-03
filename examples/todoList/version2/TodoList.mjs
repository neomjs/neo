import List from '../../../src/list/Base.mjs';

/**
 * @class Neo.examples.todoList.version2.TodoList
 * @extends Neo.list.Base
 */
class TodoList extends List {
    static config = {
        className    : 'Neo.examples.todoList.version2.TodoList',
        displayField : 'text',
        useCheckBoxes: true
    }
}

export default Neo.setupClass(TodoList);
