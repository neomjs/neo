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
        model: EmailModel,
        /**
         * @member {Object[]} data
         */
        data: [
            {id: 1, sender: 'John Doe', title: 'Hello World!', content: 'This is the first email.', dateSent: '2025-07-15T10:00:00Z'},
            {id: 2, sender: 'Jane Smith', title: 'Re: Project Update', content: 'Here is the project update you requested.', dateSent: '2025-07-15T11:30:00Z'},
            {id: 3, sender: 'Peter Jones', title: 'Lunch tomorrow?', content: 'Are we still on for lunch tomorrow at 12:30?', dateSent: '2025-07-15T12:15:00Z'},
            {id: 4, sender: 'Mary Williams', title: 'Your order has shipped', content: 'Your order #12345 has shipped and will arrive in 3-5 business days.', dateSent: '2025-07-14T15:45:00Z'},
            {id: 5, sender: 'David Brown', title: 'Quick question', content: 'I have a quick question about the new feature.', dateSent: '2025-07-14T09:20:00Z'}
        ]
    }
}

export default Neo.setupClass(Emails);
