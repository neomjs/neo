import TabContainer from '../../src/tab/Container.mjs';
import Viewport     from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.viewport.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.viewport.MainContainer',
        autoMount: true,

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        style: {
            padding: '50px'
        },

        itemDefaults: {
            ntype : 'container',
            layout: {
                ntype: 'hbox',
                align: 'stretch'
            },

            itemDefaults: {
                module: TabContainer,
                style : {
                    margin: '50px'
                },

                itemDefaults: {
                    ntype: 'component',
                    style: {
                        padding: '20px'
                    }
                },

                items: [{
                    ntype: 'toolbar',

                    itemDefaults: {
                        domListeners: {
                            click: {
                                fn: data => {
                                    let button       = Neo.getComponent(data.target.id),
                                        tabContainer = button.up('tab-container');

                                    tabContainer.tabBarPosition = button.text.toLowerCase();
                                }
                            }
                        }
                    },

                    items: [{
                        ntype: 'button',
                        text : 'Top'
                    }, {
                        ntype: 'button',
                        text : 'Right'
                    }, {
                        ntype: 'button',
                        text : 'Bottom'
                    }, {
                        ntype: 'button',
                        text : 'Left'
                    }],

                    tabButtonConfig: {
                        iconCls: 'fa fa-home',
                        text   : 'Tab 1'
                    }
                }, {
                    tabButtonConfig: {
                        iconCls: 'fa fa-play-circle',
                        text   : 'Tab 2'
                    },
                    vdom: {
                        innerHTML: 'Test 2'
                    }
                }, {
                    tabButtonConfig: {
                        iconCls: 'fa fa-user',
                        text   : 'Tab 3'
                    },
                    vdom: {
                        innerHTML: 'Test 3'
                    }
                }]
            },
        },

        items: [{
            items: [{

                }, {
                    tabBarPosition: 'right'
                }
            ]
        }, {
            items: [{
                tabBarPosition: 'bottom'
            }, {
                tabBarPosition: 'left'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
