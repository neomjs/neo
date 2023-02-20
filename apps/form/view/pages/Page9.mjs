import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page9
 * @extends Form.view.FormPageContainer
 */
class Page9 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page9'
         * @protected
         */
        className: 'Form.view.pages.Page9',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 9 Field 1',
            name     : 'page9field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 9 Field 2',
            name     : 'page9field2'
        }]
    }
}

Neo.applyClassConfig(Page9);

export default Page9;
