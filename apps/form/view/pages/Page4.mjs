import CheckBox          from '../../../../src/form/field/CheckBox.mjs';
import FormPageContainer from '../FormPageContainer.mjs';

/**
 * @summary A required checkbox group with automatic shared error placement and a separate boolean field.
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
            module       : CheckBox,
            groupRequired: true,
            labelText    : null,
            labelWidth   : 70,
            name         : 'my.fruits[0].basket'
        },
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
            checked   : true,
            value     : 'orange',
            valueLabel: 'Orange'
        }, {
            value     : 'strawberry',
            valueLabel: 'Strawberry'
        }, {
            labelText     : 'Boolean',
            groupRequired : false, // overwriting the itemDefaults value
            name          : 'boolean',
            style         : {marginTop: '50px'},
            uncheckedValue: false,
            value         : true
        }]
    }
}

export default Neo.setupClass(Page4);
