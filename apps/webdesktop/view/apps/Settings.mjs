import AccountChip    from '../AccountChip.mjs';
import Button         from '../../../../src/button/Base.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Container      from '../../../../src/container/Base.mjs';
import PermissionList from '../PermissionList.mjs';

/**
 * @summary The Settings app: the signed-in account, the theme and the permissions, as one page. It writes the state
 * the taskbar writes: the theme buttons call the controller's `setTheme()` as the taskbar's theme button does, and the
 * permission switches are the permission panel's list, bound to the same `permissions`.
 * @class WebDesktop.view.apps.Settings
 * @extends Neo.container.Base
 */
class Settings extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Settings'
         * @protected
         */
        className: 'WebDesktop.view.apps.Settings',
        /**
         * @member {String[]} cls=['webdesktop-settings']
         */
        cls: ['webdesktop-settings'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            cls   : ['webdesktop-settings-heading'],
            flex  : 'none',
            text  : 'Account'
        }, {
            module: AccountChip,
            bind  : {account: data => data.account},
            flex  : 'none'
        }, {
            module: Component,
            cls   : ['webdesktop-settings-heading'],
            flex  : 'none',
            text  : 'Theme'
        }, {
            module: Container,
            cls   : ['webdesktop-settings-themes'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module   : Button,
                bind     : {pressed: data => data.theme === 'neo-theme-neo-dark'},
                handler  : 'onThemeSettingClick',
                iconCls  : 'fas fa-moon',
                text     : 'Dark',
                themeName: 'neo-theme-neo-dark'
            }, {
                module   : Button,
                bind     : {pressed: data => data.theme === 'neo-theme-neo-light'},
                handler  : 'onThemeSettingClick',
                iconCls  : 'fas fa-sun',
                text     : 'Light',
                themeName: 'neo-theme-neo-light'
            }]
        }, {
            module: Component,
            cls   : ['webdesktop-settings-heading'],
            flex  : 'none',
            text  : 'Permissions'
        }, {
            module   : PermissionList,
            flex     : 1,
            listeners: {itemClick: 'onPermissionItemClick'}
        }]
    }
}

export default Neo.setupClass(Settings);
