import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.field.checkbox.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.checkbox.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.disabled,
            labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')}
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'error',
            listeners: {change: me.onConfigChange.bind(me, 'error')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.error
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.hideLabel,
            labelText: 'hideLabel',
            listeners: {change: me.onConfigChange.bind(me, 'hideLabel')},
            style    : {marginTop: '10px'}
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'left',
            hideValueLabel: false,
            labelText     : 'labelPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'left')},
            name          : 'labelPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'left'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.labelPosition === 'top',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'labelPosition', 'top')},
            name          : 'labelPosition',
            valueLabelText: 'top'
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
            module   : CheckBox,
            checked  : me.exampleComponent.readOnly,
            labelText: 'readOnly',
            listeners: {change: me.onConfigChange.bind(me, 'readOnly')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.required,
            labelText: 'required',
            listeners: {change: me.onConfigChange.bind(me, 'required')},
            style    : {marginTop: '10px'}
        }, {
            module   : TextField,
            labelText: 'valueLabelText',
            listeners: {change: me.onConfigChange.bind(me, 'valueLabelText')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.valueLabelText
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 500,
            minValue : 50,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }, {
            ntype  : 'button',
            handler: (() => {me.exampleComponent.reset()}),
            style  : {marginTop: '10px', width: '50%'},
            text   : 'reset()'
        }]
    }

    createExampleComponent() {
        return Neo.create(CheckBox, {
            labelText : 'Label',
            labelWidth: 70,
            width     : 200
        })
    }
}

export default Neo.setupClass(MainContainer);
