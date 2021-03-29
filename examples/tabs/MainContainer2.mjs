import Container      from '../../src/container/Base.mjs';
import TableContainer from '../../src/table/Container.mjs';
import TabContainer   from '../../src/tab/Container.mjs';

/**
 * @class Neo.examples.tabs2.MainContainer2
 * @extends Neo.container.Base
 */
class MainContainer2 extends Container {
    static getConfig() {return {
        className: 'Neo.examples.tabs2.MainContainer2',
        autoMount: true,
        height   : 400,

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [{
            module     : TabContainer,
            activeIndex: 2,
            id         : 'myTabContainer',
            flex       : 10,

            itemDefaults: {
                ntype: 'component',
                flex : 10,
                style: {
                    padding: '10px'
                }
            },

            items: [{
                tabButtonConfig: {
                    iconCls: 'fa fa-home',
                    text   : 'Tab 1'
                },
                vdom: {
                    innerHTML: 'Tab Content 1'
                }
            }, {
                tabButtonConfig: {
                    iconCls: 'fa fa-play-circle',
                    text   : 'Tab 2'
                },
                vdom: {
                    innerHTML: 'Tab Content 2'
                }
            }, {
                ntype : 'container',
                layout: 'fit',
                style : {padding: '0px'},

                items: [{
                    module          : TableContainer,
                    amountRows      : 20,
                    createRandomData: true,

                    columnDefaults: {
                        renderer: function(data) {
                            return {
                                html : data.value,
                                style: {
                                    backgroundColor: data.record[data.dataField + 'style']
                                }
                            }
                        }
                    },

                    columns: [{
                        text     : 'Docked 1',
                        dataField: 'column0',
                        dock     : 'left',
                        width    : 200
                    }, {
                        text     : 'Header 2',
                        dataField: 'column1'
                    }, {
                        text     : 'Header 3',
                        dataField: 'column2'
                    }, {
                        text     : 'Header 4',
                        dataField: 'column3'
                    }, {
                        text     : 'Header 5',
                        dataField: 'column4'
                    }]
                }],

                tabButtonConfig: {
                    iconCls: 'fa fa-user',
                    text   : 'Tab 3'
                }
            }]
        },
        {
            ntype: 'toolbar',
            flex : '0 1 auto',

            itemDefaults: {
                ntype: 'button',
                style: {
                    margin: '0 10px 0 0'
                }
            },

            layout: {
                ntype: 'hbox'
            },

            style: {
                marginTop: '10px',
                padding  : 0
            },

            items: [{
                iconCls: 'fa fa-plus',
                text   : 'Insert Tab',
                handler: function () {
                    let tabContainer = Neo.getComponent('myTabContainer');

                    // global let for testing
                    if (!this.tabCount) {
                        this.tabCount = 0;
                    }

                    this.tabCount++;

                    tabContainer.insert(3, {
                        tabButtonConfig: {
                            iconCls: 'fa fa-user',
                            text   : 'Dynamic Tab ' + this.tabCount
                        },
                        vdom: {
                            innerHTML: 'Dynamic Tab ' + this.tabCount
                        }
                    });
                }
            }, {
                iconCls: 'fa fa-minus',
                text   : 'Remove Tab',
                handler: function () {
                    let tabContainer = Neo.getComponent('myTabContainer');

                    if (tabContainer.getCount() > 3) {
                        tabContainer.removeAt(3);
                    }
                }
            }, {
                ntype: 'component',
                flex : 10
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer2);

export {MainContainer2 as default};