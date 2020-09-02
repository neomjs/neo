import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

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
            minValue : 1,
            value    : me.exampleComponent.stepSize
        }, {
            module        : Radio,
            checked       : me.exampleComponent.triggerPosition === 'right',
            hideValueLabel: false,
            labelText     : 'triggerPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'triggerPosition', 'right')},
            name          : 'triggerPosition',
            style         : {marginTop: '10px'},
            valueLabelText: 'right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.triggerPosition === 'sides',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'triggerPosition', 'sides')},
            name          : 'triggerPosition',
            valueLabelText: 'sides'
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
        }];
    }

    createExampleComponent() {
        return Neo.create(NumberField, {
            autoRender          : false,
            clearToOriginalValue: true,
            labelText           : 'Label',
            labelWidth          : 70,
            value               : 20,
            width               : 200
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};