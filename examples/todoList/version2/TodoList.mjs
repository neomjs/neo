import List from '../../../src/list/Base.mjs';

/**
 * @class Neo.examples.todoList.version2.TodoList
 * @extends Neo.list.Base
 */
class TodoList extends List {
    static config = {
        className   : 'Neo.examples.todoList.version2.TodoList',
        displayField: 'text'
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
    }

    /*createItems(data) {
        let me = this,
            cls;

        data.forEach(item => {
            cls = ['todo-item'];

            if (item.done) {
                cls.push('fa', 'fa-check');
            } else {
                cls.push('far', 'fa-square');
            }

            me.vdom.cn.push({
                tag: 'li',
                cn : [{
                    tag  : 'span',
                    cls,
                    style: {cursor: 'pointer', width: '20px'}
                }, {
                    vtype: 'text',
                    html : item.text
                }]
            });
        });

        me.update();
    }*/
}

Neo.setupClass(TodoList);

export default TodoList;
