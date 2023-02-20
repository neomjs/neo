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
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 7 Field 1',
            name     : 'page7field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 7 Field 2',
            name     : 'page7field2'
        }]
    }
}

Neo.applyClassConfig(Page7);

export default Page7;
