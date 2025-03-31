import EmailStore from '../store/Emails.mjs';
import Provider   from '../../../src/state/Provider.mjs';

/**
 * @class Email.view.ViewportStateProvider
 * @extends Neo.state.Provider
 */
class ViewportStateProvider extends Provider {
    static config = {
        /**
         * @member {String} className='Email.view.ViewportStateProvider'
         * @protected
         */
        className: 'Email.view.ViewportStateProvider',
        /**
         * @member {Object} stores
         */
        stores: {
            emails: {
                module: EmailStore
            }
        }
    }
}

export default Neo.setupClass(ViewportStateProvider);
