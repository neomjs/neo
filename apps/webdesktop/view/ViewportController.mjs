import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary Signs accounts in and out, and hands the start menu the apps store.
 *
 * Signing in copies the account's permission keys into the root state provider; everything the account sees follows
 * from that one write.
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
     * The start menu is a `menu.List` cascade over the apps store: every level reads the same filtered tree.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        this.getReference('start-button').menu = {
            align: {edgeAlign: 'b0-t0', targetMargin: 8},
            cls  : ['webdesktop-start-menu'],
            store: this.getStore('apps')
        }
    }

    /**
     * @param {Object}                  data
     * @param {WebDesktop.model.Account} data.record
     */
    onAccountItemClick({record}) {
        this.setState({
            account    : record,
            permissions: [...record.permissions]
        })
    }

    /**
     * Grants or revokes one permission, as a backend would on a live session.
     * @param {Object}                     data
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
     * @param {Object} data
     */
    onSignOutButtonClick(data) {
        this.setState({
            account         : null,
            permissions     : [],
            permissionsPanel: false
        })
    }

    /**
     * Switches between the dark and the light neo theme. A floating menu keeps the theme it was created with, so the
     * start menu follows explicitly.
     * @param {Object} data
     */
    onThemeButtonClick(data) {
        let me         = this,
            viewport   = me.component,
            isLight    = viewport.getTheme() === 'neo-theme-neo-light',
            theme      = isLight ? 'neo-theme-neo-dark' : 'neo-theme-neo-light',
            {menuList} = me.getReference('start-button');

        viewport.theme = theme;

        if (menuList) {
            menuList.theme = theme
        }

        data.component.iconCls = isLight ? 'fas fa-sun' : 'fas fa-moon'
    }
}

export default Neo.setupClass(ViewportController);
