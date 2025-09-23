import DisplayField            from '../../../src/form/field/Display.mjs';
import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../../src/container/Panel.mjs';
import StateProvider           from '../../../src/state/Provider.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @summary Demonstrates hierarchical state management in a Neo.mjs application.
 *
 * This example demonstrates the hierarchical nature of the Neo.mjs StateProvider and is a key example
 * of the framework's **reactivity** and **data binding** system for **state management**.
 *
 * A StateProvider can be defined at any level of the component tree. When a component's `bind` config
 * requests a piece of data (e.g., `data.button1Text`), the framework will walk up the component tree
 * from that component, looking for a StateProvider that has the requested key in its `data` object.
 *
 * In this example:
 * 1. The top-level Viewport (`MainContainer`) has a stateProvider with `button1Text`.
 * 2. The nested Panel has its own stateProvider with `button2Text`.
 *
 * Components inside the Panel will find `button2Text` on their direct parent's provider, but will
 * have to traverse up to the MainContainer to find `button1Text`. This demonstrates how state can be
 * scoped locally or shared globally.
 *
 * The controller (`MainContainerController`) shows various methods for updating this hierarchical state.
 * @class Neo.examples.stateProvider.advanced.MainContainer
 * @extends Neo.container.Viewport
 * @see Neo.state.Provider
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.MainContainer'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.MainContainer',
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * The top-level StateProvider for this example.
         * It holds data properties that are available to all child components
         * unless overridden by a more deeply nested StateProvider.
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

            /**
             * A nested StateProvider scoped to this Panel and its children.
             * It holds the `button2Text` property. Components within this panel will find
             * `button2Text` here before traversing up to the MainContainer's provider.
             * @member {Object|Neo.state.Provider} stateProvider
             */
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
                    text : 'state.Provider: advanced'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',

                    /**
                     * This binding demonstrates accessing data from multiple state providers.
                     * `button1Text` is resolved from the top-level (MainContainer) provider.
                     * `button2Text` is resolved from the panel's provider.
                     * The framework handles the hierarchical lookup automatically.
                     * @member {Object} bind
                     */
                    bind: {
                        text: data => `Hello ${data.button2Text} ${1+2} ${data.button1Text + data.button2Text}`
                    }
                }, {
                    handler: 'onButton2Click',
                    iconCls: 'fa fa-user',
                    style  : {marginLeft: '10px'},

                    /**
                     * This binding demonstrates a simple transformation on the state data.
                     * `button2Text` is found in the panel's state provider.
                     * @member {Object} bind
                     */
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
