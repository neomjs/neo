import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.todoList.version2.TodoListModel
 * @extends Neo.data.Model
 */
class TodoListModel extends Model {
    static config = {
        className  : 'Neo.examples.todoList.version2.MainModel',
        keyProperty: 'id',

        fields: [{
            name: 'id',
            type: 'Number'
        }, {
            name: 'done',
            type: 'Boolean'
        }, {
            name: 'text',
            type: 'String'
        }]
    }
}

Neo.setupClass(TodoListModel);

export default TodoListModel;
