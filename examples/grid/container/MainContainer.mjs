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
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-cellmodel',
            labelText     : 'selectionModel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellModel)},
            style         : {marginTop: '10px'},
            valueLabelText: 'Cell'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-columnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', ColumnModel)},
            valueLabelText: 'Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-rowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', RowModel)},
            valueLabelText: 'Row'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-cellcolumnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnModel)},
            valueLabelText: 'Cell & Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-cellrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellRowModel)},
            valueLabelText: 'Cell & Row'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-grid-cellcolumnrowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', CellColumnRowModel)},
            valueLabelText: 'Cell & Column & Row'
        }]
    }

    createExampleComponent() {
        return Neo.create(GridContainer, {
            selectionModel: CellModel,
            store         : MainStore,

            columnDefaults: {
                width: 200
            },

            columns: [
                {field: 'firstname', text: 'Firstname'},
                {field: 'lastname',  text: 'Lastname'},
                {field: 'githubId',  text: 'Github Id'},
                {field: 'country',   text: 'Country'}
            ]
        })
    }
}

export default Neo.setupClass(MainContainer);
