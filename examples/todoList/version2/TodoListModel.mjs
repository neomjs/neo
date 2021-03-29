import Model  from '../../../src/data/Model.mjs';

/**
 * @class Neo.examples.todoList.version2.TodoListModel
 * @extends Neo.data.Model
 */
class TodoListModel extends Model {
    static getConfig() {return {
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
    }}
}

Neo.applyClassConfig(TodoListModel);

export {TodoListModel as default};