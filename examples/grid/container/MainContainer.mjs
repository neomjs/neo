import CellColumnModel       from '../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel    from '../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel             from '../../../src/selection/grid/CellModel.mjs';
import CellRowModel          from '../../../src/selection/grid/CellRowModel.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import ColumnModel           from '../../../src/selection/grid/ColumnModel.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import RowModel              from '../../../src/selection/grid/RowModel.mjs';

/**
 * @class Neo.examples.grid.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.grid.container.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configPanelFlex     : 1.5,
        exampleComponentFlex: 3,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me     = this,
            {view} = me.exampleComponent;

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
            checked       : view.selectionModel.ntype === 'selection-grid-cellmodel',
            labelText     : 'selectionModel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellModel)},
            style         : {marginTop: '10px'},
            valueLabelText: 'Cell'
        }, {
            ...selectionModelRadioDefaults,
            checked       : view.selectionModel.ntype === 'selection-grid-columnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', ColumnModel)},
            valueLabelText: 'Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : view.selectionModel.ntype === 'selection-grid-rowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', RowModel)},
            valueLabelText: 'Row'
        }, {
            ...selectionModelRadioDefaults,
            checked       : view.selectionModel.ntype === 'selection-grid-cellcolumnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnModel)},
            valueLabelText: 'Cell & Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : view.selectionModel.ntype === 'selection-grid-cellrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellRowModel)},
            valueLabelText: 'Cell & Row'
        }, {
            ...selectionModelRadioDefaults,
            checked       : view.selectionModel.ntype === 'selection-grid-cellcolumnrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnRowModel)},
            valueLabelText: 'Cell & Column & Row'
        }]
    }

    createExampleComponent() {
        return {
            module: GridContainer,
            store : MainStore,

            columnDefaults: {
                width: 200
            },

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'githubId',  text: 'Github Id'},
                {dataField: 'country',   text: 'Country'}
            ],

            viewConfig: {
                selectionModel: CellModel
            },

            wrapperStyle: {
                height: '500px'
            }
        }
    }

    /**
     * @param {String} config
     * @param {String} value
     * @param {Object} opts
     */
    onRadioChange(config, value, opts) {
        if (opts.value === true) { // we only want to listen to check events, not uncheck
            this.exampleComponent.view[config] = value
        }
    }
}

export default Neo.setupClass(MainContainer);
