import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ComboBox              from '../../../src/form/field/ComboBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import EffectButton          from '../../../src/button/Effect.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.button.effect.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.button.effect.MainContainer',
        configItemLabelWidth: 160,
        configItemWidth     : 280,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module        : Radio,
            checked       : me.exampleComponent.badgePosition === 'bottom-left',
            hideValueLabel: false,
            labelText     : 'badgePosition',
            listeners     : {change: me.onRadioChange.bind(me, 'badgePosition', 'bottom-left')},
            name          : 'badgePosition',
            valueLabel    : 'bottom-left'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.badgePosition === 'bottom-right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'badgePosition', 'bottom-right')},
            name          : 'badgePosition',
            valueLabel    : 'bottom-right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.badgePosition === 'top-left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'badgePosition', 'top-left')},
            name          : 'badgePosition',
            valueLabel    : 'top-left'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.badgePosition === 'top-right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'badgePosition', 'top-right')},
            name          : 'badgePosition',
            valueLabel    : 'top-right'
        }, {
            module   : TextField,
            labelText: 'badgeText',
            listeners: {change: me.onConfigChange.bind(me, 'badgeText')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.badgeText
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.disabled,
            labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 300,
            minValue : 30,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.height
        }, {
            module   : TextField, // todo: selectField with options
            labelText: 'iconCls',
            listeners: {change: me.onConfigChange.bind(me, 'iconCls')},
            value    : me.exampleComponent.iconCls
        }, {
            module   : TextField, // todo: colorPickerField
            clearable: true,
            labelText: 'iconColor',
            listeners: {change: me.onConfigChange.bind(me, 'iconColor')},
            value    : me.exampleComponent.iconColor
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'top',
            hideValueLabel: false,
            labelText     : 'iconPosition',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'top')},
            name          : 'iconPosition',
            style         : {marginTop: '10px'},
            valueLabel    : 'top'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'right',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'right')},
            name          : 'iconPosition',
            valueLabel    : 'right'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'bottom',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'bottom')},
            name          : 'iconPosition',
            valueLabel    : 'bottom'
        }, {
            module        : Radio,
            checked       : me.exampleComponent.iconPosition === 'left',
            hideValueLabel: false,
            labelText     : '',
            listeners     : {change: me.onRadioChange.bind(me, 'iconPosition', 'left')},
            name          : 'iconPosition',
            valueLabel    : 'left'
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'rippleEffectDuration',
            listeners: {change: me.onConfigChange.bind(me, 'rippleEffectDuration')},
            maxValue : 5000,
            minValue : 100,
            stepSize : 100,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.rippleEffectDuration
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'text',
            listeners: {change: me.onConfigChange.bind(me, 'text')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.text
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'tooltip',
            listeners: {change: me.onConfigChange.bind(me, 'tooltip')},
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.tooltip
        }, {
            module        : ComboBox,
            forceSelection: true,
            labelText     : 'ui',
            listeners     : {change: me.onConfigRecordChange.bind(me, 'ui')},
            style         : {marginTop: '10px'},
            value         : me.exampleComponent.ui,

            store: {
                data: [
                    {id: 'primary', name: 'primary'},
                    {id: 'secondary', name: 'secondary'},
                    {id: 'tertiary', name: 'tertiary'}
                ]
            }
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.useRippleEffect,
            labelText: 'useRippleEffect',
            listeners: {change: me.onConfigChange.bind(me, 'useRippleEffect')},
            style    : {marginTop: '10px'}
        }, {
            module   : NumberField,
            clearable: true,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 300,
            minValue : 100,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    /**
     * @returns {Neo.component.Base}
     */
    createExampleComponent() {
        return Neo.create({
            module   : EffectButton,
            badgeText: 'Badge',
            flex     : 'none',
            handler  : data => console.log('button click =>', data.component.id),
            height   : 50,
            iconCls  : 'fa fa-home',
            style    : {marginBottom: '1500px', marginTop: '500px'},
            text     : 'Hello World',
            ui       : 'primary',
            width    : 150
        })
    }

    /**
     * @param {String} config
     * @param {Object} opts
     */
    onConfigRecordChange(config, opts) {
        this.exampleComponent[config] = opts.value['id']
    }
}

export default Neo.setupClass(MainContainer);
