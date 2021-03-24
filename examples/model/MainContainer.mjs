import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../src/container/Panel.mjs';
import TextField               from '../../src/form/field/Text.mjs';
import Viewport                from '../../src/container/Viewport.mjs';

/**
 * @class ComponentModelExample.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount : true,
        controller: MainContainerController,

        style: {
            padding: '20px'
        },

        items: [{
            module: Panel,

            containerConfig: {
                style: {
                    padding: '20px'
                }
            },

            headers: [{
                dock : 'top',
                items: [{
                    ntype: 'label',
                    text : 'Title Top'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-home',
                    text   : 'Button 1'
                }, {
                    handler: 'onButton1Click',
                    iconCls: 'fa fa-user',
                    style  : {marginLeft: '10px'},
                    text   : 'Button 2'
                }]
            }],

            items: [{
                module    : TextField,
                flex      : 'none',
                labelText : 'Button1 Text:',
                labelWidth: 110,
                maxWidth  : 300,
                value     : 'Button1'
            }, {
                module    : TextField,
                flex      : 'none',
                labelText : 'Button2 Text:',
                labelWidth: 110,
                maxWidth  : 300,
                value     : 'Button2'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};