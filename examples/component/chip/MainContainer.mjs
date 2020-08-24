import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import Chip                  from '../../../src/component/Chip.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

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
            module    :  TextField, // todo: selectField with options
            labelText : 'iconCls',
            listeners : {change: me.onConfigChange.bind(me, 'iconCls')},
            value     : me.exampleComponent.iconCls
        }, {
            module    :  TextField,
            clearable : true,
            labelText : 'text',
            listeners : {change: me.onConfigChange.bind(me, 'text')},
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.text
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
            module : Chip,
            iconCls: 'fa fa-home',
            height : 30,
            text   : 'Hello World'
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};