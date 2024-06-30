## HTML Style

In case you did not work with neo yet, but come from a more HTML driven ecosystem,
you could achieve the task in a similar way.

<pre data-neo>
import Component from '../component/Base.mjs';
import NeoArray  from '../util/Array.mjs';
import VdomUtil  from '../util/VDom.mjs';

class MainComponent extends Component {
    static config = {
        className: 'Neo.examples.todoList.version1.MainComponent',
        autoMount: true,
        height   : 200,
        margin   : 10,
        maxWidth : 300,
        style    : {border: '1px solid #000', margin: '20px', overflow: 'scroll'},
        width    : 300,

        items: [
            {id: 1, done: true,  text: 'Todo Item 1'},
            {id: 2, done: false, text: 'Todo Item 2'},
            {id: 3, done: false, text: 'Todo Item 3'}
        ],

        inputValue: null,

        vdom:
        {cn: [
            {tag: 'ol', cn: []},
            {cn: [
                {tag: 'input', cls: ['todo-input'], required: true, style: {marginLeft: '20px'}},
                {tag: 'button', cls: ['todo-add-button'], html : 'Add Item', style: {marginLeft: '1em'}}
            ]}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onAddButtonClick,   delegate: 'todo-add-button'},
            {click: me.onCheckIconClick,   delegate: 'todo-item'},
            {input: me.onInputFieldChange, delegate: 'todo-input'}
        ]);

        me.createItems(me.items || [])
    }

    createItems(items) {
        let me = this,
            cls;

        items.forEach(item => {
            cls = ['todo-item'];

            if (item.done) {
                cls.push('fa', 'fa-check')
            } else {
                cls.push('far', 'fa-square')
            }

            me.vdom.cn[0].cn.push({
                tag: 'li',
                cn : [
                    {tag: 'span', cls, style: {cursor: 'pointer', width: '20px'}},
                    {vtype: 'text', html: item.text}
                ]
            });
        });

        me.update()
    }

    onAddButtonClick() {
        let me = this;

        if (me.inputValue) {
            me.createItems([{
                id  : null,
                done: false,
                text: me.inputValue
            }])
        }
    }

    onCheckIconClick(data) {
        let me     = this,
            cls    = ['far', 'fa-square'],
            oldCls = ['fa',  'fa-check'],
            node   = VdomUtil.findVdomChild(me.vdom, data.path[0].id).vdom;

        if (data.path[0].cls.includes('fa-square')) {
            cls    = ['fa',  'fa-check'];
            oldCls = ['far', 'fa-square']
        }

        NeoArray.remove(node.cls, oldCls);
        NeoArray.add(node.cls, cls);

        me.update()
    }

    onInputFieldChange(data) {
        this.inputValue = data.value
    }
}

Neo.setupClass(MainComponent);
</pre>

## Neo Style

content

<pre data-neo>
import Container from '../container/Base.mjs';
import List      from '../list/Base.mjs';
import Model     from '../data/Model.mjs';
import Store     from '../data/Store.mjs';
import TextField from '../form/field/Text.mjs';
import Toolbar   from '../toolbar/Base.mjs';

class TodoListModel extends Model {
    static config = {
        className  : 'Neo.examples.todoList.version2.MainModel',
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

Neo.setupClass(TodoListModel);


class TodoListStore extends Store {
    static config = {
        className  : 'Neo.examples.todoList.version2.TodoListStore',
        keyProperty: 'id',
        model      : TodoListModel,

        data: [
            {id: 1, done: true,  text: 'Todo Item 1'},
            {id: 2, done: false, text: 'Todo Item 2'},
            {id: 3, done: false, text: 'Todo Item 3'}
        ],

        sorters: [{
            property : 'done',
            direction: 'DESC'
        }, {
            property : 'id',
            direction: 'ASC'
        }]
    }
}

Neo.setupClass(TodoListStore);


class MainContainer extends Container {
    static config = {
        className: 'Neo.examples.todoList.version2.MainContainer',
        style    : {padding: '20px'},

        // custom configs
        idCounter: 3,
        store    : null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.store = Neo.create({
            module: TodoListStore
        });

        me.items = [{
            module       : List,
            displayField : 'text',
            flex         : 1,
            store        : me.store,
            style        : {padding: '5px'},
            useCheckBoxes: true
        }, {
            module: Toolbar,
            flex  : 'none',
            dock  : 'bottom',
            items : [{
                module       : TextField,
                flex         : 1,
                labelPosition: 'inline',
                labelText    : 'Item Text',
                reference    : 'addItemField'
            }, '->', {
                handler     : me.onAddButtonClick,
                handlerScope: me,
                scope       : me,
                style       : {height: '27px', marginLeft: '1em'},
                text        : 'Add Item'
            }]
        }];
    }

    onAddButtonClick() {
        let me    = this,
            field = me.down({reference: 'addItemField'}),
            data;

        if (field.value) {
            me.idCounter++;

            data = me.store.data;

            data.push({
                id  : me.idCounter,
                done: false,
                text: field.value
            });

            me.store.data = data
        }
    }
}

Neo.setupClass(MainContainer);
</pre>
