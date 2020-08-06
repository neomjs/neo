import CellModel      from '../../src/selection/table/CellModel.mjs';
import CheckBox       from '../../src/form/field/CheckBox.mjs';
import MainStore      from './MainStore.mjs';
import TableContainer from '../../src/table/Container.mjs';
import Viewport       from '../../src/container/Viewport.mjs';

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
                text     : 'Github Id',
                dataField: 'githubId'
            }, {
                text     : 'Country',
                dataField: 'country'
            }, {
                text     : 'Online',
                dataField: 'isOnline',
                renderer : data => `<i class="fa fa-${data.value ? 'check' : 'times'}"></i>`
            }]
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};