import EmailModel from '../model/Email.mjs';
import Store      from '../../../src/data/Store.mjs';

/**
 * @summary Deterministic local mail large enough to exercise the buffered inbox's recycled rows.
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
         * Demo fixtures are generated once; Store owns model creation and row lookup.
         * @member {Object[]} data
         */
        data: Array.from({length: 250}, (_, index) => ({
            id        : index + 1,
            sender    : ['Alex Morgan', 'Sam Rivera', 'Robin Chen', 'Taylor Reed', 'Casey Brooks'][index % 5],
            recipients: ['demo@example.com'],
            title     : `Project conversation ${index + 1}`,
            dateSent  : `2026-11-${String(1 + index % 5).padStart(2, '0')}`,
            content   : `Message ${index + 1}\n\nThis local demo message belongs to conversation ${index + 1}. ` +
                'Scroll the inbox, select another message, or move this reader into its own window. ' +
                'The same component and its state travel between the windows.'
        }))
    }
}

export default Neo.setupClass(Emails);
