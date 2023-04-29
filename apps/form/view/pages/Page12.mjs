import EmailField        from '../../../../src/form/field/Email.mjs';
import FormPageContainer from '../FormPageContainer.mjs';

/**
 * @class Form.view.pages.Page12
 * @extends Form.view.FormPageContainer
 */
class Page12 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page12'
         * @protected
         */
        className: 'Form.view.pages.Page12',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : EmailField,
            labelText: 'Page 12 Field 1',
            name     : 'page12field1',
            required : true
        }, {
            module   : EmailField,
            labelText: 'Page 12 Field 2',
            name     : 'page12field2'
        }]
    }
}

Neo.applyClassConfig(Page12);

export default Page12;
