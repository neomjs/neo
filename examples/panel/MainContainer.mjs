import MainContainerController from './MainContainerController.mjs'
import Panel                   from '../../src/container/Panel.mjs';

/**
 * @class Neo.examples.panel.MainContainer
 * @extends Neo.container.Panel
 */
class MainContainer extends Panel {
    static config = {
        className : 'Neo.examples.panel.MainContainer',
        autoMount : true,
        controller: MainContainerController,

        itemDefaults: {
            style: {
                padding: '10px'
            }
        },

        style: {
            border: 0
        },

        headers: [{
            dock : 'top',
            style: {borderBottomColor: 'transparent'},

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
                iconCls: 'fa fa-user'
            }]
        }, {
            dock : 'left',
            style: {borderRightColor: 'transparent'},

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
            dock: 'bottom',
            style: {borderTopColor: 'transparent'},
            text: 'Title Bottom'
        }],

        items: [{
            ntype: 'panel',

            style: {
                borderBottom: 0,
                padding     : '10px'
            },

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
                style: {borderTopColor   : 'transparent'},

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
                dock: 'right',

                style: {
                    borderLeftColor  : 'transparent',
                    borderTopColor   : 'transparent'
                },

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
                style: {borderRightColor: 'transparent'},

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
    }
}

export default Neo.setupClass(MainContainer);
