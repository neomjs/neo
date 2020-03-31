import {default as Container}      from '../../src/container/Base.mjs';
import {default as TableContainer} from '../../src/table/Container.mjs';

/**
 * @class TestApp2.MainContainer2
 * @extends Neo.container.Base
 */
class MainContainer2 extends Container {
    static getConfig() {return {
        className: 'TestApp2.MainContainer2',
        ntype    : 'main-container2',

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
                        text : 'TableContainer App2',
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
                        id        : 'amountRows2',
                        labelText : 'Rows:',
                        labelWidth: 50,
                        maxValue  : 1500,
                        minValue  : 1,
                        value     : 50,
                        width     : 120
                    },
                    {
                        ntype     : 'numberfield',
                        clearable : false,
                        id        : 'interval2',
                        labelText : 'Interval:',
                        labelWidth: 62,
                        maxValue  : 5000,
                        minValue  : 10,
                        value     : 30,
                        width     : 130
                    },
                    {
                        iconCls     : 'fa fa-sync-alt',
                        text        : 'Refresh Data',
                        domListeners: {
                            click: {
                                fn: function () {
                                    let rows = Neo.getComponent('amountRows2').value;
                                    Neo.getComponent('myTableContainer2').createRandomViewData(rows);
                                }
                            }
                        }
                    },
                    {
                        iconCls     : 'fa fa-sync-alt',
                        style       : {margin:0},
                        text        : 'Refresh 100x',
                        domListeners: {
                            click: {
                                fn: function () {
                                    let interval = Neo.getComponent('interval2').value,
                                        rows     = Neo.getComponent('amountRows2').value,
                                        maxRefreshs = 100,
                                        intervalId = setInterval(function(){
                                            if (maxRefreshs < 1) {
                                                clearInterval(intervalId);
                                            }

                                            Neo.getComponent('myTableContainer2').createRandomViewData(rows);
                                            maxRefreshs--;
                                        }, interval);
                                }
                            }
                        }
                    }
                ]
            },
            {
                ntype     : 'table-container',
                id        : 'myTableContainer2',
                amountRows: 50, // testing var
                width     : '100%',

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
                        text     : 'Dock Left 2',
                        dataField: 'column1',
                        dock     : 'left',
                        width    : 200
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
                        text     : 'Header 9',
                        dataField: 'column8'
                    },
                    {
                        text     : 'Header 10',
                        dataField: 'column9'
                    }
                ]
            }
        ]
    }}
}

Neo.applyClassConfig(MainContainer2);

export {MainContainer2 as default};