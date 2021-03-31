import MainContainerController from './MainContainerController.mjs'
import MainContainerModel      from './MainContainerModel.mjs'
import Panel                   from '../../../src/container/Panel.mjs';
import TextField               from '../../../src/form/field/Text.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.model.extendedClass.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.model.extendedClass.MainContainer'
         * @protected
         */
        className: 'Neo.examples.model.extendedClass.MainContainer',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount : true,
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         */
        controller: MainContainerController,
        /**
         * @member {Object|Neo.model.Component} model=MainContainerModel
         */
        model: MainContainerModel,
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
                    text : 'model.Component: extended class'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',

                    bind: {
                        text: 'button1Text'
                    }
                }, {
                    handler: 'onButton2Click',
                    iconCls: 'fa fa-user',
                    style  : {marginLeft: '10px'},

                    bind: {
                        text: 'button2Text'
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
                    value: 'button1Text'
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
                    value: 'button2Text'
                },

                listeners: {
                    change: 'onTextField2Change'
                }
            }, {
                ntype  : 'button',
                handler: 'onLogModelIntoConsoleButtonClick',
                style  : {marginTop: '2em'},
                text   : 'Log model into console'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};