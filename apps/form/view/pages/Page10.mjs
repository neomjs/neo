import FormPageContainer from '../FormPageContainer.mjs';
import SelectField       from '../../../../src/form/field/Select.mjs';

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
            module   : SelectField,
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

Neo.applyClassConfig(Page10);

export default Page10;
