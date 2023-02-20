import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page4
 * @extends Form.view.FormPageContainer
 */
class Page4 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page4'
         * @protected
         */
        className: 'Form.view.pages.Page4',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 4 Field 1',
            name     : 'page4field1',
            required : true
        }, {
            module   : TextField,
            labelText: 'Page 4 Field 2',
            name     : 'page4field2'
        }]
    }
}

Neo.applyClassConfig(Page4);

export default Page4;
