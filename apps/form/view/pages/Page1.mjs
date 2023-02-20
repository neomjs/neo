import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page1
 * @extends Form.view.FormPageContainer
 */
class Page1 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page1'
         * @protected
         */
        className: 'Form.view.pages.Page1',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Firstname',
            name     : 'firstname'
        }, {
            module   : TextField,
            labelText: 'Lastname',
            name     : 'lastname'
        }]
    }
}

Neo.applyClassConfig(Page1);

export default Page1;
