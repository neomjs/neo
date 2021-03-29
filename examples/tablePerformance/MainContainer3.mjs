import Container      from '../../src/container/Base.mjs';
import TableContainer from '../../src/table/Container.mjs';

/**
 * @class Neo.examples.tablePerformance3.MainContainer3
 * @extends Neo.container.Base
 */
class MainContainer3 extends Container {
    static getConfig() {return {
        className: 'Neo.examples.tablePerformance3.MainContainer3',
        autoMount: true,

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [
            {
                ntype: 'toolbar',
                flex : '0 1 auto',

                itemDefaults: {
                    ntype: 'button',
                    style: {
                        margin: '0 10px 0 0'
                    }
                },

                style: {
                    marginBottom: '10px',
                    padding     : 0
                },

                items: [
                    {
                        ntype: 'label',
                        text : 'TableContainer App3 (Default Scollbars)',
                        style: {
                            margin: '4px 10px 0 5px'
                        }
                    },
                    {
                        ntype: 'component',
                        flex : 5
                    },
                    {
                        ntype     : 'numberfield',
                        clearable : false,
                        id        : 'amountRows3',
                        labelText : 'Rows:',
                        labelWidth: 50,
                        maxValue  : 1500,
                        minValue  : 1,
                        value     : 100,
                        width     : 120
                    },
                    {
                        ntype     : 'numberfield',
                        clearable : false,
                        id        : 'interval3',
                        labelText : 'Interval:',
                        labelWidth: 62,
                        maxValue  : 5000,
                        minValue  : 10,
                        value     : 50,
                        width     : 130
                    },
                    {
                        iconCls     : 'fa fa-sync-alt',
                        text        : 'Refresh Data',
                        domListeners: {
                            click: {
                                fn: function () {
                                    let rows = Neo.getComponent('amountRows3').value;
                                    Neo.getComponent('myTableContainer3').createRandomViewData(rows);
                                }
                            }
                        }
                    },
                    {
                        iconCls     : 'fa fa-sync-alt',
                        text        : 'Refresh 100x',
                        style       : {margin:0},
                        domListeners: {
                            click: {
                                fn: function () {
                                    let interval = Neo.getComponent('interval3').value,
                                        rows     = Neo.getComponent('amountRows3').value,
                                        maxRefreshs = 100,
                                        intervalId = setInterval(function(){
                                            if (maxRefreshs < 1) {
                                                clearInterval(intervalId);
                                            }

                                            Neo.getComponent('myTableContainer3').createRandomViewData(rows);
                                            maxRefreshs--;
                                        }, interval);
                                }
                            }
                        }
                    }
                ]
            },
            {
                ntype              : 'table-container',
                id                 : 'myTableContainer3',
                amountRows         : 100, // testing var
                createRandomData   : true,
                useCustomScrollbars: false,
                width              : '100%',

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

                wrapperStyle: {
                    height: '300px'
                },

                columns: [
                    {
                        text     : 'Dock Left 1',
                        dataField: 'column0',
                        dock     : 'left',
                        width    : 200
                    },
                    {
                        text     : 'Header 2',
                        dataField: 'column1'
                    },
                    {
                        text     : 'Header 3',
                        dataField: 'column2'
                    },
                    {
                        text     : 'Header 4',
                        dataField: 'column3'
                    },
                    {
                        text     : 'Header 5',
                        dataField: 'column4'
                    },
                    {
                        text     : 'Header 6',
                        dataField: 'column5'
                    },
                    {
                        text     : 'Header 7',
                        dataField: 'column6'
                    },
                    {
                        text     : 'Header 8',
                        dataField: 'column7'
                    },
                    {
                        text     : 'Dock Right 1',
                        dataField: 'column8',
                        dock     : 'right',
                        width    : 200
                    },
                    {
                        text     : 'Dock Right 2',
                        dataField: 'column9',
                        dock     : 'right',
                        width    : 200
                    }
                ]
            }
        ]
    }}
}

Neo.applyClassConfig(MainContainer3);

export {MainContainer3 as default};