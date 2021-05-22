import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Fieldset              from '../../../src/form/Fieldset.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.form.fieldset.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static getConfig() {return {
        className           : 'Neo.examples.form.fieldset.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }}

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 50,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create({
            module: Fieldset,
            title : 'My Fieldset',
            width : 350,

            itemDefaults: {
                module  : NumberField,
                maxValue: 300,
                minValue: 0,
                value   : 10
            },

            items : [{
                labelText: 'Field 1'
            }, {
                labelText: 'Field 2'
            }, {
                labelText: 'Field 3'
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
