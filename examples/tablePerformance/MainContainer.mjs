import Container      from '../../src/container/Base.mjs';
import NumberField    from '../../src/form/field/Number.mjs';
import TableContainer from '../../src/table/Container.mjs';

/**
 * @class Neo.examples.tablePerformance.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        className: 'Neo.examples.tablePerformance.MainContainer',

        layout: {
            ntype: 'vbox',
            align: 'stretch'
        },

        items: [{
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

            items: [{
                ntype: 'label',
                text : 'TableContainer App1',
                style: {
                    margin: '4px 10px 0 5px'
                }
            }, {
                ntype: 'component',
                flex : 5
            }, {
                ntype     : 'numberfield',
                clearable : false,
                labelText : 'Rows:',
                labelWidth: 50,
                maxValue  : 1500,
                minValue  : 1,
                reference : 'amount-rows-field',
                value     : 20,
                width     : 120
            }, {
                ntype     : 'numberfield',
                clearable : false,
                labelText : 'Interval:',
                labelWidth: 62,
                maxValue  : 5000,
                minValue  : 10,
                reference : 'interval-field',
                value     : 20,
                width     : 130
            }, {
                handler: 'up.updateTableViewData',
                iconCls: 'fa fa-sync-alt',
                text   : 'Refresh Data'
            }, {
                handler: 'up.updateTableViewData100x',
                iconCls: 'fa fa-sync-alt',
                style  : {margin: 0},
                text   : 'Refresh 100x'
            }]
        }, {
            module    : TableContainer,
            bodyConfig: {useRowRecordIds: false},
            reference : 'table',
            width     : '100%',

            columnDefaults: {
                renderer(data) {
                    return {
                        html : data.value,
                        style: {
                            backgroundColor: data.record[data.dataField + 'style']
                        }
                    }
                }
            },

            columns: [{
                text     : 'Dock Left 1',
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
            }, {
                text     : 'Header 6',
                dataField: 'column5'
            }, {
                text     : 'Header 7',
                dataField: 'column6'
            }, {
                text     : 'Header 8',
                dataField: 'column7'
            }, {
                text     : 'Header 9',
                dataField: 'column8'
            }, {
                text     : 'Dock Right 1',
                dataField: 'column9',
                dock     : 'right',
                width    : 200
            }]
        }]
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.updateTableViewData()
    }

    /**
     *
     */
    updateTableViewData() {
        let me        = this,
            table     = me.getReference('table'),
            columns   = table.headerToolbar.items.length,
            rows      = me.getReference('amount-rows-field').value,
            inputData = me.up('viewport').createRandomData(columns, rows);

        table.createViewData(inputData)
    }

    /**
     *
     */
    updateTableViewData100x() {
        let interval     = this.getReference('interval-field').value,
            maxRefreshes = 100,
            intervalId   = setInterval(() => {
                if (maxRefreshes < 1) {
                    clearInterval(intervalId);
                }

                this.updateTableViewData();
                maxRefreshes--
            }, interval)
    }
}

export default Neo.setupClass(MainContainer);
