import CheckBox       from '../../../../src/form/field/CheckBox.mjs';
import NumberField    from '../../../../src/form/field/Number.mjs';
import Radio          from '../../../../src/form/field/Radio.mjs';
import StatesViewport from '../StatesViewport.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.field.number.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.number.MainContainer',
        autoMount    : true,
        componentName: 'Number field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module              : NumberField,
            clearToOriginalValue: true,
            labelText           : 'Quantity',
            placeholderText     : 'How many?',
            labelWidth          : 80,
            maxValue            : 100,
            minValue            : 1,
            width               : 220
        },
        states: {
            filled  : {value: 20},
            empty   : {},
            invalid : {value: 150},
            disabled: {},
            readOnly: {}
        }
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
            stepSize : 10,
            value    : me.exampleComponent.labelWidth
        }, {
            module   : NumberField,
            labelText: 'maxValue',
            listeners: {change: me.onConfigChange.bind(me, 'maxValue')},
            maxValue : 100,
            minValue : 5,
            value    : me.exampleComponent.maxValue
        }, {
            module   : NumberField,
            labelText: 'minValue',
            listeners: {change: me.onConfigChange.bind(me, 'minValue')},
            maxValue : 50,
            minValue : -100,
            value    : me.exampleComponent.minValue
        }, {
            module   : TextField,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : me.exampleComponent.placeholderText
        }, {
            module   : NumberField,
            labelText: 'stepSize',
            listeners: {change: me.onConfigChange.bind(me, 'stepSize')},
            maxValue : 10,
            minValue : 0.01,
            stepSize : 0.01,
            value    : me.exampleComponent.stepSize
        }, {
            module        : Radio,
            checked       : me.exampleComponent.triggerPosition === 'right',
            hideValueLabel: false,
            labelText     : 'triggerPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'triggerPosition', 'right')},
            name          : 'triggerPosition',
            style         : {marginTop: '10px'},
            valueLabel    : 'right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.triggerPosition === 'sides',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'triggerPosition', 'sides')},
            name          : 'triggerPosition',
            valueLabel    : 'sides'
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.useSpinButtons,
            style    : {marginTop: '10px'},
            labelText: 'useSpinButtons',
            listeners: {change: me.onConfigChange.bind(me, 'useSpinButtons')}
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 50,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }
}

export default Neo.setupClass(MainContainer);
