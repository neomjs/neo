import Account from '../model/Account.mjs';
import Store   from '../../../src/data/Store.mjs';

/**
 * @summary The demo accounts, read from the backend the way an app reads a sign-in answer.
 * @class WebDesktop.store.Accounts
 * @extends Neo.data.Store
 */
class Accounts extends Store {
    static config = {
        /**
         * @member {String} className='WebDesktop.store.Accounts'
         * @protected
         */
        className: 'WebDesktop.store.Accounts',
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {Neo.data.Model} model=Account
         */
        model: Account,
        /**
         * @member {String} url='../../apps/webdesktop/resources/data/accounts.json'
         */
        url: '../../apps/webdesktop/resources/data/accounts.json'
    }
}

export default Neo.setupClass(Accounts);
