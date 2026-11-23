import CheckBox       from '../../../../src/form/field/CheckBox.mjs';
import CountryField   from '../../../../src/form/field/Country.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.country.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.country.MainContainer',
        autoMount    : true,
        componentName: 'Country field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : CountryField,
            labelText      : 'Country',
            placeholderText: 'Pick a country',
            labelWidth     : 80,
            showFlags      : true,
            width          : 300
        },
        states: {
            filled  : {value: 'germany'},
            empty   : {},
            invalid : {required: true},
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
            module   : CheckBox,
            checked  : me.exampleComponent.showFlags,
            labelText: 'showFlags',
            listeners: {change: me.onConfigChange.bind(me, 'showFlags')}
        }]
    }
}

export default Neo.setupClass(MainContainer);
