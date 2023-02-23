import CheckBox          from '../../../../src/form/field/CheckBox.mjs';
import FormPageContainer from '../FormPageContainer.mjs';

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
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module    : CheckBox,
            labelText : null,
            labelWidth: 70,
            name      : 'fruits[]'
        },
        /**
         * @member {Object[]} items
         */
        items: [{
            labelText     : 'Fruits',
            value         : 'apple',
            valueLabelText: 'Apple'
        }, {
            value         : 'banana',
            valueLabelText: 'Banana'
        }, {
            checked       : true,
            value         : 'lemon',
            valueLabelText: 'Lemon'
        }, {
            checked       : true,
            value         : 'orange',
            valueLabelText: 'Orange'
        }, {
            value         : 'strawberry',
            valueLabelText: 'Strawberry'
        }]
    }
}

Neo.applyClassConfig(Page4);

export default Page4;
