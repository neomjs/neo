import CheckBox       from '../../../../src/form/field/CheckBox.mjs';
import FruitSelect    from './FruitSelect.mjs';
import StatesViewport from '../StatesViewport.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';

/**
 * @summary A native Select with rich options and live presentation/validation controls.
 * @class Neo.examples.form.field.select.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.select.MainContainer',
        autoMount    : true,
        componentName: 'Select',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module   : FruitSelect,
            labelText: 'Fruit',
            name     : 'fruit',
            width    : 300
        },
        // A native select has no read-only state
        states: {
            filled  : {value: '0'},
            empty   : {},
            invalid : {required: true},
            disabled: {}
        }
    }

    /**
     * @summary Exposes native enhancement, required state and label without replacing the field.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        const me = this;
        return [{
            module   : CheckBox, checked: true, labelText: 'customizable',
            listeners: {change: me.onConfigChange.bind(me, 'customizable')}
        }, {
            module   : CheckBox, checked: false, labelText: 'required',
            listeners: {change: me.onConfigChange.bind(me, 'required')}
        }, {
            module   : CheckBox, checked: false, labelText: 'disabled',
            listeners: {change: me.onConfigChange.bind(me, 'disabled')}
        }, {
            module   : TextField, labelText: 'labelText', value: 'Fruit',
            listeners: {change: me.onConfigChange.bind(me, 'labelText')}
        }]
    }
}

export default Neo.setupClass(MainContainer);
