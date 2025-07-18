# Todo List

This tutorial guides you through creating the same simple Todo List application using three different coding styles
available in Neo.mjs. This will help you understand the flexibility of the framework and choose the approach that best
fits your project or personal preference.

## 1. HTML Style

This first version demonstrates how you can build a component in a way that might feel familiar if you have a background
in traditional HTML and JavaScript. It directly constructs and manipulates a `vdom` (Virtual DOM) object that mirrors an
HTML structure. Event handling is set up manually using DOM listeners. This approach offers fine-grained control and is
useful for understanding the fundamentals of Neo.mjs's vdom system.

```javascript live-preview
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
                    {vtype: 'text', text: item.text}
                ]
            })
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
            node   = VdomUtil.find(me.vdom, data.path[0].id).vdom;

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

MainComponent = Neo.setupClass(MainComponent);
```

## 2. Functional Style

This second version showcases a more modern and concise way to build components using a functional approach. It
leverages hooks like `useConfig` for state management and `useEvent` for handling DOM events, resulting in more
declarative and readable code. This style is heavily inspired by concepts like React Hooks and is ideal for creating
self-contained, stateful components with minimal boilerplate.

```javascript live-preview
import {defineComponent, useConfig, useEvent} from '../functional/_export.mjs';

let MainContainer = defineComponent({
    config: {
        className: 'Neo.examples.todoList.version3.MainContainer'
    },
    createVdom() {
        const [items, setItems] = useConfig([
            {id: 1, done: true,  text: 'Todo Item 1'},
            {id: 2, done: false, text: 'Todo Item 2'},
            {id: 3, done: false, text: 'Todo Item 3'}
        ]);

        const [inputValue, setInputValue]         = useConfig('');
        const [inputVdomValue, setInputVdomValue] = useConfig('');

        useEvent('click', data => {
            if (inputValue) {
                const newItem = {
                    id  : (items.length > 0 ? Math.max(...items.map(i => i.id)) : 0) + 1,
                    done: false,
                    text: inputValue
                };
                setItems([...items, newItem]);
                setInputValue('');
                setInputVdomValue('');
            }
        }, '.todo-add-button');

        useEvent('click', data => {
            const liNode        = data.path[1];
            const clickedItemId = parseInt(liNode.data.id);

            setItems(items => items.map(item =>
                item.id === clickedItemId ? {...item, done: !item.done} : item
            ));
        }, '.todo-item');

        useEvent('input', data => {
            setInputValue(data.value);
            setInputVdomValue(undefined);
        }, '.todo-input');

        return {
            style: {border: '1px solid #000', margin: '20px', padding: '10px', maxWidth: '300px'},
            cn: [
                {tag: 'h3', html: 'Todo List'},
                {tag: 'ol', cn: items.map(item => ({
                    tag    : 'li',
                    'data-id': item.id,
                    cn     : [
                        {
                            tag : 'span',
                            cls : ['todo-item', item.done ? 'fa fa-check' : 'far fa-square'],
                            style: {cursor: 'pointer', width: '20px', marginRight: '5px'}
                        },
                        {vtype: 'text', html: item.text}
                    ]
                }))},
                {cn: [{
                    tag: 'input',
                    cls: ['todo-input'],
                    value: inputVdomValue
                }, {
                    tag: 'button',
                    cls: ['todo-add-button'],
                    html: 'Add Item',
                    style: {marginLeft: '1em'}
                }]}
            ]
        };
    }
});
```

## 3. Classic Neo Style

This final version illustrates the classic, object-oriented approach to building UIs in Neo.mjs. It separates concerns
by using dedicated classes for different parts of the application: a `Store` to manage the data, a `Model` to define
the data structure, and `Container` with child components (`List`, `Toolbar`, `TextField`) to create the view.
This powerful, structured approach is well-suited for larger, more complex applications where a clear separation of data,
logic, and presentation is beneficial.

```javascript live-preview
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

TodoListModel = Neo.setupClass(TodoListModel);


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

TodoListStore = Neo.setupClass(TodoListStore);


class MainContainer extends Container {
    static config = {
        className: 'Neo.examples.todoList.version2.MainContainer',
        style    : {padding: '20px'},

        items: [{
            module       : List,
            displayField : 'text',
            flex         : 1,
            reference    : 'todo-list',
            store        : TodoListStore,
            style        : {padding: '5px'},
            useCheckBoxes: true
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
                handler: 'up.onAddButtonClick',
                style  : {height: '27px', marginLeft: '1em'},
                text   : 'Add Item'
            }]
        }]
    }

    idCounter = 0

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.idCounter = this.getReference('todo-list').store.getCount()
    }

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

MainContainer = Neo.setupClass(MainContainer);
```

