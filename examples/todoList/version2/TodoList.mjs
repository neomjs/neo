import List from '../../../src/list/Base.mjs';

/**
 * @class TodoListApp2.TodoList
 * @extends Neo.list.Base
 */
class TodoList extends List {
    static getConfig() {return {
        className: 'TodoListApp2.TodoList',
        ntype    : 'todolistapp2-todolist',

        displayField: 'text'
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
    }

    /*createItems(data) {
        let me   = this,
            vdom = me.vdom,
            cls;

        data.forEach(item => {
            cls = ['todo-item'];

            if (item.done) {
                cls.push('fa', 'fa-check');
            } else {
                cls.push('far', 'fa-square');
            }

            vdom.cn.push({
                tag: 'li',
                cn : [{
                    tag  : 'span',
                    cls  : cls,
                    style: {cursor: 'pointer', width: '20px'}
                }, {
                    vtype: 'text',
                    html : item.text
                }]
            });
        });

        me.vdom = vdom;
    }*/
}

Neo.applyClassConfig(TodoList);

export {TodoList as default};