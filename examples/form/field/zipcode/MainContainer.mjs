import StatesViewport from '../StatesViewport.mjs';
import ZipCodeField   from '../../../../src/form/field/ZipCode.mjs';

/**
 * @class Neo.examples.form.field.zipcode.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    static config = {
        className    : 'Neo.examples.form.field.zipcode.MainContainer',
        autoMount    : true,
        componentName: 'ZIP code field',
        layout       : {ntype: 'hbox', align: 'stretch'},

        field: {
            module         : ZipCodeField,
            countryCode    : 'DE',
            labelText      : 'ZIP code',
            labelWidth     : 80,
            placeholderText: '10115',
            width          : 220
        },
        // German ZIP codes have five digits
        states: {
            filled  : {value: '10115'},
            empty   : {},
            invalid : {value: '1011'},
            disabled: {},
            readOnly: {}
        }
    }
}

export default Neo.setupClass(MainContainer);
