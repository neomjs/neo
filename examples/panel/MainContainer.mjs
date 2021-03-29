import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../src/container/Panel.mjs';

/**
 * @class Neo.examples.panel.MainContainer
 * @extends Neo.container.Panel
 */
class MainContainer extends Panel {
    static getConfig() {return {
        className : 'Neo.examples.panel.MainContainer',
        autoMount : true,
        controller: MainContainerController,

        itemDefaults: {
            style: {
                padding: '10px'
            }
        },

        style: {
            backgroundColor: '#2b2b2b'
        },

        headers: [{
            dock : 'top',
            items: [{
                ntype: 'label',
                text : 'Title Top'
            }, {
                handler: 'onButton1Click',
                iconCls: 'fa fa-home',
                text   : 'Button 1'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                handler: 'onButton2Click',
                iconCls: 'fa fa-user',
                text   : 'Button 2'
            }]
        }, {
            dock : 'left',
            items: [{
                ntype: 'label',
                text : 'Title Left'
            }, {
                iconCls: 'fa fa-home',
                text   : 'Button 3'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                iconCls: 'fa fa-user',
                text   : 'Button 4'
            }]
        }, {
            text: 'Title Bottom',
            dock: 'bottom'
        }],

        items: [{
            ntype : 'panel',

            itemDefaults: {
                style: {
                    padding: '10px'
                }
            },

            headers: [{
                text: 'Title Top',
                dock: 'top'
            }, {
                dock : 'right',
                items: [{
                    ntype: 'label',
                    text : 'Title Right 2'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    iconCls: 'fa fa-user',
                    text   : 'Button 5'
                }]
            }, {
                dock : 'right',
                items: [{
                    ntype: 'label',
                    text : 'Title Right'
                }, {
                    iconCls: 'fa fa-home',
                    text   : 'Button 6'
                }]
            }],

            items: [{
                ntype: 'component',
                vdom : {
                    innerHTML: 'item 1'
                }
            }]
        }, {
            ntype               : 'panel',
            verticalHeadersFirst: true,

            itemDefaults: {
                style: {
                    padding: '10px'
                }
            },

            headers: [{
                dock : 'top',
                items: [{
                    iconCls: 'fa fa-home',
                    text   : 'Button 7'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    ntype: 'label',
                    text : 'Title Top'
                }]
            }, {
                dock : 'right',
                items: [{
                    iconCls: 'fa fa-home',
                    text   : 'Button 8'
                }, {
                    ntype: 'component',
                    flex : 1
                }, {
                    ntype: 'label',
                    text : 'Title Right'
                }]
            }],

            items: [{
                ntype: 'component',
                vdom : {
                    innerHTML: 'item 2'
                }
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};