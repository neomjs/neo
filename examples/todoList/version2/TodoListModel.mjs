import Model  from '../../../src/data/Model.mjs';

/**
 * @class TestApp.TodoListModel
 * @extends Neo.data.Model
 */
class TodoListModel extends Model {
    static getConfig() {return {
        className: 'TestApp.MainModel',
        ntype    : 'todolist-model',

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