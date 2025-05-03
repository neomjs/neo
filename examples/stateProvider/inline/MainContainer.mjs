import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../../src/container/Panel.mjs';
import StateProvider           from '../../../src/state/Provider.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.stateProvider.inline.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.inline.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.inline.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object|Neo.state.Provider} stateProvider
         */
        stateProvider: {
            module: StateProvider,

            data: {
                button1Text: 'Button 1',
                button2Text: 'Button 2'
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
            module: Panel,

            containerConfig: {
                layout: {
                    ntype: 'vbox',
                    align: 'start'
                },

                style: {
                    padding: '20px'
                }
            },

            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    text : 'state.Provider: inline definition'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',

                    bind: {
                        text: data => data.button1Text
                    }
                }, {
                    handler: 'onButton2Click',
                    iconCls: 'fa fa-user',
                    style  : {marginLeft: '10px'},

                    bind: {
                        text: data => `${data.button2Text}`
                    }
                }]
            }],

            items: [{
                module    : TextField,
                flex      : 'none',
                labelText : 'Button1 text:',
                labelWidth: 110,
                width     : 300,

                bind: {
                    value: {twoWay: true, value: data => data.button1Text}
                }
            }, {
                module    : TextField,
                flex      : 'none',
                labelText : 'Button2 text:',
                labelWidth: 110,
                width     : 300,

                bind: {
                    value: data => `${data.button2Text}`
                },

                listeners: {
                    change: 'onTextField2Change'
                }
            }, {
                ntype  : 'button',
                handler: 'onLogStateProviderIntoConsoleButtonClick',
                style  : {marginTop: '2em'},
                text   : 'Log stateProvider into console'
            }]
        }]
    }
}

export default Neo.setupClass(MainContainer);
