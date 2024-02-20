import FormPageContainer from '../FormPageContainer.mjs';
import PhoneField        from '../../../../src/form/field/Phone.mjs';

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
            module   : PhoneField,
            labelText: 'Page 14 Field 1',
            name     : 'page14field1'
        }, {
            module   : PhoneField,
            labelText: 'Page 14 Field 2',
            name     : 'page14field2'
        }]
    }
}

Neo.setupClass(Page14);

export default Page14;
