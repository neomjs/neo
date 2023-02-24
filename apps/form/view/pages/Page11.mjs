import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page11
 * @extends Form.view.FormPageContainer
 */
class Page11 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page11'
         * @protected
         */
        className: 'Form.view.pages.Page11',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 11 Field 1',
            name     : 'page11field1'
        }, {
            module   : TextField,
            labelText: 'Page 11 Field 2',
            name     : 'page11field2'
        }]
    }
}

Neo.applyClassConfig(Page11);

export default Page11;
