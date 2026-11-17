import CellColumnModel            from '../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel         from '../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel                  from '../../../src/selection/grid/CellModel.mjs';
import CellRowModel               from '../../../src/selection/grid/CellRowModel.mjs';
import CheckBox                   from '../../../src/form/field/CheckBox.mjs';
import CountryField               from '../../../src/form/field/Country.mjs';
import ConfigurationViewport      from '../../ConfigurationViewport.mjs';
import DateField                  from '../../../src/form/field/Date.mjs';
import GridContainer              from '../../../src/grid/Container.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import MainStore                  from './MainStore.mjs';
import NumberField                from '../../../src/form/field/Number.mjs';
import Radio                      from '../../../src/form/field/Radio.mjs';

/**
 * @class Neo.examples.grid.cellEditing.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.grid.cellEditing.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configPanelFlex     : 1.5,
        exampleComponentFlex: 3,
        layout              : {ntype: 'hbox', align: 'stretch'},
        stateProvider       : MainContainerStateProvider
    }

    /**
     * @param {Object} data
     */
    countryRenderer({record}) {
        let countryStore = this.getStateProvider().getStore('countries');

        if (countryStore.getCount() > 0) {
            return countryStore.get(record.country).name
        }

        return ''
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me               = this,
            {selectionModel} = me.exampleComponent.view;

        const selectionModelRadioDefaults = {
            module        : Radio,
            hideValueLabel: false,
            labelText     : '',
            name          : 'selectionModel',
            width         : 350
        };

        return [{
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 225,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            ...selectionModelRadioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellmodel',
            labelText : 'selectionModel',
            listeners : {change: me.onRadioViewChange.bind(me, 'selectionModel', CellModel)},
            style     : {marginTop: '10px'},
            valueLabel: 'Cell'
        }, {
            ...selectionModelRadioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellcolumnmodel',
            listeners : {change: me.onRadioViewChange.bind(me, 'selectionModel', CellColumnModel)},
            valueLabel: 'Cell & Column'
        }, {
            ...selectionModelRadioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellrowmodel',
            listeners : {change: me.onRadioViewChange.bind(me, 'selectionModel', CellRowModel)},
            valueLabel: 'Cell & Row'
        }, {
            ...selectionModelRadioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellcolumnrowmodel',
            listeners : {change: me.onRadioViewChange.bind(me, 'selectionModel', CellColumnRowModel)},
            valueLabel: 'Cell & Column & Row'
        }, {
            module    : CheckBox,
            checked   : me.exampleComponent.dragResortable,
            hideLabel : true,
            listeners : {change: me.onConfigChange.bind(me, 'dragResortable')},
            style     : {marginTop: '10px'},
            valueLabel: 'dragResortable'
        }, {
            module    : CheckBox,
            checked   : false, // we can not access the lazy-loaded plugin yet
            hideLabel : true,
            listeners : {change: me.onPluginConfigChange.bind(me, 'disabled')},
            style     : {marginTop: '10px'},
            valueLabel: 'Disable CellEditing'
        }]
    }

    /**
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module      : GridContainer,
            bind        : {store: 'stores.mainStore'},
            cellEditing : true,
            parentId    : this.id,
            store       : MainStore,
            wrapperStyle: {maxWidth: '1002px'},

            viewConfig: {
                selectionModel: CellModel
            },

            columnDefaults: {
                editable: true
            },

            // An order sheet: the order number, price and line total are read-only, the rest is a typed editor
            columns: [{
                dataField: 'orderId',
                editable : false,
                text     : 'Order',
                width    : 100
            }, {
                dataField: 'item',
                text     : 'Item',
                // Order, Item and Quantity fit a phone's 390px together
                width    : 150
            }, {
                cellAlign: 'right',
                dataField: 'quantity',
                text     : 'Quantity',
                width    : 100,

                // A quantity above 50 is refused: the editor shows its error and stays open
                editor: {
                    module           : NumberField,
                    clearable        : false,
                    errorTextMaxValue: ({maxValue}) => `At most ${maxValue}`,
                    maxValue         : 50,
                    minValue         : 1
                }
            }, {
                cellAlign: 'right',
                dataField: 'unitPrice',
                editable : false,
                text     : 'Unit price',
                type     : 'currency',
                width    : 110
            }, {
                cellAlign: 'right',
                dataField: 'total',
                editable : false,
                text     : 'Line total',
                type     : 'currency',
                width    : 120
            }, {
                dataField: 'delivery',
                renderer : ({value}) => value ? new Intl.DateTimeFormat('default').format(value) : '',
                text     : 'Delivery',
                width    : 130,

                editor: {
                    module   : DateField,
                    clearable: false,
                    maxValue : '2027-01-31',
                    minValue : '2026-12-01'
                }
            }, {
                dataField: 'country',
                renderer : 'up.countryRenderer',
                text     : 'Ships to',
                width    : 170,

                editor: {
                    module        : CountryField,
                    bind          : {store: 'stores.countries'},
                    clearable     : false,
                    forceSelection: true,
                    valueField    : 'code'
                }
            }]
        }
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onPluginConfigChange(config, opts) {
        this.exampleComponent.getPlugin('grid-cell-editing')[config] = opts.value
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioViewChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.exampleComponent.view[config] = value
        }
    }
}

export default Neo.setupClass(MainContainer);
