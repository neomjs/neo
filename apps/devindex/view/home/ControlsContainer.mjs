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
                    module       : CheckBox,
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'onCommitsOnlyChange'},
                    style        : {marginTop: '1em'},
                    valueLabel   : 'Commits Only',
                    width        : 200
                }, {
                    module       : CheckBox,
                    checked      : false,
                    hideLabel    : true,
                    listeners    : {change: 'onHireableChange'},
                    style        : {marginTop: '1em'},
                    valueLabel   : 'Hireable Only',
                    width        : 200
                }, {
                    module       : CheckBox,
                    checked      : true,
                    hideLabel    : true,
                    listeners    : {change: 'onShowAnimationsChange'},
                    style        : {marginTop: '1em'},
                    valueLabel   : 'Show Animations',
                    width        : 200
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
                    listeners     : {change: 'onSelectionModelChange'},
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
}

export default Neo.setupClass(ControlsContainer);
