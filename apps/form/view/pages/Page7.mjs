import Fieldset          from '../../../../src/form/Fieldset.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page7
 * @extends Form.view.FormPageContainer
 */
class Page7 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page7'
         * @protected
         */
        className: 'Form.view.pages.Page7',
        /**
         * @member {String} formGroup='page7'
         */
        formGroup: 'page7',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : Fieldset,
            formGroup: 'persons[0]',
            title    : 'Fieldset 1',

            items : [{
                module   : TextField,
                labelText: 'Firstname',
                name     : 'firstname',
                required : true,
                value    : 'John'
            }, {
                module   : TextField,
                labelText: 'Lastname',
                name     : 'lastname',
                value    : 'Doe'
            }]
        }, {
            module   : Fieldset,
            formGroup: 'persons[1]',
            title    : 'Fieldset 2',

            items : [{
                module   : TextField,
                labelText: 'Firstname',
                name     : 'firstname',
                required : true,
                value    : 'Jane'
            }, {
                module   : TextField,
                labelText: 'Lastname',
                name     : 'lastname',
                value    : 'Dough'
            }]
        }]
    }
}

Neo.applyClassConfig(Page7);

export default Page7;
