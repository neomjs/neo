import Container         from '../../../../src/container/Base.mjs';
import DateField         from '../../../../src/form/field/Date.mjs';
import EmailField        from '../../../../src/form/field/Email.mjs';
import FormPageContainer from '../FormPageContainer.mjs';
import PhoneField        from '../../../../src/form/field/Phone.mjs';
import TextField         from '../../../../src/form/field/Text.mjs';

/**
 * @summary Step 1: the person who opens the account.
 * @class Form.view.pages.AboutYouPage
 * @extends Form.view.FormPageContainer
 */
class AboutYouPage extends FormPageContainer {
    static config = {
        /**
         * @member {String} className='Form.view.pages.AboutYouPage'
         * @protected
         */
        className: 'Form.view.pages.AboutYouPage',
        /**
         * @member {String} formGroup='person'
         */
        formGroup: 'person',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['form-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module   : TextField,
                flex     : 1,
                labelText: 'First name',
                name     : 'firstName',
                required : true
            }, {
                module   : TextField,
                flex     : 1,
                labelText: 'Last name',
                name     : 'lastName',
                required : true
            }]
        }, {
            module   : EmailField,
            labelText: 'Work email',
            name     : 'email',
            required : true
        }, {
            module: Container,
            cls   : ['form-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module   : PhoneField,
                flex     : 1,
                labelText: 'Phone',
                name     : 'phone'
            }, {
                module   : DateField,
                flex     : 1,
                labelText: 'Birthday',
                name     : 'birthday'
            }]
        }]
    }
}

export default Neo.setupClass(AboutYouPage);
