import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import MwcButton             from '../../../../src/component/mwc/Button.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.mwc.button.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.mwc.button.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

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
            module  : MwcButton,
            icon    : 'event',
            label   : 'Hello World',
            outlined: true
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
