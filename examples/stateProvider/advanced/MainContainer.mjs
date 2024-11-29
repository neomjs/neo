import DisplayField            from '../../../src/form/field/Display.mjs';
import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../../src/container/Panel.mjs';
import StateProvider           from '../../../src/state/Provider.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.stateProvider.advanced.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.model.advanced.MainContainer'
         * @protected
         */
        className: 'Neo.examples.model.advanced.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object|Neo.state.Provider} stateProvider
         */
        stateProvider: {
            data: {
                button1Text: 'Button 1',
                button3Text: 'Button 3'
            }
        },
        /**
         * @member {Object} style
         */
        style: {
            padding: '20px'
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Panel,
            reference: 'panel',

            stateProvider: {
                data: {
                    button2Text: 'Button 2'
                }
            },

            containerConfig: {
                reference: 'content-container',
                style    : {padding: '20px'},

                layout: {
                    ntype: 'vbox',
                    align: 'start'
                }
            },

            headers: [{
                dock     : 'top',
                reference: 'header-toolbar',

                items: [{
                    ntype: 'label',
                    text : 'model.Component: advanced'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',

                    bind: {
                        text: data => `Hello ${data.button2Text} ${1+2} ${data.button1Text + data.button2Text}`
                    }
                }, {
                    handler: 'onButton2Click',
                    iconCls: 'fa fa-user',
                    style  : {marginLeft: '10px'},

                    bind: {
                        text: data => data.button2Text.toLowerCase()
                    }
                }]
            }],

            itemDefaults: {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'}
            },

            items: [{
                items: [{
                    module    : TextField,
                    flex      : 'none',
                    labelText : 'data.button1Text:',
                    labelWidth: 150,
                    width     : 300,

                    bind: {
                        value: data => data.button1Text
                    },

                    listeners: {
                        change: 'onTextField1Change'
                    }
                }, {
                    module   : DisplayField,
                    labelText: 'Button1 formatter:',
                    style    : {marginLeft: '2em'},
                    value    : 'Hello ${data.button2Text} ${1+2} ${data.button1Text + data.button2Text}',
                    width    : 600
                }]
            }, {
                items: [{
                    module    : TextField,
                    flex      : 'none',
                    labelText : 'data.button2Text:',
                    labelWidth: 150,
                    width     : 300,

                    bind: {
                        value: data => data.button2Text
                    },

                    listeners: {
                        change: 'onTextField2Change'
                    }
                }, {
                    module   : DisplayField,
                    labelText: 'Button2 formatter:',
                    style    : {marginLeft: '2em'},
                    value    : '${data.button2Text.toLowerCase()}',
                    width    : 600
                }]
            }, {
                ntype  : 'button',
                handler: 'onAddButtonTextfieldButtonClick',
                style  : {marginTop: '2em'},
                text   : 'Add a third button & textfield'
            }, {
                ntype  : 'button',
                handler: 'onLogMainStateProviderIntoConsoleButtonClick',
                style  : {marginTop: '1em'},
                text   : 'Log main stateProvider into console'
            }, {
                ntype  : 'button',
                handler: 'onLogChildStateProviderIntoConsoleButtonClick',
                style  : {marginTop: '1em'},
                text   : 'Log child stateProvider into console'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
