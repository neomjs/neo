import CellColumnModel            from '../../../src/selection/table/CellColumnModel.mjs';
import CellColumnRowModel         from '../../../src/selection/table/CellColumnRowModel.mjs';
import CellModel                  from '../../../src/selection/table/CellModel.mjs';
import CellRowModel               from '../../../src/selection/table/CellRowModel.mjs';
import CheckBox                   from '../../../src/form/field/CheckBox.mjs';
import CountryField               from '../../../src/form/field/Country.mjs';
import ConfigurationViewport      from '../../ConfigurationViewport.mjs';
import MainContainerStateProvider from './MainContainerStateProvider.mjs';
import MainStore                  from './MainStore.mjs';
import NumberField                from '../../../src/form/field/Number.mjs';
import Radio                      from '../../../src/form/field/Radio.mjs';
import TableContainer             from '../../../src/table/Container.mjs';

/**
 * @class Neo.examples.table.cellEditing.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.table.cellEditing.MainContainer',
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
        let me = this;

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
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-cellmodel',
            labelText     : 'selectionModel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellModel)},
            style         : {marginTop: '10px'},
            valueLabelText: 'Cell'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-cellcolumnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnModel)},
            valueLabelText: 'Cell & Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-cellrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellRowModel)},
            valueLabelText: 'Cell & Row'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-cellcolumnrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnRowModel)},
            valueLabelText: 'Cell & Column & Row'
        }, {
            module        : CheckBox,
            checked       : me.exampleComponent.sortable,
            hideLabel     : true,
            listeners     : {change: me.onConfigChange.bind(me, 'sortable')},
            style         : {marginTop: '10px'},
            valueLabelText: 'sortable'
        }, {
            module        : CheckBox,
            checked       : false, // we can not access the lazy-loaded plugin yet
            hideLabel     : true,
            listeners     : {change: me.onPluginConfigChange.bind(me, 'disabled')},
            style         : {marginTop: '10px'},
            valueLabelText: 'Disable CellEditing'
        }]
    }

    /**
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module        : TableContainer,
            bind          : {store : 'stores.mainStore'},
            cellEditing   : true,
            parentId      : this.id,
            selectionModel: CellModel,
            store         : MainStore,

            columnDefaults: {
                editable: true
            },

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {
                    dataField: 'githubId',
                    editable : false,
                    text     : 'Github Id (Non-editable)'
                }, {
                    dataField: 'country',
                    renderer : 'up.countryRenderer',
                    text     : 'Country',

                    // Use a custom editor field
                    editor: {
                        module        : CountryField,
                        bind          : {store: 'stores.countries'},
                        clearable     : false,
                        forceSelection: true,
                        valueField    : 'code'
                    }
                }
            ]
        }
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onPluginConfigChange(config, opts) {
        this.exampleComponent.getPlugin('table-cell-editing')[config] = opts.value
    }
}

export default Neo.setupClass(MainContainer);
