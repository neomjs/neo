import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';
import TimeField             from '../../../../src/form/field/Time.mjs';

/**
 * @class Neo.examples.form.field.time.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.time.MainContainer',
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
            listeners: {change: me.onConfigChange.bind(me, 'labelText')},
            style    : {marginTop: '10px'},
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
            module   : TimeField,
            labelText: 'maxValue',
            listeners: {change: me.onConfigChange.bind(me, 'maxValue')},
            value    : me.exampleComponent.maxValue
        }, {
            module   : TimeField,
            labelText: 'minValue',
            listeners: {change: me.onConfigChange.bind(me, 'minValue')},
            value    : me.exampleComponent.minValue
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : me.exampleComponent.placeholderText
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.required,
            labelText: 'required',
            listeners: {change: me.onConfigChange.bind(me, 'required')},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            labelText: 'stepSize',
            listeners: {change: me.onConfigChange.bind(me, 'stepSize')},
            maxValue : 60 * 60 * 3, // 3h
            minValue : 1,
            stepSize : 1, // 1s
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.stepSize
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
        return Neo.create(TimeField, {
            autoRender   : false,
            clearable    : true,
            labelPosition: 'inline',
            labelText    : 'Pick a time',
            labelWidth   : 100,
            value        : '10:00',
            width        : 200
        })
    }
}

export default Neo.setupClass(MainContainer);
