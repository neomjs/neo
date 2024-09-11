import Model from '../../../src/data/Model.mjs';

/**
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
