import CellColumnModel       from '../../../src/selection/table/CellColumnModel.mjs';
import CellColumnRowModel    from '../../../src/selection/table/CellColumnRowModel.mjs';
import CellModel             from '../../../src/selection/table/CellModel.mjs';
import CellRowModel          from '../../../src/selection/table/CellRowModel.mjs';
import Checkbox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TableContainer        from '../../../src/table/Container.mjs';

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
            module   : Checkbox,
            checked  : me.exampleComponent.sortable,
            labelText: 'sortable',
            listeners: {change: me.onConfigChange.bind(me, 'sortable')},
            style    : {marginTop: '10px'}
        }, {
            module   : Checkbox,
            checked  : false,
            labelText: 'Fit width',
            listeners: {
                change({ value }) {
                    const { style } = me.exampleComponent;

                    if (value) {
                        style.width = '100%';
                        style.tableLayout = 'fixed';
                    } else {
                        style.width = '';
                        style.tableLayout = '';
                    }

                    me.exampleComponent.style = style;
                    me.exampleComponent.update();
                }
            },
            style: {marginTop: '10px'}
        }]
    }

    /**
     * @returns {Neo.table.Container}
     */
    createExampleComponent() {
        return Neo.create(TableContainer, {
            cellEditing   : true,
            selectionModel: CellModel,
            store         : MainStore,

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'githubId',  text: 'Github Id'},
                {dataField: 'country',   text: 'Country'}
            ]
        })
    }
}

export default Neo.setupClass(MainContainer);
