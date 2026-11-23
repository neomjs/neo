import NumberField    from '../../../../src/form/field/Number.mjs';
import RangeField     from '../../../../src/form/field/Range.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.range.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.range.MainContainer',
        autoMount    : true,
        componentName: 'Range field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module           : RangeField,
            labelText        : 'Volume',
            labelWidth       : 100,
            maxValue         : 100,
            minValue         : 0,
            showResultInLabel: true,
            width            : 300
        },
        // A slider always holds a value and the browser ignores `readonly` on it: it is only live or disabled
        states: {
            filled  : {value: 60},
            disabled: {}
        }
    }

    /**
     * A slider is never cleared, required or typed into; its bounds are its controls
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [...super.createConfigurationComponents()
            .filter(control => !['clearable', 'placeholderText', 'required'].includes(control.labelText)),
        ...['minValue', 'maxValue'].map(config => ({
            module   : NumberField,
            labelText: config,
            listeners: {change: me.onConfigChange.bind(me, config)},
            maxValue : 200,
            minValue : -100,
            stepSize : 10,
            value    : me.exampleComponent[config]
        }))]
    }
}

export default Neo.setupClass(MainContainer);
