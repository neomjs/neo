import Component from '../../../src/component/Base.mjs';
import NeoArray  from '../../../src/util/Array.mjs';
import VdomUtil  from '../../../src/util/VDom.mjs';

/**
 * @class Neo.examples.todoList.version1.MainComponent
 * @extends Neo.component.Base
 */
class MainComponent extends Component {
    static getConfig() {return {
        className: 'Neo.examples.todoList.version1.MainComponent',
        autoMount: true,
        height   : 200,
        margin   : 10,
        maxWidth : 300,
        style    : {border: '1px solid #000', margin: '20px', overflow: 'scroll'},
        width    : 300,

        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, done: true,  text: 'Todo Item 1'},
            {id: 2, done: false, text: 'Todo Item 2'},
            {id: 3, done: false, text: 'Todo Item 3'}
        ],

        /**
         * @member {String|null} inputValue=null
         */
        inputValue: null,

        vdom: {
            cn: [{
                tag: 'ol',
                cn : []
            }, {
                cn: [{
                    tag     : 'input',
                    cls     : ['todo-input'],
                    required: true,
                    style   : {marginLeft: '20px'}
                }, {
                    tag  : 'button',
                    cls  : ['todo-add-button'],
                    html : 'Add Item',
                    style: {marginLeft: '10px'}
                }]
            }]
        }
    }}

    constructor(config) {
        super(config);

        let me           = this,
            domListeners = me.domListeners || [];

        domListeners.push(
            {click: me.onAddButtonClick,   delegate: 'todo-add-button'},
            {click: me.onCheckIconClick,   delegate: 'todo-item'},
            {input: me.onInputFieldChange, delegate: 'todo-input'}
        );

        me.domListeners = domListeners;

        me.createItems(me.data || []);
    }

    createItems(data) {
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

            vdom.cn[0].cn.push({
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
    }

    onAddButtonClick() {
        let me = this;

        if (me.inputValue) {
            me.createItems([{
                id  : null,
                done: false,
                text: me.inputValue
            }]);
        }
    }

    onCheckIconClick(data) {
        let me     = this,
            cls    = ['far', 'fa-square'],
            oldCls = ['fa',  'fa-check'],
            vdom   = me.vdom,
            node   = VdomUtil.findVdomChild(me.vdom, data.path[0].id).vdom;

        if (data.path[0].cls.includes('fa-square')) {
            cls    = ['fa',  'fa-check'];
            oldCls = ['far', 'fa-square'];
        }

        NeoArray.remove(node.cls, oldCls);
        NeoArray.add(node.cls, cls);

        me.vdom = vdom;
    }

    onInputFieldChange(data) {
        this.inputValue = data.value;
    }
}

Neo.applyClassConfig(MainComponent);

export {MainComponent as default};