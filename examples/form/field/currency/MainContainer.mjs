import CurrencyField  from '../../../../src/form/field/Currency.mjs';
import NumberField    from '../../../../src/form/field/Number.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.currency.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.currency.MainContainer',
        autoMount    : true,
        componentName: 'Currency field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : CurrencyField,
            labelText      : 'Price (EUR)',
            labelWidth     : 90,
            maxValue       : 100000,
            placeholderText: '0.00',
            width          : 260
        },
        states: {
            filled  : {value: 1299.99},
            empty   : {},
            invalid : {value: 250000},
            disabled: {},
            readOnly: {}
        }
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [...super.createConfigurationComponents(), {
            module   : NumberField,
            labelText: 'maxValue',
            listeners: {change: me.onConfigChange.bind(me, 'maxValue')},
            minValue : 100,
            stepSize : 100,
            value    : me.exampleComponent.maxValue
        }]
    }
}

export default Neo.setupClass(MainContainer);
