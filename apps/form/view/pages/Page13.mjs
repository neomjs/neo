import FormPageContainer from '../FormPageContainer.mjs';
import UrlField          from '../../../../src/form/field/Url.mjs';

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
            module   : UrlField,
            labelText: 'Page 13 Field 1',
            name     : 'page13field1',
            value    : 'https://google.com'
        }, {
            module   : UrlField,
            labelText: 'Page 13 Field 2',
            name     : 'page13field2',
            value    : 'www.google.com' // missing protocol
        }]
    }
}

export default Neo.setupClass(Page13);
