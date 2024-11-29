import MainContainerController    from './MainContainerController.mjs'
import MainContainerStateProvider from './MainContainerStateProvider.mjs'
import Panel                      from '../../../src/container/Panel.mjs';
import TextField                  from '../../../src/form/field/Text.mjs';
import Viewport                   from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.stateProvider.extendedClass.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.extendedClass.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.extendedClass.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object|Neo.state.Provider} stateProvider=MainContainerStateProvider
         */
        stateProvider: MainContainerStateProvider,
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
                    text : 'state.Provider: extended class'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',

                    bind: {
                        text: data => `${data.button1Text}`
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
                    value: data => `${data.button1Text}`
                },

                listeners: {
                    change: 'onTextField1Change'
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
