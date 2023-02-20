import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page6
 * @extends Form.view.FormPageContainer
 */
class Page6 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page6'
         * @protected
         */
        className: 'Form.view.pages.Page6',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 6 Field 1',
            name     : 'page6field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 6 Field 2',
            name     : 'page6field2'
        }]
    }
}

Neo.applyClassConfig(Page6);

export default Page6;
