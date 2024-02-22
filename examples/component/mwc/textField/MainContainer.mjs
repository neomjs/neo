import CheckBox              from '../../../../src/form/field/CheckBox.mjs';
import MwcTextField          from '../../../../src/component/mwc/TextField.mjs';
import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import TextField             from '../../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.component.mwc.textField.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.component.mwc.textField.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me               = this,
            exampleComponent = me.exampleComponent;

        return [{
            module   : CheckBox,
            checked  : exampleComponent.disabled,
            labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')},
            style    : {marginTop: '.5em'}
        }, {
            module   : TextField,
            labelText: 'helper',
            listeners: {change: me.onConfigChange.bind(me, 'helper')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.helper
        }, {
            module   : TextField,
            labelText: 'icon',
            listeners: {change: me.onConfigChange.bind(me, 'icon')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.icon
        }, {
            module   : TextField,
            labelText: 'iconTrailing',
            listeners: {change: me.onConfigChange.bind(me, 'iconTrailing')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.iconTrailing
        }, {
            module   : TextField,
            clearable: true,
            labelText: 'label',
            listeners: {change: me.onConfigChange.bind(me, 'label')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.label
        }, {
            module   : CheckBox,
            checked  : exampleComponent.outlined,
            labelText: 'outlined',
            listeners: {change: me.onConfigChange.bind(me, 'outlined')},
            style    : {marginTop: '.5em'}
        }, {
            module   : TextField,
            labelText: 'placeholder',
            listeners: {change: me.onConfigChange.bind(me, 'placeholder')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.placeholder
        }, {
            module   : TextField,
            id       : `${me.id}__value`,
            labelText: 'value',
            listeners: {change: me.onConfigChange.bind(me, 'value')},
            style    : {marginTop: '.5em'},
            value    : exampleComponent.value
        }, {
            ntype  : 'button',
            text   : 'check validity',
            handler: data => {exampleComponent.checkValidity().then(value => console.log(value))},
            style  : {marginTop: '.5em'}
        }];
    }

    createExampleComponent() {
        let me = this;

        return Neo.create({
            module      : MwcTextField,
            helper      : 'Helper Text',
            icon        : 'event',
            iconTrailing: 'delete',
            label       : 'Hello World',
            outlined    : true,
            required    : true,
            value       : 'Foo',

            listeners: {
                change: data => {
                    if (data.oldValue) {
                        Neo.getComponent(`${me.id}__value`).value = data.value;
                    }
                }
            }
        });
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
