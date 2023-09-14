import Button            from '../../../../src/button/Base.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @class Form.view.pages.Page1
 * @extends Form.view.FormPageContainer
 */
class Page1 extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.Page1'
         * @protected
         */
        className: 'Form.view.pages.Page1',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : TextField,
            labelText: 'Firstname',
            minLength: 3,
            name     : 'firstname',
            required : true
        }, {
            module   : TextField,
            labelText: 'Lastname',
            name     : 'lastname'
        }, {
            module   : TextField,
            labelText: 'Status',
            name     : 'status',
            readOnly : true,
            value    : 'Active'
        }, {
            module : Button,
            handler: Page1.buttonHandler,
            style  : {marginTop: '2em', maxWidth: '300px'},
            text   : 'Change values'
        }]
    }

    static buttonHandler(data) {
        let container = data.component.up();

        container.items[0].value = Math.random();
        container.items[1].value = Math.random();
        container.items[2].value = Math.random()
    }
}

Neo.applyClassConfig(Page1);

export default Page1;
