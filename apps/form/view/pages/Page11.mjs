import FormPageContainer from '../FormPageContainer.mjs';
import SelectField       from '../../../../src/form/field/Select.mjs';
import ZipCodeField      from '../../../../src/form/field/ZipCode.mjs';

/**
 * @class Form.view.pages.Page11
 * @extends Form.view.FormPageContainer
 */
class Page11 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page11'
         * @protected
         */
        className: 'Form.view.pages.Page11',
        /**
         * @member {Object[]} items
         */
        items: [{
            module        : SelectField,
            editable      : false,
            forceSelection: true,
            labelText     : 'Country',
            name          : 'page11.countryfield',
            reference     : 'country',
            value         : 'DE',

            store: {
                data: [
                    {id: 'DE',     name: 'Germany'},
                    {id: 'Others', name: 'Others'}
                ]
            }
        }, {
            module      : ZipCodeField,
            countryField: 'country',
            labelText   : 'Munich',
            name        : 'page11.field1',
            required    : true,
            value       : '80796'
        }, {
            module      : ZipCodeField,
            countryField: 'country',
            labelText   : 'Page 11 Field 2',
            name        : 'page11.field2'
        }]
    }
}

Neo.applyClassConfig(Page11);

export default Page11;
