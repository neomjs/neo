import CellColumnModel    from '../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel from '../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel          from '../../../src/selection/grid/CellModel.mjs';
import CellRowModel       from '../../../src/selection/grid/CellRowModel.mjs';
import ColumnModel        from '../../../src/selection/grid/ColumnModel.mjs';
import ComboBox           from '../../../src/form/field/ComboBox.mjs';
import Container          from '../../../src/container/Base.mjs';
import Radio              from '../../../src/form/field/Radio.mjs';
import RowModel           from '../../../src/selection/grid/RowModel.mjs';
import TabContainer       from '../../../src/tab/Container.mjs';

/**
 * @class Neo.examples.grid.bigData.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.ControlsContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.ControlsContainer',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-controls-container']
         */
        cls: ['neo-examples-bigdata-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['controls-container-button'],
            handler: 'up.onControlsToggleButtonClick',
            iconCls: 'fas fa-bars'
        }, {
            module: TabContainer,
            cls   : ['neo-examples-bigdata-controls-container-content'],

            items: [{
                module: Container,
                header: {text: 'Settings'},
                layout: 'vbox',

                itemDefaults: {
                    module      : ComboBox,
                    clearable   : false,
                    displayField: 'id',
                    editable    : false
                },

                items: [{
                    labelText : 'Amount Rows',
                    labelWidth: 120,
                    listeners : {change: 'up.onAmountRowsChange'},
                    store     : ['1000', '5000', '10000', '20000', '50000'],
                    value     : '1000',
                    width     : 200
                }, {
                    labelText : 'Amount Columns',
                    labelWidth: 145,
                    listeners : {change: 'up.onAmountColumnsChange'},
                    store     : ['10', '25', '50', '75', '100'],
                    value     : '50',
                    width     : 200
                }, {
                    labelText : 'Buffer Rows',
                    labelWidth: 145,
                    listeners : {change: 'up.onBufferRowRangeChange'},
                    store     : ['0', '3', '5', '10', '25', '50'],
                    value     : '5',
                    width     : 200
                }, {
                    labelText : 'Buffer Columns',
                    labelWidth: 145,
                    listeners : {change: 'up.onBufferColumnRangeChange'},
                    store     : ['0', '3', '5', '10', '20'],
                    value     : '3',
                    width     : 200
                }, {
                    module        : Radio,
                    checked       : true,
                    labelText     : 'Theme',
                    labelWidth    : 70,
                    listeners     : {change: 'up.onThemeRadioChange'},
                    name          : 'theme',
                    style         : {marginTop: '2em'},
                    value         : 'neo-theme-dark',
                    valueLabelText: 'Dark'
                }, {
                    module        : Radio,
                    labelText     : '',
                    labelWidth    : 70,
                    listeners     : {change: 'up.onThemeRadioChange'},
                    name          : 'theme',
                    style         : {marginTop: '.3em'},
                    value         : 'neo-theme-light',
                    valueLabelText: 'Light'
                }, {
                    ntype: 'label',
                    style: {marginTop: '2em'},
                    text : 'Filters'
                }, {
                    ntype     : 'textfield',
                    clearable : true,
                    editable  : true,
                    labelText : 'Firstname',
                    labelWidth: 90,
                    listeners : {change: 'up.onFilterFieldChange'},
                    name      : 'firstname',
                    style     : {marginTop: '.3em'},
                    width     : 200
                }, {
                    ntype     : 'textfield',
                    clearable : true,
                    editable  : true,
                    labelText : 'Lastname',
                    labelWidth: 90,
                    listeners : {change: 'up.onFilterFieldChange'},
                    name      : 'lastname',
                    width     : 200
                }, {
                    ntype    : 'label',
                    reference: 'count-rows-label',
                    style    : {marginTop: '1em'}
                }]
            }, {
                module: Container,
                header: {text: 'Selection'},
                layout: 'vbox',

                itemDefaults: {
                    module        : Radio,
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'up.onSelectionModelChange'},
                    name          : 'selectionModel',
                    style         : {marginTop: '.3em'},
                    width         : 200
                },

                items: [{
                    ntype: 'label',
                    style: {marginTop: 0},
                    text : 'Pick the Selection Model'
                }, {
                    style         : {marginTop: '1em'},
                    selectionModel: CellModel,
                    valueLabelText: 'Cell'
                }, {
                    selectionModel: ColumnModel,
                    valueLabelText: 'Column'
                }, {
                    checked       : true,
                    selectionModel: RowModel,
                    valueLabelText: 'Row'
                }, {
                    selectionModel: CellColumnModel,
                    valueLabelText: 'Cell & Column'
                }, {
                    selectionModel: CellRowModel,
                    valueLabelText: 'Cell & Row'
                }, {
                    selectionModel: CellColumnRowModel,
                    valueLabelText: 'Cell & Column & Row'
                }]
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {ntype: 'fit'},
        /**
         * @member {String} tag='aside'
         */
        tag: 'aside'
    }

    get grid() {
        return this.parent.getItem('grid')
    }

    /**
     * @param {Object} data
     */
    onAmountColumnsChange(data) {
        if (data.oldValue) {
            this.grid.isLoading = 'Is Loading';
            this.grid.amountColumns = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onAmountRowsChange(data) {
        if (data.oldValue) {
            this.grid.isLoading = 'Is Loading';
            this.grid.store.amountRows = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferColumnRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferColumnRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferRowRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferRowRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    async onControlsToggleButtonClick(data) {
        let me     = this,
            button = data.component;

        // Custom flag to track the state
        button.expanded = !button.expanded;

        me.toggleCls('neo-expanded');

        await me.timeout(button.expanded ? 250 : 0);

        me.grid.toggleCls('neo-extend-margin-right');
    }

    onConstructed() {
        super.onConstructed();

        let me      = this,
            {store} = me.grid;

        store.on({
            filter: me.updateRowsLabel,
            load  : me.updateRowsLabel,
            scope : me
        });

        store.getCount() > 0 && me.updateRowsLabel()
    }

    /**
     * @param {Object} data
     */
    onFilterFieldChange(data) {
        this.grid.store.getFilter(data.component.name).value = data.value
    }

    /**
     * @param {Object} data
     */
    onSelectionModelChange(data) {
        this.grid.view.selectionModel = data.component.selectionModel
    }

    /**
     *
     */
    updateRowsLabel() {
        let {store} = this.grid;

        if (!store.isLoading) {
            this.getItem('count-rows-label').text = 'Filtered rows: ' + store.getCount()
        }
    }
}

export default Neo.setupClass(ControlsContainer);
