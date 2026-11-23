import AccountChip from './AccountChip.mjs';
import Taskbar     from '../../../src/desktop/Taskbar.mjs';

/**
 * @summary The engine's taskbar with this demo's own items at its right end: the permission panel toggle, the theme,
 * the account and the sign-out. The start button stays disabled while the account holds no permission.
 * @class WebDesktop.view.Taskbar
 * @extends Neo.desktop.Taskbar
 */
class WebDesktopTaskbar extends Taskbar {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Taskbar'
         * @protected
         */
        className: 'WebDesktop.view.Taskbar',
        /**
         * Merged into the engine's items by key
         * @member {Object} items
         */
        items: {
            'start-button': {
                bind: {disabled: data => data.permissions.length === 0}
            },
            permissions: {
                bind   : {pressed: data => data.permissionsPanel},
                handler: 'onPermissionsButtonClick',
                iconCls: 'fas fa-user-shield',
                text   : 'Permissions',
                weight : 40
            },
            theme: {
                bind   : {iconCls: data => data.theme === 'neo-theme-neo-light' ? 'fas fa-moon' : 'fas fa-sun'},
                handler: 'onThemeButtonClick',
                vdom   : {'aria-label': 'Switch theme'},
                weight : 50
            },
            account: {
                module: AccountChip,
                bind  : {account: data => data.account},
                weight: 60
            },
            'sign-out': {
                handler: 'onSignOutButtonClick',
                iconCls: 'fas fa-right-from-bracket',
                text   : 'Sign out',
                weight : 70
            }
        }
    }
}

export default Neo.setupClass(WebDesktopTaskbar);
