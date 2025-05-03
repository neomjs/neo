import CheckBox                 from '../../../src/form/field/CheckBox.mjs';
import Container                from '../../../src/container/Base.mjs';
import HistoricalDataTable      from './country/HistoricalDataTable.mjs';
import LineChartComponent       from './country/LineChartComponent.mjs'
import Panel                    from '../../../src/container/Panel.mjs';
import TabContainer             from '../../../src/tab/Container.mjs';
import Table                    from './country/Table.mjs';
import TableContainerController from './TableContainerController.mjs';

/**
 * @class SharedCovid.view.TableContainer
 * @extends Neo.container.Base
 */
class TableContainer extends Container {
    static config = {
        /**
         * @member {String} className='SharedCovid.view.TableContainer'
         * @protected
         */
        className: 'SharedCovid.view.TableContainer',
        /**
         * @member {Object} bind
         */
        bind: {
            countryRecord: data => data.countryRecord
        },
        /**
         * @member {Neo.controller.Component|null} controller=TableContainerController
         */
        controller: TableContainerController,
        /**
         * @member {Object} countryRecord_=null
         */
        countryRecord_: null,
        /**
         * @member {Number} historyPanelWidth=520
         * @protected
         */
        historyPanelWidth: 520,
        /**
         * @member {Neo.table.Container|null} table=null
         */
        table: null,
        /**
         * @member {Object|null} tableConfig=null
         */
        tableConfig: null,
        /**
         * @member {Object|null} layout={ntype: 'hbox', align: 'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]|null} items
         */
        items: [{
            ntype : 'container',
            flex  : 1,
            layout: 'fit',
            items : []
        }, {
            module   : Panel,
            cls      : ['neo-configuration-panel', 'neo-panel', 'neo-container'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'controls-panel',
            style    : {backgroundColor: '#2b2b2b'},
            width    : '@config:historyPanelWidth',

            containerConfig: {
                flex : null,
                style: {overflowY: 'scroll'}
            },

            headers: [{
                dock     : 'top',
                reference: 'controls-panel-header',

                items: [{
                    ntype  : 'button',
                    handler: 'onCollapseButtonClick',
                    text   : 'X'
                }, {
                    ntype    : 'label',
                    reference: 'historical-data-label',
                    text     : 'Historical Data'
                }, '->', {
                    ntype  : 'button',
                    handler: 'on520pxButtonClick',
                    height : 24,
                    text   : '520px'
                }, {
                    ntype  : 'button',
                    handler: 'on800pxButtonClick',
                    height : 24,
                    text   : '800px'
                }, {
                    ntype  : 'button',
                    handler: 'onWindowChartMaximizeButtonClick',
                    iconCls: 'far fa-window-maximize'
                }]
            }],

            items: [{
                module: TabContainer,
                style : {marginTop: '10px'},
                items : [{
                    ntype : 'container',
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [{
                        ntype: 'toolbar',
                        flex : '0 1 auto',
                        items: [{
                            module    : CheckBox,
                            checked   : true,
                            labelText : 'Logarithmic Scale',
                            labelWidth: 135,
                            reference : 'logarithmic-scale-checkbox',
                            listeners : {
                                change: 'onLogarithmicScaleChange'
                            }
                        }, {
                            module    : CheckBox,
                            labelText : 'Daily Values',
                            style     : {marginLeft: '30px'},
                            labelWidth: 95,
                            listeners : {
                                change: 'onDailyValuesChange'
                            }
                        }]
                    }, {
                        module   : LineChartComponent,
                        flex     : 1,
                        reference: 'line-chart',
                    }],

                    header: {
                        iconCls: 'fa fa-chart-line',
                        text   : 'Chart'
                    }
                }]
            }]
        }]
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.historicalDataTable = Neo.create({
            module   : HistoricalDataTable,
            appName  : me.appName,
            parentId : me.id,
            reference: 'historical-data-table',
            windowId : me.windowId,

            header: {
                iconCls: 'fa fa-table',
                text   : 'Table'
            },

            ...me.historicalDataTableConfig
        });

        me.items[1].items[0].items.push(me.historicalDataTable);

        me.table = Neo.create({
            module   : Table,
            appName  : me.appName,
            parentId : me.id,
            reference: 'table',
            windowId : me.windowId,
            ...me.tableConfig
        });

        me.items[0].items.push(me.table)
    }

    /**
     * Triggered after the countryRecord config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetCountryRecord(value, oldValue) {
        let me = this;

        me.timeout(me.isConstructed ? 0 : 50).then(() => {
            me.controller.onCountryChange(value)
        })
    }

    /**
     *
     */
    storeReferences() {
        this.controller.storeReferences()
    }
}

export default Neo.setupClass(TableContainer);
