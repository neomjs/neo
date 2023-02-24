import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page13
 * @extends Form.view.FormPageContainer
 */
class Page13 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page13'
         * @protected
         */
        className: 'Form.view.pages.Page13',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 13 Field 1',
            name     : 'page13field1'
        }, {
            module   : TextField,
            labelText: 'Page 13 Field 2',
            name     : 'page13field2'
        }]
    }
}

Neo.applyClassConfig(Page13);

export default Page13;
