import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page8
 * @extends Form.view.FormPageContainer
 */
class Page8 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page8'
         * @protected
         */
        className: 'Form.view.pages.Page8',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 8 Field 1',
            name     : 'page8field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 8 Field 2',
            name     : 'page8field2'
        }]
    }
}

Neo.applyClassConfig(Page8);

export default Page8;
