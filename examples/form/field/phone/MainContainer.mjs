import PhoneField     from '../../../../src/form/field/Phone.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.phone.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.phone.MainContainer',
        autoMount    : true,
        componentName: 'Phone field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : PhoneField,
            labelText      : 'Phone',
            labelWidth     : 70,
            placeholderText: '+49 30 1234567',
            width          : 280
        },
        states: {
            filled  : {value: '+49 30 12345678'},
            empty   : {},
            invalid : {value: '030-CALL-NOW'},
            disabled: {},
            readOnly: {}
        }
    }
}

export default Neo.setupClass(MainContainer);
