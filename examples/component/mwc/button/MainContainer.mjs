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
    static getConfig() {return {
        className           : 'Neo.examples.component.mwc.button.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 110,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.closable,
            labelText: 'closable',
            listeners: {change: me.onConfigChange.bind(me, 'closable')}
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 100,
            minValue  : 20,
            stepSize  : 2,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.height
        }, {
            module    :  TextField,
            labelText : 'icon',
            listeners : {change: me.onConfigChange.bind(me, 'icon')},
            value     : me.exampleComponent.icon
        }, {
            module    :  TextField,
            clearable : true,
            labelText : 'label',
            listeners : {change: me.onConfigChange.bind(me, 'label')},
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.label
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: MwcButton,
            icon  : 'event',
            label : 'Hello World'
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
