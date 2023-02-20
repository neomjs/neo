import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page10
 * @extends Form.view.FormPageContainer
 */
class Page10 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page10'
         * @protected
         */
        className: 'Form.view.pages.Page10',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 10 Field 1',
            name     : 'page10field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 10 Field 2',
            name     : 'page10field2'
        }]
    }
}

Neo.applyClassConfig(Page10);

export default Page10;
