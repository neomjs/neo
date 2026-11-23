import NumberField    from '../../../../src/form/field/Number.mjs';
import PasswordField  from '../../../../src/form/field/Password.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.password.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.password.MainContainer',
        autoMount    : true,
        componentName: 'Password field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : PasswordField,
            labelText      : 'Password',
            labelWidth     : 90,
            minLength      : 8,
            placeholderText: 'At least 8 characters',
            width          : 300
        },
        states: {
            filled  : {value: 'correct-horse-battery'},
            empty   : {},
            invalid : {value: 'abc'},
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
            labelText: 'minLength',
            listeners: {change: me.onConfigChange.bind(me, 'minLength')},
            maxValue : 20,
            minValue : 1,
            value    : me.exampleComponent.minLength
        }]
    }
}

export default Neo.setupClass(MainContainer);
