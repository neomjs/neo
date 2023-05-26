import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.field.text.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.text.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.autoComplete,
            labelText: 'autoComplete',
            listeners: {change: me.onConfigChange.bind(me, 'autoComplete')}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.clearable,
            labelText: 'clearable',
            listeners: {change: me.onConfigChange.bind(me, 'clearable')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.clearToOriginalValue,
            labelText: 'clearToOriginalValue',
            listeners: {change: me.onConfigChange.bind(me, 'clearToOriginalValue')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.disabled,
            labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')},
            style    : {marginTop: '10px'}
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'error',
            listeners: {change: me.onConfigChange.bind(me, 'error')},
            reference: 'error-field',
            value    : me.exampleComponent.error
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'errorTextRequired',
            listeners: {change: me.onConfigChange.bind(me, 'errorTextRequired')},
            value    : me.exampleComponent.errorTextRequired
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
            module   : NumberField,
            labelText: 'maxLength',
            listeners: {change: me.onConfigChange.bind(me, 'maxLength')},
            maxValue : 50,
            minValue : 1,
            stepSize : 1,
            value    : me.exampleComponent.maxLength
        }, {
            module   : NumberField,
            labelText: 'minLength',
            listeners: {change: me.onConfigChange.bind(me, 'minLength')},
            maxValue : 50,
            minValue : 1,
            stepSize : 1,
            value    : me.exampleComponent.minLength
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : me.exampleComponent.placeholderText
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
            module   : CheckBox,
            checked  : me.exampleComponent.showOptionalText,
            labelText: 'showOptionalText',
            listeners: {change: me.onConfigChange.bind(me, 'showOptionalText')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.spellCheck,
            labelText: 'spellCheck',
            listeners: {change: me.onConfigChange.bind(me, 'spellCheck')},
            style    : {marginTop: '10px'}
        }, {
            module   : TextField,
            labelText: 'subLabelText',
            listeners: {change: me.onConfigChange.bind(me, 'subLabelText')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.subLabelText
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
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
        return Neo.create(TextField, {
            clearable    : true,
            labelPosition: 'inline',
            labelText    : 'Label',
            labelWidth   : 70,
            minLength    : 3,
            value        : 'Hello World',
            width        : 200,

            listeners: {
                change(value) {
                    this.down({reference: 'error-field'}).clear();
                },
                scope: this
            }
        })
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
