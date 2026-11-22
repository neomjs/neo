import List from '../../../src/list/Base.mjs';

/**
 * @summary The todo items. Each is a native checkbox beside its text, so Tab and Space work as in any form: the
 * checkbox writes the record's `done`, and a done item draws struck through. Selection is off, because the checkbox
 * is the item's control.
 * @class Neo.examples.todoList.version2.TodoList
 * @extends Neo.list.Base
 */
class TodoList extends List {
    static config = {
        /**
         * @member {String} className='Neo.examples.todoList.version2.TodoList'
         * @protected
         */
        className: 'Neo.examples.todoList.version2.TodoList',
        /**
         * @member {String[]} baseCls=['neo-todo-list','neo-list']
         */
        baseCls: ['neo-todo-list', 'neo-list'],
        /**
         * @member {Boolean} disableSelection=true
         * @reactive
         */
        disableSelection: true,
        /**
         * @member {String} displayField='text'
         */
        displayField: 'text'
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({change: me.onCheckChange, delegate: '.neo-todo-check', scope: me})
    }

    /**
     * @summary Renders an item as a label holding its checkbox and its text.
     * @param {Object} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        return [{tag: 'label', cls: record.done ? ['neo-todo-item', 'neo-todo-done'] : ['neo-todo-item'], cn: [
            {tag: 'input', cls: ['neo-todo-check'], checked: record.done, type: 'checkbox'},
            {tag: 'span',  cls: ['neo-todo-text'],  text: record.text}
        ]}]
    }

    /**
     * @summary Writes a toggled checkbox into its record's `done`.
     * @param {Object} data
     */
    onCheckChange(data) {
        let me     = this,
            item   = data.path.find(node => node.cls?.includes('neo-list-item')),
            record = item && me.store.get(me.getItemRecordId(item.id));

        if (record) {
            record.done = data.target.checked
        }
    }
}

export default Neo.setupClass(TodoList);
