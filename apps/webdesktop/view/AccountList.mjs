import List from '../../../src/list/Base.mjs';

/**
 * @summary The accounts to sign in with, read from the accounts store.
 * @class WebDesktop.view.AccountList
 * @extends Neo.list.Base
 */
class AccountList extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.AccountList'
         * @protected
         */
        className: 'WebDesktop.view.AccountList',
        /**
         * The root state provider owns the store
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['webdesktop-account-list','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-account-list', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {store: 'stores.accounts'},
        /**
         * @member {String} displayField='name'
         */
        displayField: 'name'
    }

    /**
     * @param {WebDesktop.model.Account} record
     * @returns {Object[]}
     */
    createItemContent(record) {
        let count = record.permissions.length;

        return [{
            cls  : ['webdesktop-avatar'],
            style: {'--webdesktop-avatar-color': record.color},
            text : record.initials
        }, {
            cls: ['webdesktop-account-text'],
            cn : [
                {cls: ['webdesktop-account-name'], text: record.name},
                {cls: ['webdesktop-account-role'], text: `${record.role} · ${count} ${count === 1 ? 'permission' : 'permissions'}`}
            ]
        }, {
            tag: 'i',
            cls: ['fas', 'fa-arrow-right', 'webdesktop-account-go']
        }]
    }
}

export default Neo.setupClass(AccountList);
