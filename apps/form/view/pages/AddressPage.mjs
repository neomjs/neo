import CountryField      from '../../../../src/form/field/Country.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';
import ZipCodeField      from '../../../../src/form/field/ZipCode.mjs';

/**
 * @summary Step 2: the billing address.
 * @class Form.view.pages.AddressPage
 * @extends Form.view.FormPageContainer
 */
class AddressPage extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.AddressPage'
         * @protected
         */
        className: 'Form.view.pages.AddressPage',
        /**
         * @member {String} formGroup='address'
         */
        formGroup: 'address',
        /**
         * @member {Object[]} items
         */
        items: [{
            module        : CountryField,
            forceSelection: true,
            labelText     : 'Country',
            name          : 'country',
            required      : true,
            showFlags     : true,
            value         : 'de'
        }, {
            module   : TextField,
            labelText: 'Street and number',
            name     : 'street',
            required : true
        }, {
            module   : ZipCodeField,
            labelText: 'ZIP code',
            name     : 'zip',
            required : true
        }, {
            module   : TextField,
            labelText: 'City',
            name     : 'city',
            required : true
        }]
    }
}

export default Neo.setupClass(AddressPage);
