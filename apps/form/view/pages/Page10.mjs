import ComboBox          from '../../../../src/form/field/ComboBox.mjs';
import FormPageContainer from '../FormPageContainer.mjs';

/**
 * @class Form.view.pages.Page10
 * @extends Form.view.FormPageContainer
 */
class Page10 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page10'
         * @protected
         */
        className: 'Form.view.pages.Page10',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : ComboBox,
            editable : false,
            labelText: 'Page 10 Field 1',
            name     : 'page10field1',

            store: {
                data: [
                    {id: '1', name: 'A-Z'},
                    {id: '2', name: 'Z-A'}
                ]
            }
        }]
    }
}

export default Neo.setupClass(Page10);
