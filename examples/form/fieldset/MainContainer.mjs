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
            maxValue : 300,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.height
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
        return Neo.create({
            module: Fieldset,
            items : [{
                module   : NumberField,
                labelText: 'Field 1',
                maxValue : 300,
                minValue : 0,
                value    : 10
            }, {
                module   : NumberField,
                labelText: 'Field 2',
                maxValue : 300,
                minValue : 0,
                style    : {marginTop: '10px'},
                value    : 10
            }, {
                module   : NumberField,
                labelText: 'Field 3',
                maxValue : 300,
                minValue : 0,
                style    : {marginTop: '10px'},
                value    : 10
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
