import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import DateField             from '../../../../src/form/field/Date.mjs';
import DateUtil              from '../../../../src/util/Date.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.field.date.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.date.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.clearable,
            labelText: 'clearable',
            listeners: {change: me.onConfigChange.bind(me, 'clearable')}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.clearToOriginalValue,
            labelText: 'clearToOriginalValue',
            listeners: {change: me.onConfigChange.bind(me, 'clearToOriginalValue')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.hideLabel,
            labelText: 'hideLabel',
            listeners: {change: me.onConfigChange.bind(me, 'hideLabel')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.hidePickerOnSelect,
            labelText: 'hidePickerOnSelect',
            listeners: {change: me.onConfigChange.bind(me, 'hidePickerOnSelect')},
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'top',
            hideValueLabel: false,
            labelText     : 'labelPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'top')},
            name          : 'labelPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'top'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'right')},
            name          : 'labelPosition',
            valueLabelText: 'right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'bottom',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'bottom')},
            name          : 'labelPosition',
            valueLabelText: 'bottom'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'left')},
            name          : 'labelPosition',
            valueLabelText: 'left'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'inline',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'inline')},
            name          : 'labelPosition',
            valueLabelText: 'inline'
        }, {
            module   : TextField,
            labelText: 'labelText',
            style    : {marginTop: '10px'},
            listeners: {change: me.onConfigChange.bind(me, 'labelText')},
            value    : me.exampleComponent.labelText
        }, {
            module   : NumberField,
            labelText: 'labelWidth',
            listeners: {change: me.onConfigChange.bind(me, 'labelWidth')},
            maxValue : 200,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.labelWidth
        }, {
            module   : TextField,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : me.exampleComponent.placeholderText
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create(DateField, {
            clearToOriginalValue: true,
            labelText           : 'Label',
            labelWidth          : 70,
            value               : DateUtil.convertToyyyymmdd(new Date()),
            width               : 270
        })
    }
}

export default Neo.setupClass(MainContainer);
