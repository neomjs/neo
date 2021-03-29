import CellColumnModel from '../../src/selection/table/CellColumnModel.mjs';
import CellModel       from '../../src/selection/table/CellModel.mjs';
import CellRowModel    from '../../src/selection/table/CellRowModel.mjs';
import ColumnModel     from '../../src/selection/table/ColumnModel.mjs';
import MainStore       from './MainStore.mjs';
import Radio           from '../../src/form/field/Radio.mjs';
import RowModel        from '../../src/selection/table/RowModel.mjs';
import TableContainer  from '../../src/table/Container.mjs';
import Viewport        from '../../src/container/Viewport.mjs';

/**
 * @class  Neo.examples.tableStore.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: ' Neo.examples.tableStore.MainContainer',
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
                text : 'Table & Store (Click or Drag Table Headers)'
            }, {
                ntype: 'component',
                flex : 1
            }, {
                ntype  : 'button',
                iconCls: 'fa fa-edit',
                style  : {marginRight: '10px'},
                text   : 'Change Cell Value',
                handler: function () {
                    let tabContainer = Neo.getComponent('myTableStoreContainer'),
                        store        = tabContainer.store,
                        record       = store.items[0];

                    record.firstname = record.firstname + '<span style="color:red;"> Foo</span>';
                }
            }, {
                ntype  : 'button',
                iconCls: 'fa fa-edit',
                style  : {marginRight: '10px'},
                text   : 'Update all cells 100x',
                handler: function () {
                    let tabContainer = Neo.getComponent('myTableStoreContainer'),
                        store        = tabContainer.store,
                        countRecords = store.getCount(),
                        j            = 0,
                        repeats      = 100,
                        string1      = '<span style="color:red;">Foo</span> ',
                        string2      = '<span style="color:blue;">Bar</span> ',
                        i, newValue, record;

                    for (; j < repeats; j++) {
                        for (i=0; i < countRecords; i++) {
                            record = store.items[i];
                            Object.entries(record).forEach(([field, value]) => {
                                if (field !== 'githubId') {
                                    if (value.includes(string1)) {
                                        newValue = value.replace(string1, string2);
                                    } else if (value.includes(string2)) {
                                        newValue = value.replace(string2, string1);
                                    } else {
                                        newValue = string1 + value;
                                    }

                                    record[field] = newValue; // triggers the change
                                }
                            });
                        }
                    }
                }
            }, {
                ntype  : 'button',
                iconCls: 'fa fa-sync-alt',
                text   : 'Reset Sorting',
                handler: function () {
                    Neo.getComponent('myTableStoreContainer').store.sort();
                }
            }]
        }, {
            ntype: 'toolbar',
            flex : '0 1 auto',

            style: {
                marginBottom: '10px',
                padding     : 0
            },

            items: [{
                ntype: 'label',
                text : 'Selection Model:',
                style: {
                    margin: '0 10px 0 5px'
                }
            }, {
                ntype         : 'radiofield',
                checked       : true,
                hideLabel     : true,
                hideValueLabel: false,
                name          : 'selectionModel',
                value         : 'selection-table-cellmodel',
                valueLabelText: 'Cell',
                listeners: {
                    change: function(data) {
                        if (data.value) {
                            Neo.getComponent('myTableStoreContainer').selectionModel = {
                                ntype: this.value
                            };
                        }
                    }
                }
            }, {
                ntype         : 'radiofield',
                hideLabel     : true,
                hideValueLabel: false,
                name          : 'selectionModel',
                style         : {marginLeft: '20px'},
                value         : 'selection-table-columnmodel',
                valueLabelText: 'Column',
                listeners: {
                    change: function(data) {
                        if (data.value) {
                            Neo.getComponent('myTableStoreContainer').selectionModel = {
                                ntype: this.value
                            };
                        }
                    }
                }
            }, {
                ntype         : 'radiofield',
                hideLabel     : true,
                hideValueLabel: false,
                name          : 'selectionModel',
                style         : {marginLeft: '20px'},
                value         : 'selection-table-rowmodel',
                valueLabelText: 'Row',
                listeners: {
                    change: function(data) {
                        if (data.value) {
                            Neo.getComponent('myTableStoreContainer').selectionModel = {
                                ntype: this.value
                            };
                        }
                    }
                }
            }, {
                ntype         : 'radiofield',
                hideLabel     : true,
                hideValueLabel: false,
                name          : 'selectionModel',
                style         : {marginLeft: '20px'},
                value         : 'selection-table-cellcolumnmodel',
                valueLabelText: 'Cell & Column',
                listeners: {
                    change: function(data) {
                        if (data.value) {
                            Neo.getComponent('myTableStoreContainer').selectionModel = {
                                ntype: this.value
                            };
                        }
                    }
                }
            }, {
                ntype         : 'radiofield',
                hideLabel     : true,
                hideValueLabel: false,
                name          : 'selectionModel',
                style         : {marginLeft: '20px'},
                value         : 'selection-table-cellrowmodel',
                valueLabelText: 'Cell & Row',
                listeners: {
                    change: function(data) {
                        if (data.value) {
                            Neo.getComponent('myTableStoreContainer').selectionModel = {
                                ntype: this.value
                            };
                        }
                    }
                }
            }]
        }, {
            module        : TableContainer,
            id            : 'myTableStoreContainer',
            selectionModel: CellModel,
            store         : MainStore,
            width         : '100%',
            wrapperStyle  : {height: '300px'},

            columns: [{
                text     : 'Firstname',
                dataField: 'firstname'
            }, {
                text     : 'Lastname',
                dataField: 'lastname'
            }, {
                text     : 'Github Id',
                dataField: 'githubId'
            }, {
                text     : 'Country',
                dataField: 'country'
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};