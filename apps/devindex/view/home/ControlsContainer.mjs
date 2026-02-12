import * as selection from '../../../../src/selection/grid/_export.mjs';
import CheckBox       from '../../../../src/form/field/CheckBox.mjs';
import Container      from '../../../../src/container/Base.mjs';
import Country        from '../../../../src/form/field/Country.mjs';
import Profile        from './ProfileContainer.mjs';
import Radio          from '../../../../src/form/field/Radio.mjs';
import TabContainer   from '../../../../src/tab/Container.mjs';

/**
 * @class DevIndex.view.home.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevIndex.view.home.ControlsContainer'
         * @protected
         */
        className: 'DevIndex.view.home.ControlsContainer',
        /**
         * @member {String[]} cls=['devindex-controls-container']
         * @reactive
         */
        cls: ['devindex-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module        : TabContainer,
            cls           : ['devindex-controls-container-content'],
            dragResortable: true,
            reference     : 'controls-tab-container',

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
                    module        : Country,
                    clearable     : true,
                    forceSelection: true,
                    labelPosition : 'inline',
                    labelText     : 'Country',
                    listeners     : {change: 'up.onFilterChange'},
                    name          : 'country_code',
                    reference     : 'country-field',
                    showFlags     : true,
                    style         : {marginTop: '.3em'},
                    valueField    : 'code',
                    width         : 200
                }, {
                    ntype        : 'textfield',
                    clearable    : true,
                    editable     : true,
                    labelPosition: 'inline',
                    labelText    : 'Username',
                    listeners    : {change: 'up.onFilterChange'},
                    name         : 'login',
                    style        : {marginTop: '.3em'},
                    width        : 200
                }, {
                    ntype        : 'textfield',
                    clearable    : true,
                    editable     : true,
                    labelPosition: 'inline',
                    labelText    : 'Fullname',
                    listeners    : {change: 'up.onFilterChange'},
                    name         : 'name',
                    style        : {marginTop: '.3em'},
                    width        : 200
                }, {
                    module       : CheckBox,
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'up.onCommitsOnlyChange'},
                    style        : {marginTop: '1em'},
                    valueLabel   : 'Commits Only',
                    width        : 200
                }, {
                    module       : CheckBox,
                    checked      : true,
                    hideLabel    : true,
                    listeners    : {change: 'up.onShowAnimationsChange'},
                    style        : {marginTop: '1em'},
                    valueLabel   : 'Show Animations',
                    width        : 200
                }, {
                    ntype    : 'label',
                    reference: 'count-rows-label',
                    style    : {marginTop: '1em'}
                }]
            }, {
                module   : Profile,
                header   : {text: 'Profile'},
                reference: 'profile-container'
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
    onCommitsOnlyChange(data) {
        this.grid.commitsOnly = data.value
    }

    /**
     * @param {Object} data
     */
    onFilterChange(data) {
        let value = data.component.getSubmitValue();

        if (data.component.name === 'country_code' && value) {
            value = value.toUpperCase()
        }

        this.grid.store.getFilter(data.component.name).value = value
    }

    /**
     * @param {Object} data
     */
    onSelectionModelChange(data) {
        this.grid.body.selectionModel = data.component.selectionModel
    }

    /**
     * @param {Object} data
     */
    onShowAnimationsChange(data) {
        this.grid.animateVisuals = data.value
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
