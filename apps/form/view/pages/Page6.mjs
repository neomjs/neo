import FormPageContainer from '../FormPageContainer.mjs';
import TextArea          from '../../../../src/form/field/TextArea.mjs';

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
         * @member {String} formGroup='page6'
         */
        formGroup: 'page6',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module  : TextArea,
            autoGrow: true
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            labelText: 'Page 6 Field 1',
            minHeight: 150,
            name     : 'field1',
            required : true,
            value    : 'Lorem ipsum'
        }, {
            labelText: 'Page 6 Field 2',
            minHeight: 150,
            name     : 'field2'
        }, {
            labelText: 'Page 6 Field 3',
            name     : 'field3',
            readOnly : true
        }]
    }
}

export default Neo.setupClass(Page6);
