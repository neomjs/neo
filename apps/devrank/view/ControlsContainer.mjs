import * as selection from '../../../src/selection/grid/_export.mjs';
import Container from '../../../src/container/Base.mjs';
import Radio     from '../../../src/form/field/Radio.mjs';
import TabContainer from '../../../src/tab/Container.mjs';

/**
 * @class DevRank.view.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevRank.view.ControlsContainer'
         * @protected
         */
        className: 'DevRank.view.ControlsContainer',
        /**
         * @member {String[]} cls=['devrank-controls-container']
         * @reactive
         */
        cls: ['devrank-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['controls-container-button'],
            handler: 'up.onControlsToggleButtonClick',
            iconCls: 'fas fa-bars'
        }, {
            module        : TabContainer,
            cls           : ['devrank-controls-container-content'],
            dragResortable: true,

            headerToolbar: {
                sortZoneConfig: {
                    adjustItemRectsToParent: true
                }
            },

            items: [{
                module: Container,
                header: {text: 'Filters'},
                layout: 'vbox',

                items: [{
                    ntype     : 'textfield',
                    clearable : true,
                    editable  : true,
                    labelText : 'Search User',
                    labelWidth: 90,
                    listeners : {change: 'up.onSearchFieldChange'},
                    name      : 'search',
                    style     : {marginTop: '.3em'},
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
    async onControlsToggleButtonClick(data) {
        let me     = this,
            button = data.component;

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
    async onSearchFieldChange(data) {
        let me = this;

        // Simple single-field filter for now
        // We can expand this to search multiple fields if needed
        me.grid.store.getFilter('login').value = data.value;
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
            this.getItem('count-rows-label').text = 'Visible: ' + store.getCount()
        }
    }
}

export default Neo.setupClass(ControlsContainer);
