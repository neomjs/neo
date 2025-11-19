import FormPageContainer from '../FormPageContainer.mjs';
import Radio             from '../../../../src/form/field/Radio.mjs';

/**
 * @class Form.view.pages.Page5
 * @extends Form.view.FormPageContainer
 */
class Page5 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page5'
         * @protected
         */
        className: 'Form.view.pages.Page5',
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module    : Radio,
            labelText : null,
            labelWidth: 70,
            name      : 'fruits'
        },
        /**
         * @member {String} formGroup='page5'
         */
        formGroup: 'page5',
        /**
         * @member {Object[]} items
         */
        items: [{
            labelText : 'Fruits',
            value     : 'apple',
            valueLabel: 'Apple'
        }, {
            value     : 'banana',
            valueLabel: 'Banana'
        }, {
            checked   : true,
            value     : 'lemon',
            valueLabel: 'Lemon'
        }, {
            value     : 'orange',
            valueLabel: 'Orange'
        }, {
            value     : 'strawberry',
            valueLabel: 'Strawberry'
        }]
    }
}

export default Neo.setupClass(Page5);
