import AccountChip from './AccountChip.mjs';
import Toolbar     from '../../../src/toolbar/Base.mjs';

/**
 * @summary The desktop's bottom bar: the start menu, the permission panel toggle, the theme and the account.
 *
 * The start button's menu is wired by `WebDesktop.view.ViewportController`, which hands it the apps store.
 * @class WebDesktop.view.Taskbar
 * @extends Neo.toolbar.Base
 */
class Taskbar extends Toolbar {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Taskbar'
         * @protected
         */
        className: 'WebDesktop.view.Taskbar',
        /**
         * @member {String[]} cls=['webdesktop-taskbar']
         */
        cls: ['webdesktop-taskbar'],
        /**
         * @member {Object[]} items
         */
        items: [{
            bind     : {disabled: data => data.permissions.length === 0},
            cls      : ['webdesktop-start-button'],
            iconCls  : 'fas fa-grip',
            reference: 'start-button',
            text     : 'Apps'
        }, '->', {
            bind   : {pressed: data => data.permissionsPanel},
            handler: 'onPermissionsButtonClick',
            iconCls: 'fas fa-user-shield',
            text   : 'Permissions'
        }, {
            handler: 'onThemeButtonClick',
            iconCls: 'fas fa-sun'
        }, {
            module: AccountChip,
            bind  : {account: data => data.account}
        }, {
            handler: 'onSignOutButtonClick',
            iconCls: 'fas fa-right-from-bracket',
            text   : 'Sign out'
        }]
    }
}

export default Neo.setupClass(Taskbar);
