import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Radio                 from '../../../../src/form/field/Radio.mjs';
import TextAreaField         from '../../../../src/form/field/TextArea.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.field.textarea.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.textarea.MainContainer',
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
            module   : NumberField,
            labelText: 'cols',
            listeners: {change: me.onConfigChange.bind(me, 'cols')},
            maxValue : 100,
            minValue : 0,
            stepSize : 1,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.cols
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
            module   : TextField,
            clearable: true,
            labelText: 'placeholderText',
            listeners: {change: me.onConfigChange.bind(me, 'placeholderText')},
            value    : me.exampleComponent.placeholderText
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.resizable,
            labelText: 'resizable',
            listeners: {change: me.onConfigChange.bind(me, 'resizable')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.autoGrow,
            labelText: 'autoGrow',
            listeners: {change: me.onConfigChange.bind(me, 'autoGrow')},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.required,
            labelText: 'required',
            listeners: {change: me.onConfigChange.bind(me, 'required')},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            labelText: 'rows',
            listeners: {change: me.onConfigChange.bind(me, 'rows')},
            maxValue : 100,
            minValue : 0,
            stepSize : 1,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.rows
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.width
        }, {
            module        : Radio,
            checked       : me.exampleComponent.wrap === 'hard',
            hideValueLabel: false,
            labelText     : 'wrap',
            listeners     : {change: me.onRadioChange.bind(me, 'wrap', 'hard')},
            name          : 'wrap',
            style         : {marginTop: '10px'},
            valueLabelText: 'hard'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.wrap === 'off',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'wrap', 'off')},
            name          : 'wrap',
            valueLabelText: 'off'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.wrap === 'soft',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'wrap', 'soft')},
            name          : 'wrap',
            valueLabelText: 'soft'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.wrap === null,
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'wrap', null)},
            name          : 'wrap',
            valueLabelText: 'null'
        }];
    }

    createExampleComponent() {
        return Neo.create(TextAreaField, {
            clearable : true,
            height    : 60,
            labelText : 'Label',
            labelWidth: 70,
            value     : 'Hello World',
            width     : 400,
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
