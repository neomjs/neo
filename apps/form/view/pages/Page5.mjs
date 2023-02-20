import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page5
 * @extends Form.view.FormPageContainer
 */
class Page5 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page5'
         * @protected
         */
        className: 'Form.view.pages.Page5',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 5 Field 1',
            name     : 'page5field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 5 Field 2',
            name     : 'page5field2'
        }]
    }
}

Neo.applyClassConfig(Page5);

export default Page5;
