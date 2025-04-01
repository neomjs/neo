import EmailModel from '../model/Email.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @class Email.store.Emails
 * @extends Neo.data.Store
 */
class Emails extends Store {
    static config = {
        /**
         * @member {String} className='Email.store.Emails'
         * @protected
         */
        className: 'Email.store.Emails',
        /**
         * @member {Neo.data.Model} model=Email
         */
        model: EmailModel
    }
}

export default Neo.setupClass(Emails);
