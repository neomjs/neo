import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import MwcTextField          from '../../../../src/component/mwc/TextField.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.mwc.textField.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.component.mwc.textField.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.dense,
            labelText: 'dense',
            listeners: {change: me.onConfigChange.bind(me, 'dense')}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.disabled,
            labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')},
            style    : {marginTop: '.5em'}
        }, {
            module   : TextField,
            labelText: 'icon',
            listeners: {change: me.onConfigChange.bind(me, 'icon')},
            value    : me.exampleComponent.icon,
            style    : {marginTop: '.5em'}
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'label',
            listeners: {change: me.onConfigChange.bind(me, 'label')},
            style    : {marginTop: '.5em'},
            value    : me.exampleComponent.label
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.outlined,
            labelText: 'outlined',
            listeners: {change: me.onConfigChange.bind(me, 'outlined')},
            style    : {marginTop: '.5em'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.raised,
            labelText: 'raised',
            listeners: {change: me.onConfigChange.bind(me, 'raised')},
            style    : {marginTop: '.5em'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.unelevated,
            labelText: 'unelevated',
            listeners: {change: me.onConfigChange.bind(me, 'unelevated')},
            style    : {marginTop: '.5em'}
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module  : MwcTextField,
            icon    : 'event',
            label   : 'Hello World',
            outlined: true
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
