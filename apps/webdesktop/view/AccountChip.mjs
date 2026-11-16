import Component from '../../../src/component/Base.mjs';

/**
 * @summary The signed-in account in the taskbar: avatar, name and role.
 * @class WebDesktop.view.AccountChip
 * @extends Neo.component.Base
 */
class AccountChip extends Component {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.AccountChip'
         * @protected
         */
        className: 'WebDesktop.view.AccountChip',
        /**
         * @member {WebDesktop.model.Account|null} account_=null
         * @reactive
         */
        account_: null,
        /**
         * @member {String[]} baseCls=['webdesktop-account-chip']
         * @protected
         */
        baseCls: ['webdesktop-account-chip']
    }

    /**
     * Triggered after the account config got changed
     * @param {WebDesktop.model.Account|null} value
     * @param {WebDesktop.model.Account|null} oldValue
     * @protected
     */
    afterSetAccount(value, oldValue) {
        let me = this;

        me.vdom.cn = value ? [{
            cls  : ['webdesktop-avatar'],
            style: {'--webdesktop-avatar-color': value.color},
            text : value.initials
        }, {
            cls: ['webdesktop-account-text'],
            cn : [
                {cls: ['webdesktop-account-name'], text: value.name},
                {cls: ['webdesktop-account-role'], text: value.role}
            ]
        }] : [];

        me.update()
    }
}

export default Neo.setupClass(AccountChip);
