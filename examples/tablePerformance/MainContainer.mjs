import {default as Container}      from '../../src/container/Base.mjs';
import {default as NumberField}    from '../../src/form/field/Number.mjs';
import {default as TableContainer} from '../../src/table/Container.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

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
                        text : 'TableContainer App1',
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
                        id        : 'amountRows',
                        labelText : 'Rows:',
                        labelWidth: 50,
                        maxValue  : 1500,
                        minValue  : 1,
                        value     : 20,
                        width     : 120
                    },
                    {
                        ntype     : 'numberfield',
                        clearable : false,
                        id        : 'interval',
                        labelText : 'Interval:',
                        labelWidth: 62,
                        maxValue  : 5000,
                        minValue  : 10,
                        value     : 20,
                        width     : 130
                    },
                    {
                        iconCls     : 'fa fa-sync-alt',
                        text        : 'Refresh Data',
                        domListeners: {
                            click: {
                                fn: function () {
                                    let rows = Neo.getComponent('amountRows').value;
                                    Neo.getComponent('myTableContainer').createRandomViewData(rows);
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
                                    let interval    = Neo.getComponent('interval').value,
                                        rows        = Neo.getComponent('amountRows').value,
                                        maxRefreshs = 100,
                                        intervalId  = setInterval(function () {
                                            if (maxRefreshs < 1) {
                                                clearInterval(intervalId);
                                            }

                                            Neo.getComponent('myTableContainer').createRandomViewData(rows);
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
                id        : 'myTableContainer',
                amountRows: 20, // testing var
                width     : '100%',

                wrapperStyle: {
                    height: '300px'
                },

                columnDefaults: {
                    renderer: function(value, record, dataField) {
                        return {
                            html : value,
                            style: {
                                backgroundColor: record[dataField + 'style']
                            }
                        }
                    }
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
                        text     : 'Header 9',
                        dataField: 'column8'
                    },
                    {
                        text     : 'Dock Right 1',
                        dataField: 'column9',
                        dock     : 'right',
                        width    : 200
                    }
                ]
            }
        ]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};