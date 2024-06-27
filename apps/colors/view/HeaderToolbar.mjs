import CheckBox    from '../../../src/form/field/CheckBox.mjs';
import ComboBox    from '../../../src/form/field/ComboBox.mjs';
import NumberField from '../../../src/form/field/Number.mjs';
import Toolbar     from '../../../src/toolbar/Base.mjs';

/**
 * @class Colors.view.HeaderToolbar
 * @extends Neo.toolbar.Base
 */
class HeaderToolbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='Colors.view.HeaderToolbar'
         * @protected
         */
        className: 'Colors.view.HeaderToolbar',
        /**
         * @member {String[]} cls=['portal-header-toolbar']
         */
        cls: ['portal-header-toolbar'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch',wrap:'wrap'}
         */
        layout: {ntype: 'hbox', align: 'center', pack: 'start', wrap: 'wrap'},
        /**
         * @member {Object[]} items
         */
        items: [{
            bind   : {disabled: data => data.isUpdating},
            handler: 'onStartButtonClick',
            text   : 'Start'
        }, {
            bind   : {disabled: data => !data.isUpdating},
            handler: 'onStopButtonClick',
            text   : 'Stop'
        }, {
            module       : NumberField,
            bind         : {value: data => data.amountColors},
            clearable    : false,
            editable     : false,
            labelPosition: 'inline',
            labelText    : '# Colors',
            listeners    : {change: 'onChangeAmountColors'},
            maxValue     : 10,
            minValue     : 3,
            width        : 90
        }, {
            module       : ComboBox,
            bind         : {value: data => String(data.amountColumns)},
            clearable    : false,
            editable     : false,
            labelPosition: 'inline',
            labelText    : '# Columns',
            listeners    : {change: 'onChangeAmountColumns'},
            store        : ['5', '10', '15', '20', '26'],
            width        : 90
        }, {
            module       : ComboBox,
            bind         : {value: data => String(data.amountRows)},
            clearable    : false,
            editable     : false,
            labelPosition: 'inline',
            labelText    : '# Rows',
            listeners    : {change: 'onChangeAmountRows'},
            store        : ['5', '10', '15', '20'],
            width        : 90
        }, '->', {
            handler  : 'onDetachTableButtonClick',
            iconCls  : 'fas fa-table',
            reference: 'detach-table-button',
            text     : 'Table'
        }, {
            handler  : 'onDetachPieChartButtonClick',
            iconCls  : 'fas fa-chart-pie',
            reference: 'detach-pie-chart-button',
            text     : 'Pie Chart'
        }, {
            handler  : 'onDetachBarChartButtonClick',
            iconCls  : 'fas fa-chart-column',
            reference: 'detach-bar-chart-button',
            text     : 'Bar Chart'
        }, {
            module        : CheckBox,
            bind          : {checked: data => data.openWidgetsAsPopups},
            hideLabel     : true,
            listeners     : {change: 'onChangeOpenWidgetsAsPopups'},
            showValueLabel: true,
            valueLabelText: 'Popups'
        }]
    }
}

Neo.setupClass(HeaderToolbar);

export default HeaderToolbar;
