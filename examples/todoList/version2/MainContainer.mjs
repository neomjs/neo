import Button        from '../../../src/button/Base.mjs';
import Container     from '../../../src/container/Base.mjs';
import TextField     from '../../../src/form/field/Text.mjs';
import TodoList      from './TodoList.mjs';
import TodoListStore from './TodoListStore.mjs';
import Toolbar       from '../../../src/container/Toolbar.mjs';

/**
 * @class TodoListApp2.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        className: 'TodoListApp2.MainContainer',
        ntype    : 'todolistapp2-maincontainer',

        autoMount: true,
        height   : 300,
        margin   : 20,
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {margin: '20px'},
        width    : 300,

        /**
         * @member {Number} idCounter=0
         */
        idCounter: 0,

        /**
         * @member {Neo.data.Store|null} store=null
         */
        store: null
    }}

    constructor(config) {
        super(config);

        let me = this;

        me.store = Neo.create({
            module: TodoListStore
        });

        me.items = [{
            module: TodoList,
            flex  : 1,
            store : me.store
        }, {
            module: Toolbar,
            flex  : 'none',
            dock  : 'bottom',
            items : [{
                module       : TextField,
                labelPosition: 'inline',
                labelText    : 'Item Text',
                reference    : 'addItemField'
            }, '->', {
                module      : Button,
                handler     : me.onAddButtonClick,
                handlerScope: me,
                scope       : me,
                style       : {height: '27px'},
                text        : 'Add Item'
            }]
        }];
    }

    onAddButtonClick() {
        let me    = this,
            field = me.down({reference: 'addItemField'}),
            data;

        if (field.value) {
            me.idCounter--;

            data = me.store.data;

            data.push({
                id  : me.idCounter,
                done: false,
                text: field.value
            });

            me.store.data = data;

            console.log('onAddButtonClick', data);
            console.log(me.store.items);
        }
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};