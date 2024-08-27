import Button                from '../../../src/button/Base.mjs';
import CellColumnModel       from '../../../src/selection/table/CellColumnModel.mjs';
import CellColumnRowModel    from '../../../src/selection/table/CellColumnRowModel.mjs';
import CellModel             from '../../../src/selection/table/CellModel.mjs';
import CellRowModel          from '../../../src/selection/table/CellRowModel.mjs';
import Checkbox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import ColumnModel           from '../../../src/selection/table/ColumnModel.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import RowModel              from '../../../src/selection/table/RowModel.mjs';
import TableContainer        from '../../../src/table/Container.mjs';

/**
 * @class Neo.examples.table.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.table.container.MainContainer',
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
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-columnmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', ColumnModel)},
            valueLabelText: 'Column'
        }, {
            ...selectionModelRadioDefaults,
            checked       : me.exampleComponent.selectionModel.ntype === 'selection-table-rowmodel',
            listeners     : {change: me.onRadioChange.bind(me, 'selectionModel', RowModel)},
            valueLabelText: 'Row'
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
            id            : 'myTableStoreContainer',
            selectionModel: CellModel,
            store         : MainStore,

            columns: [
                {dataField: 'firstname', text: 'Firstname'},
                {dataField: 'lastname',  text: 'Lastname'},
                {dataField: 'githubId',  text: 'Github Id'},
                {dataField: 'country',   text: 'Country'},
                {
                    dataField: 'edit',
                    text     : 'Edit Action',
                    renderer: ({ column, index }) => {
                        const
                            widgetId = `${column.id}-widget-${index}`,
                            button = (column.widgetMap || (column.widgetMap = {}))[widgetId] || (column.widgetMap[widgetId] = Neo.create({
                                module  : Button,
                                appName : this.appName,
                                handler : this.editButtonHandler,
                                parentId: 'myTableStoreContainer',
                                text    : 'Edit'
                            }));

                        return button.vdom
                    }
                },
                {
                    dataField: 'menu',
                    text     : 'Menu',
                    renderer({ column, record, index }) {
                        const
                            widgetId = `${column.id}-widget-${index}`,
                            button = (column.widgetMap || (column.widgetMap = {}))[widgetId] || (column.widgetMap[widgetId] = Neo.create('Neo.button.Base', {
                                ntype   : 'button',
                                appName : this.appName,
                                text    : '\u22ee',
                                windowId: this.windowId,
                                menu    : {
                                    items : [{
                                        text : 'Menu option 1'
                                    }, {
                                        text : 'Menu option 2'
                                    }, {
                                        text : 'Menu option 3'
                                    }, {
                                        text : 'Menu option 4'
                                    }]
                                }
                            }));

                            return button.vdom
                    }
                }
            ]
        })
    }

    /**
     * @param {Object} data
     */
    editButtonHandler(data) {
        console.log(data)
    }
}

export default Neo.setupClass(MainContainer);
