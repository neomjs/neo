import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page3
 * @extends Form.view.FormPageContainer
 */
class Page3 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page3'
         * @protected
         */
        className: 'Form.view.pages.Page3',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 3 Field 1',
            name     : 'page3.field1',
            required : true,
            value    : 'foo'
        }, {
            module   : TextField,
            labelText: 'Page 3 Field 2',
            name     : 'page3.field2'
        }]
    }
}

export default Neo.setupClass(Page3);
