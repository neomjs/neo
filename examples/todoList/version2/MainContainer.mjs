import Button    from '../../../src/button/Base.mjs';
import Container from '../../../src/container/Base.mjs';
import TextField from '../../../src/form/field/Text.mjs';
import TodoList  from './TodoList.mjs';
import Toolbar   from '../../../src/toolbar/Base.mjs';

/**
 * @class Neo.examples.todoList.version2.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        className: 'Neo.examples.todoList.version2.MainContainer',
        autoMount: true,
        height   : 300,
        margin   : 20,
        style    : {margin: '20px'},
        width    : 300,

        items: [{
            module   : TodoList,
            flex     : 1,
            reference: 'todo-list'
        }, {
            module: Toolbar,
            dock  : 'bottom',
            flex  : 'none',
            items : [{
                module       : TextField,
                flex         : 1,
                labelPosition: 'inline',
                labelText    : 'Item Text',
                reference    : 'add-item-field'
            }, '->', {
                module : Button,
                handler: 'up.onAddButtonClick',
                style  : {height: '27px'},
                text   : 'Add Item'
            }]
        }]
    }

    /**
     * @member {Number} idCounter=0
     */
    idCounter = 0

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        // Assuming the store is already loaded.
        // For remote stores, add a load listener instead
        this.idCounter = this.getReference('todo-list').store.getCount()
    }

    /**
     * @param {Object} data
     */
    onAddButtonClick(data) {
        let me    = this,
            field = me.getReference('add-item-field');

        if (field.value) {
            me.idCounter++;

            me.getReference('todo-list').store.add({
                id  : me.idCounter,
                done: false,
                text: field.value
            })
        }
    }
}

export default Neo.setupClass(MainContainer);
