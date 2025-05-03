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
            module        : CheckBox,
            groupRequired : true,
            labelText     : null,
            labelWidth    : 70,
            name          : 'my.fruits[0].basket',
            showErrorTexts: false
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
            showErrorTexts: true, // overwriting the itemDefaults value
            value         : 'strawberry',
            valueLabelText: 'Strawberry'
        }, {
            labelText     : 'Boolean',
            groupRequired : false, // overwriting the itemDefaults value
            name          : 'boolean',
            showErrorTexts: true,  // overwriting the itemDefaults value
            style         : {marginTop: '50px'},
            uncheckedValue: false,
            value         : true
        }]
    }
}

export default Neo.setupClass(Page4);
