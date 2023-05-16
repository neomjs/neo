import CurrencyField     from '../../../../src/form/field/Currency.mjs';
import FormPageContainer from '../FormPageContainer.mjs';

/**
 * @class Form.view.pages.Page15
 * @extends Form.view.FormPageContainer
 */
class Page15 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page15'
         * @protected
         */
        className: 'Form.view.pages.Page15',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : CurrencyField,
            labelText: 'Amount in €',
            name     : 'page15.field1',
            value    : 15.00
        }, {
            module   : CurrencyField,
            labelText: 'Amount in $',
            name     : 'page15.field2',
            value    : 16.10
        }]
    }
}

Neo.applyClassConfig(Page15);

export default Page15;
