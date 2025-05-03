import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import Fieldset              from '../../../src/form/Fieldset.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';
import TextField             from '../../../src/form/field/Text.mjs';

/**
 * @class Neo.examples.form.fieldset.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.fieldset.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 150,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.collapsible,
            labelText: 'collapsible',
            listeners: {change: me.onConfigChange.bind(me, 'collapsible')}
        }, {
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 50,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module   : TextField,
            labelText: 'iconClsChecked',
            listeners: {change: me.onConfigChange.bind(me, 'iconClsChecked')},
            value    : me.exampleComponent.iconClsChecked
        }, {
            module   : TextField,
            labelText: 'iconClsUnchecked',
            listeners: {change: me.onConfigChange.bind(me, 'iconClsUnchecked')},
            value    : me.exampleComponent.iconClsUnchecked
        }, {
            module   : TextField,
            labelText: 'title',
            listeners: {change: me.onConfigChange.bind(me, 'title')},
            value    : me.exampleComponent.title
        }, {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 800,
            minValue : 50,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }]
    }

    createExampleComponent() {
        return Neo.create({
            module: Fieldset,
            title : 'My Fieldset',
            width : 300,

            itemDefaults: {
                labelWidth: 120,
                module    : NumberField,
                maxValue  : 300,
                minValue  : 0,
                value     : 10
            },

            items : [{
                labelText: 'Field 1'
            }, {
                disabled : true,
                labelText: 'Field 2'
            }, {
                labelText: 'Field 3'
            }]
        })
    }
}

export default Neo.setupClass(MainContainer);
