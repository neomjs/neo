import IBANField      from '../../../../src/form/field/IBAN.mjs';
import StatesViewport from '../StatesViewport.mjs';

/**
 * @class Neo.examples.form.field.iban.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.iban.MainContainer',
        autoMount    : true,
        componentName: 'IBAN field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : IBANField,
            countryCode    : 'DE',
            labelText      : 'IBAN',
            labelWidth     : 60,
            placeholderText: 'DE00 0000 0000 0000 0000 00',
            width          : 340
        },
        // The invalid state differs from the filled one in its last digit, which breaks the check digits
        states: {
            filled  : {value: 'DE89 3704 0044 0532 0130 00'},
            empty   : {},
            invalid : {value: 'DE89 3704 0044 0532 0130 01'},
            disabled: {},
            readOnly: {}
        }
    }
}

export default Neo.setupClass(MainContainer);
