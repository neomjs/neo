import CellModel                from '../../src/selection/table/CellModel.mjs';
import CheckBox                 from '../../src/form/field/CheckBox.mjs';
import {default as DateField}   from '../../src/form/field/Date.mjs';
import DateUtil                 from '../../src/util/Date.mjs';
import MainStore                from './MainStore.mjs';
import {default as SelectField} from '../../src/form/field/Select.mjs';
import TableContainer           from '../../src/table/Container.mjs';
import Viewport                 from '../../src/container/Viewport.mjs';

/**
 * @class TableFiltering.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'TableFiltering.MainContainer',
        ntype    : 'main-container',

        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '20px'},

        items: [{
            ntype: 'toolbar',
            flex : '0 1 auto',
            style: {marginBottom: '5px', padding: 0},

            items: [{
                ntype: 'label',
                style: {margin: '4px 10px 0 5px'},
                text : 'Table Filtering Demo'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                module        : CheckBox,
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                valueLabelText: 'Show Filters',

                listeners: {
                    change: function(opts) {
                        Neo.getComponent('myTableFilterContainer').showHeaderFilters = opts.value;
                    }
                }
            }]
        }, {
            module           : TableContainer,
            id               : 'myTableFilterContainer',
            selectionModel   : CellModel,
            showHeaderFilters: true,
            store            : MainStore,
            width            : '100%',
            wrapperStyle     : {height: '300px'},

            columns: [{
                text     : 'Firstname',
                dataField: 'firstname'
            }, {
                text     : 'Lastname',
                dataField: 'lastname'
            }, {
                text     : 'Country',
                dataField: 'country',

                editorFieldConfig: {
                    module: SelectField,

                    store: {
                        autoLoad   : true,
                        keyProperty: 'name',
                        url        : '../../resources/examples/data/countries.json',

                        model: {
                            fields: [{
                                name: 'code',
                                type: 'String'
                            }, {
                                name: 'name',
                                type: 'String'
                            }]
                        }
                    }
                }
            }, {
                text        : 'Special Date',
                dataField   : 'specialDate',
                filterConfig: {operator: '==='},
                renderer    : data => DateUtil.convertToyyyymmdd(data.value),

                editorFieldConfig: {
                    module: DateField
                }
            }, {
                text        : 'Online',
                dataField   : 'isOnline',
                filterConfig: {operator: '==='},
                renderer    : data => `<i class="fa fa-${data.value ? 'check' : 'times'}"></i>`,

                editorFieldConfig: {
                    module: CheckBox,

                    style: { // todo => scss
                        alignItems    : 'center',
                        display       : 'flex',
                        height        : '37px',
                        justifyContent: 'start',
                        marginLeft    : '5px'
                    }
                }
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};