import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import List                  from '../../../src/list/Base.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class TestApp.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className: 'TestApp.MainContainer',
        ntype    : 'main-container',

        autoMount           : true,
        configItemLabelWidth: 130,
        configItemWidth     : 230,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.disableSelection,
            labelText: 'disableSelection',
            listeners: {change: me.onConfigChange.bind(me, 'disableSelection')}
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'height',
            listeners : {change: me.onConfigChange.bind(me, 'height')},
            maxValue  : 300,
            minValue  : 30,
            stepSize  : 5,
            value     : me.exampleComponent.height,
            style     : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.useCheckBoxes,
            labelText: 'useCheckBoxes',
            listeners: {change: me.onConfigChange.bind(me, 'useCheckBoxes')},
            style    : {marginTop: '10px'}
        }, {
            module    :  NumberField,
            clearable : true,
            labelText : 'width',
            listeners : {change: me.onConfigChange.bind(me, 'width')},
            maxValue  : 300,
            minValue  : 100,
            stepSize  : 5,
            style     : {marginTop: '10px'},
            value     : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module      : List,
            displayField: 'firstname',
            draggable   : true,
            store       : MainStore,
            width       : 100
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};