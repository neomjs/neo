import * as selection from '../../../../src/selection/grid/_export.mjs';
import CheckBox       from '../../../../src/form/field/CheckBox.mjs';
import ComboBox       from '../../../../src/form/field/ComboBox.mjs';
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
                cls           : ['devindex-tab-header-toolbar'],
                sortZoneConfig: {
                    adjustItemRectsToParent: true
                }
            },

            items: [{
                module: Container,
                header: {text: 'Search'},
                layout: 'vbox',

                items: [{
                    module        : Country,
                    clearable     : true,
                    forceSelection: true,
                    labelPosition : 'inline',
                    labelText     : 'Country',
                    listeners     : {change: 'onFilterChange'},
                    name          : 'countryCode',
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
                    listeners    : {change: 'onFilterChange'},
                    name         : 'login',
                    style        : {marginTop: '.3em'},
                    width        : 200
                }, {
                    ntype        : 'textfield',
                    clearable    : true,
                    editable     : true,
                    labelPosition: 'inline',
                    labelText    : 'Fullname',
                    listeners    : {change: 'onFilterChange'},
                    name         : 'name',
                    style        : {marginTop: '.3em'},
                    width        : 200
                }, {
                    ntype        : 'textfield',
                    clearable    : true,
                    editable     : true,
                    labelPosition: 'inline',
                    labelText    : 'Bio Search',
                    listeners    : {change: 'onFilterChange'},
                    name         : 'bio',
                    style        : {marginTop: '.3em'},
                    width        : 200
                }, {
                    ntype: 'label',
                    style: {marginTop: '1em'},
                    text : 'Data Mode'
                }, {
                    module        : Radio,
                    checked       : true,
                    dataMode      : 'total',
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'onDataModeChange'},
                    name          : 'dataMode',
                    valueLabel    : 'Total Contributions',
                    width         : 200
                }, {
                    module        : Radio,
                    dataMode      : 'public',
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'onDataModeChange'},
                    name          : 'dataMode',
                    style         : {marginTop: '.3em'},
                    valueLabel    : 'Public Contributions',
                    width         : 200
                }, {
                    module        : Radio,
                    dataMode      : 'private',
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'onDataModeChange'},
                    name          : 'dataMode',
                    style         : {marginTop: '.3em'},
                    valueLabel    : 'Private Contributions',
                    width         : 200
                }, {
                    module        : Radio,
                    dataMode      : 'commits',
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'onDataModeChange'},
                    name          : 'dataMode',
                    style         : {marginTop: '.3em'},
                    valueLabel    : 'Total Commits',
                    width         : 200
                }, {
                    ntype: 'label',
                    style: {marginTop: '1em'},
                    text : 'Filters'
                }, {
                    module       : CheckBox,
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'onHireableChange'},
                    valueLabel   : 'Hireable Only',
                    width        : 200
                }, {
                    module       : CheckBox,
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'onHideAutomationChange'},
                    style        : {marginTop: '.3em'},
                    valueLabel   : 'Hide Commit Ratio > 90%',
                    width        : 200
                }]
            }, {
                module   : Profile,
                header   : {text: 'Profile'},
                reference: 'profile-container'
            }, {
                module: Container,
                header: {text: 'Settings'},
                layout: 'vbox',

                itemDefaults: {
                    module        : Radio,
                    hideLabel     : true,
                    hideValueLabel: false,
                    labelText     : '',
                    listeners     : {change: 'onSelectionModelChange'},
                    name          : 'selectionModel',
                    style         : {marginTop: '.3em'},
                    width         : 200
                },

                items: [{
                    module       : CheckBox,
                    bind         : {checked: data => data.slowHeaderVisuals},
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'onSlowHeaderVisualsChange'},
                    name         : 'slowHeaderVisuals',
                    style        : {marginTop: 0},
                    valueLabel   : 'Slow Header Canvas',
                    width        : 200
                }, {
                    module       : CheckBox,
                    bind         : {checked: data => data.animateGridVisuals},
                    checked      : true,
                    hideLabel    : true,
                    listeners    : {change: 'onAnimateGridVisualsChange'},
                    name         : 'animateGridVisuals',
                    style        : {marginTop: '.3em'},
                    valueLabel   : 'Animate Grid Sparklines',
                    width        : 200
                }, {
                    module        : ComboBox,
                    clearable     : false,
                    editable      : false,
                    forceSelection: true,
                    hideLabel     : false,
                    labelText     : 'Buffer Row Range',
                    labelPosition : 'inline',
                    labelWidth    : 135,
                    listeners     : {change: 'onBufferRowRangeChange'},
                    store         : ['1', '2', '3', '5'],
                    style         : {marginTop: '1em'},
                    value         : '1',
                    width         : 200
                }, {
                    module        : ComboBox,
                    clearable     : false,
                    editable      : false,
                    forceSelection: true,
                    hideLabel     : false,
                    labelText     : 'Buffer Column Range',
                    labelPosition : 'inline',
                    labelWidth    : 135,
                    listeners     : {change: 'onBufferColumnRangeChange'},
                    store         : ['1', '2', '3', '5'],
                    style         : {marginTop: '.3em'},
                    value         : '1',
                    width         : 200
                }, {
                    ntype: 'label',
                    style: {marginTop: '1em'},
                    text : 'Pick the Selection Model'
                }, {
                    style         : {marginTop: '.3em'},
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
}

export default Neo.setupClass(ControlsContainer);
