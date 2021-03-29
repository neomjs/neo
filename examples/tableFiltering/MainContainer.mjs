import BooleanContainer from '../../src/filter/BooleanContainer.mjs';
import CellModel        from '../../src/selection/table/CellModel.mjs';
import CheckBox         from '../../src/form/field/CheckBox.mjs';
import DateContainer    from '../../src/filter/DateContainer.mjs';
import DateUtil         from '../../src/util/Date.mjs';
import MainStore        from './MainStore.mjs';
import NumberContainer  from '../../src/filter/NumberContainer.mjs';
import SelectField      from '../../src/form/field/Select.mjs';
import TableContainer   from '../../src/table/Container.mjs';
import Viewport         from '../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.tableFiltering.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.tableFiltering.MainContainer',
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
                dataField: 'firstname',
                text     : 'Firstname'
            }, {
                dataField: 'lastname',
                text     : 'Lastname'
            }, {
                dataField: 'country',
                text     : 'Country',

                editorConfig: {
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
                dataField   : 'luckyNumber',
                filterConfig: {operator: '==='},
                text        : 'Lucky Number',

                editorConfig: {
                    module: NumberContainer,

                    fieldConfig: {
                        maxValue: 10,
                        minValue: 1
                    }
                }
            }, {
                dataField   : 'specialDate',
                flex        : 2,
                filterConfig: {operator: '==='},
                renderer    : data => DateUtil.convertToyyyymmdd(data.value),
                text        : 'Special Date',

                editorConfig: {
                    module: DateContainer,

                    fieldConfig: {
                        matchPickerWidth: false
                    }
                }
            }, {
                dataField   : 'isOnline',
                filterConfig: {operator: '==='},
                renderer    : data => `<i class="fa fa-${data.value ? 'check' : 'times'}"></i>`,
                text        : 'Online',

                editorConfig: {
                    module: BooleanContainer
                }
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};