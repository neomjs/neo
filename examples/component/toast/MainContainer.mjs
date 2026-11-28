import Button                  from '../../../src/button/Base.mjs';
import CheckBox                from '../../../src/form/field/CheckBox.mjs';
import ComboBox                from '../../../src/form/field/ComboBox.mjs';
import Component               from '../../../src/component/Base.mjs';
import Container               from '../../../src/container/Base.mjs';
import FormContainer           from '../../../src/form/Container.mjs';
import MainContainerController from './MainContainerController.mjs';
import NumberField             from '../../../src/form/field/Number.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import ThemeSwitcher           from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.component.toast.MainContainer
 * @extends Neo.container.Viewport
 * @summary Toast configuration form with a syntax-highlighted source preview.
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.component.toast.MainContainer',
        autoMount : true,
        cls       : ['neo-examples-toast'],
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module: Toolbar,
            cls   : ['neo-examples-toast-toolbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
            items : [{
                module: Component,
                html  : '<strong>Toast Builder</strong>'
            }, '->', {
                module: ThemeSwitcher
            }]
        }, {
            module: Container,
            cls   : ['neo-examples-toast-body'],
            flex  : 1,
            layout: {ntype: 'flexbox', align: 'stretch', direction: 'row', wrap: 'wrap'},

            items: [{
                module   : FormContainer,
                flex     : 'none',
                layout   : {ntype: 'vbox'},
                style    : {margin: '20px'},
                reference: 'form',

                itemDefaults: {
                    height        : 27,
                    labelPosition : 'inline',
                    listeners     : {change: 'onChange'},
                    maxValue      : 4000,
                    style         : {marginLeft: '10px'},
                    useSpinButtons: false,
                    width         : 200
                },

                items: [{
                    module   : TextField,
                    labelText: 'msg',
                    name     : 'msg',
                    required : true,
                    style    : {paddingBottom: '40px', marginLeft: '10px'}
                }, {
                    module   : TextField,
                    labelText: 'title',
                    name     : 'title'
                }, {
                    module   : TextField,
                    labelText: 'iconCls',
                    name     : 'iconCls'
                }, {
                    module    : ComboBox,
                    labelText : 'position = tr',
                    name      : 'position',
                    store     : {data: [{name: 'tl'}, {name: 'tc'}, {name: 'tr'}, {name: 'bl'}, {name: 'bc'}, {name: 'br'}]},
                    valueField: 'name'
                }, {
                    module    : ComboBox,
                    labelText : 'slideDirection = right',
                    name      : 'slideDirection',
                    store     : {data: [{name: 'down'}, {name: 'up'}, {name: 'left'}, {name: 'right'}]},
                    valueField: 'name'
                }, {
                    module    : ComboBox,
                    labelText : 'ui = info',
                    name      : 'ui',
                    store     : {data: [{name: 'info'}, {name: 'danger'}, {name: 'success'}]},
                    valueField: 'name'
                }, {
                    module   : NumberField,
                    labelText: 'minHeight = 50',
                    name     : 'minHeight'
                }, {
                    module   : NumberField,
                    labelText: 'maxWidth = 250',
                    name     : 'maxWidth'
                }, {
                    module   : NumberField,
                    labelText: 'removeDelay = 3000',
                    name     : 'removeDelay',
                    maxValue : 99999
                }, {
                    module       : CheckBox,
                    labelPosition: 'left',
                    labelText    : 'Closable',
                    labelWidth   : 70,
                    name         : 'closable',
                    reference    : 'closable',
                    style        : {padding: '8px 0 10px 9px'}
                }, {
                    module   : Button,
                    reference: 'creation-button',
                    disabled : true,
                    handler  : 'createToast',
                    height   : 27,
                    iconCls  : 'fa-solid fa-window-maximize',
                    style    : {marginLeft: '10px'},
                    text     : 'create toast'
                }]
            }, {
                module   : Component,
                reference: 'output',
                cls      : ['output'],
                vdom     : {
                    cn: [{
                        tag: 'pre',
                        cn : [{
                            tag  : 'code',
                            class: 'javascript'
                        }]
                    }]
                },

                /**
                 * @summary Prints the call a component runs for publication as a single code leaf's text.
                 * @param {Object} data Toast form values.
                 * @returns {String}
                 */
                itemTpl: data => {
                    const
                        literal = value => Neo.isString(value) ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(value),
                        entries = [['appName', 'this.appName'], ['windowId', 'this.windowId'], ['msg', literal(data.msg)]];

                    for (const key of ['title', 'iconCls', 'closable', 'position', 'slideDirection', 'maxWidth', 'minHeight', 'removeDelay', 'ui']) {
                        data[key] && entries.push([key, literal(data[key])])
                    }

                    const width = Math.max(...entries.map(([key]) => key.length));

                    return 'Neo.toast({\n' + entries.map(([key, value]) => `    ${key.padEnd(width)}: ${value}`).join(',\n') + '\n})'
                }
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
