import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary Signs accounts in and out, grants and revokes permissions, and switches the theme. The engine's desktop
 * (`Neo.desktop.Container`) opens the apps in windows and keeps them in step with the apps store.
 *
 * Signing in copies the account's permission keys into the root state provider; everything the account sees follows
 * from that one write. A window outlives no permission: when the apps store's filter drops an app, the desktop's window
 * manager closes its window.
 * @class WebDesktop.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Controller {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.ViewportController'
         * @protected
         */
        className: 'WebDesktop.view.ViewportController'
    }

    /**
     * @param {WebDesktop.model.Account} account
     * @returns {String} The localStorage key of an account's icon arrangement
     */
    getArrangementKey(account) {
        return `neo-webdesktop-arrangement-${account.id}`
    }

    /**
     * Signs an account in with its saved icon arrangement, or the catalog order if it has none. The launcher gets the
     * account's key before the grants: it holds its render until that arrangement is in place, so the grants never show
     * in another account's order. Of two quick clicks the later one wins.
     * @param {Object}                   data
     * @param {WebDesktop.model.Account} data.record
     */
    onAccountItemClick({record}) {
        let me = this;

        me.getReference('launcher').arrangementKey = me.getArrangementKey(record);

        me.setState({
            account    : record,
            permissions: [...record.permissions]
        })
    }

    /**
     * Grants or revokes one permission, as a backend would on a live session.
     * @param {Object}                      data
     * @param {WebDesktop.model.Permission} data.record
     */
    onPermissionItemClick({record}) {
        let permissions = this.getState('permissions'),
            key         = record.id;

        this.setState('permissions', permissions.includes(key) ? permissions.filter(item => item !== key) : [...permissions, key])
    }

    /**
     * @param {Object} data
     */
    onPermissionsButtonClick(data) {
        this.setState('permissionsPanel', !this.getState('permissionsPanel'))
    }

    /**
     * Signs out at once. The window manager's reset ends every window load and hides every window, and an arrangement
     * still being read does not outlive the sign-out: the launcher drops its key after the grants, so a held render
     * shows the empty desktop, never the leaving account's apps. The windows leave the DOM before the account changes:
     * a window still mounted would re-render its content for the empty account, and that update would land after the
     * window's removal.
     * @param {Object} data
     */
    onSignOutButtonClick(data) {
        let me = this;

        me.getReference('desktop').windowManager.reset();

        me.setState({
            account         : null,
            permissions     : [],
            permissionsPanel: false
        });

        me.getReference('launcher').arrangementKey = null
    }

    /**
     * Records the viewport's starting theme as state, which the taskbar's theme button and the Settings app read.
     */
    onComponentConstructed() {
        super.onComponentConstructed();
        this.setState('theme', this.component.getTheme())
    }

    /**
     * Switches between the dark and the light neo theme.
     * @param {Object} data
     */
    onThemeButtonClick(data) {
        this.setTheme(this.getState('theme') === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light')
    }

    /**
     * Applies the theme a Settings theme button names (`themeName`).
     * @param {Object}          data
     * @param {Neo.button.Base} data.component
     */
    onThemeSettingClick({component}) {
        this.setTheme(component.themeName)
    }

    /**
     * The one writer of the theme: the viewport takes it, then the state. A floating menu keeps the theme it was
     * created with, so the start menu follows explicitly.
     * @param {String} theme
     */
    setTheme(theme) {
        let me         = this,
            {menuList} = me.getReference('start-button');

        me.component.theme = theme;

        if (menuList) {
            menuList.theme = theme
        }

        me.setState('theme', theme)
    }
}

export default Neo.setupClass(ViewportController);
