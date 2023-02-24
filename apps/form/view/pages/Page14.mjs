import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page14
 * @extends Form.view.FormPageContainer
 */
class Page14 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page14'
         * @protected
         */
        className: 'Form.view.pages.Page14',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Page 14 Field 1',
            name     : 'page14field1'
        }, {
            module   : TextField,
            labelText: 'Page 14 Field 2',
            name     : 'page14field2'
        }]
    }
}

Neo.applyClassConfig(Page14);

export default Page14;
