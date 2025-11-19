import * as selection from '../../../src/selection/grid/_export.mjs';
import ComboBox       from '../../../src/form/field/ComboBox.mjs';
import Container      from '../../../src/container/Base.mjs';
import Radio          from '../../../src/form/field/Radio.mjs';
import TabContainer   from '../../../src/tab/Container.mjs';

/**
 * @class Neo.examples.grid.bigData.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    /**
     * We need to add a 1-frame delay here. Rationale: the change events trigger huge computational logic.
     * We need to ensure that a ComboBox list selection first updates the field input value node,
     * and then continues with the grid update, to maintain a great UX.
     * @member {Object} delayable
     * @static
     */
    static delayable = {
        onAmountColumnsChange    : {type: 'buffer', timer: 15},
        onAmountRowsChange       : {type: 'buffer', timer: 15},
        onBufferColumnRangeChange: {type: 'buffer', timer: 15},
        onBufferRowRangeChange   : {type: 'buffer', timer: 15}
    }

    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.ControlsContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.ControlsContainer',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-controls-container']
         * @reactive
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
            module  : TabContainer,
            cls     : ['neo-examples-bigdata-controls-container-content'],
            sortable: true,

            headerToolbar: {
                sortZoneConfig: {
                    adjustItemRectsToParent: true
                }
            },

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
                    store     : ['1000', '5000', '10000', '20000', '50000', '100000'],
                    value     : '1000',
                    width     : 200
                }, {
                    labelText : 'Amount Columns',
                    labelWidth: 145,
                    listeners : {change: 'up.onAmountColumnsChange'},
                    store     : ['10', '25', '50', '75', '100', '200'],
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
                    module    : Radio,
                    checked   : true,
                    labelText : 'Theme',
                    labelWidth: 70,
                    listeners : {change: 'up.onThemeRadioChange'},
                    name      : 'theme',
                    style     : {marginTop: '2em'},
                    value     : 'neo-theme-dark',
                    valueLabel: 'Dark'
                }, {
                    module    : Radio,
                    labelText : '',
                    labelWidth: 70,
                    listeners : {change: 'up.onThemeRadioChange'},
                    name      : 'theme',
                    style     : {marginTop: '.3em'},
                    value     : 'neo-theme-light',
                    valueLabel: 'Light'
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
                    selectionModel: selection.CellModel,
                    valueLabel    : 'Cell'
                }, {
                    selectionModel: selection.ColumnModel,
                    valueLabel    : 'Column'
                }, {
                    checked       : true,
                    selectionModel: selection.RowModel,
                    valueLabel    : 'Row'
                }, {
                    selectionModel: selection.CellColumnModel,
                    valueLabel    : 'Cell & Column'
                }, {
                    selectionModel: selection.CellRowModel,
                    valueLabel    : 'Cell & Row'
                }, {
                    selectionModel: selection.CellColumnRowModel,
                    valueLabel    : 'Cell & Column & Row'
                }]
            }]
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         * @reactive
         */
        layout: {ntype: 'fit'},
        /**
         * @member {String} tag='aside'
         * @reactive
         */
        tag: 'aside'
    }

    /**
     * @member {Boolean} firstFiltering=true
     */
    firstFiltering = true

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
            this.grid.body.bufferColumnRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onBufferRowRangeChange(data) {
        if (data.oldValue) {
            this.grid.body.bufferRowRange = parseInt(data.value.id)
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
        })
    }

    /**
     * @param {Object} data
     */
    onFilterFieldChange(data) {
        let me = this;

        if (me.firstFiltering) {
            me.firstFiltering = false;
            me.grid.isLoading = 'Is Loading'
        }

        me.grid.store.getFilter(data.component.name).value = data.value;
        me.grid.isLoading = false
    }

    /**
     * @param {Object} data
     */
    onSelectionModelChange(data) {
        this.grid.body.selectionModel = data.component.selectionModel
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
