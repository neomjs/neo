import Model from '../../../src/data/Model.mjs';

/**
 * @summary A todo item: its text, and whether it is done.
 * @class Neo.examples.todoList.version2.TodoListModel
 * @extends Neo.data.Model
 */
class TodoListModel extends Model {
    static config = {
        className  : 'Neo.examples.todoList.version2.TodoListModel',
        keyProperty: 'id',

        fields: [{
            name: 'id',
            type: 'Int'
        }, {
            name: 'done',
            type: 'Boolean'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

export default Neo.setupClass(TodoListModel);
