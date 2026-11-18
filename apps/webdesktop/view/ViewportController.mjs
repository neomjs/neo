import Controller    from '../../../src/controller/Component.mjs';
import WindowManager from '../../../src/desktop/WindowManager.mjs';

/**
 * @summary Signs accounts in and out, opens apps in windows through a `Neo.desktop.WindowManager`, and hands the start
 * menu the apps store.
 *
 * Signing in copies the account's permission keys into the root state provider; everything the account sees follows
 * from that one write. A window outlives no permission: when the apps store's filter drops an app, the window manager
 * closes its window.
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
     * Opens the app windows and keeps them in step with the tasks store
     * @member {Neo.desktop.WindowManager|null} windowManager=null
     */
    windowManager = null

    /**
     * The window manager destroys the windows it created, and the apps store, which the desktop's provider owns and
     * destroys after this controller, is left alone
     * @param {...*} args
     */
    destroy(...args) {
        this.windowManager?.destroy();

        super.destroy(...args)
    }

    /**
     * @param {WebDesktop.model.Account} account
     * @returns {String} The localStorage key of an account's icon arrangement
     */
    getArrangementKey(account) {
        return `neo-webdesktop-arrangement-${account.id}`
    }

    /**
     * The config of an app's window. It grows out of the app's launcher icon, and its own state provider holds the
     * app, parented to the desktop's provider. Dragging and resizing both stay inside the workspace, the area above
     * the taskbar.
     * @param {WebDesktop.model.App} record
     * @returns {Object}
     */
    getWindowConfig(record) {
        let me                  = this,
            launcher            = me.getReference('launcher'),
            workspaceId         = me.getReference('workspace').id,
            {appName, windowId} = launcher;

        return {
            animateTargetId      : launcher.getItemId(launcher.store.get(record.id)),
            appName,
            boundaryContainerId  : workspaceId,
            resizablePluginConfig: {boundaryContainerId: workspaceId},
            stateProvider        : {data: {app: record}, parent: me.getStateProvider()},
            windowId
        }
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
     * The start menu is a `menu.List` cascade over the apps store: every level reads the same filtered tree. The
     * windows open through the window manager, which follows the apps store's filter.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me   = this,
            apps = me.getStore('apps');

        me.getReference('start-button').menu = {
            align: {edgeAlign: 'b0-t0', targetMargin: 8},
            cls  : ['webdesktop-start-menu'],
            store: apps
        };

        me.windowManager = Neo.create(WindowManager, {
            appStore    : apps,
            taskStore   : me.getStore('tasks'),
            windowClass : () => import('./AppWindow.mjs'),
            windowConfig: record => me.getWindowConfig(record)
        })
    }

    /**
     * @param {Object}               data
     * @param {WebDesktop.model.App} data.record
     */
    onLauncherOpenApp({record}) {
        this.openApp(record)
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

        me.windowManager.reset();

        me.setState({
            account         : null,
            permissions     : [],
            permissionsPanel: false
        });

        me.getReference('launcher').arrangementKey = null
    }

    /**
     * Called by the start menu for a chosen app (`WebDesktop.model.App#handler`).
     * @param {WebDesktop.model.App} record
     */
    onStartMenuAppChoose(record) {
        this.openApp(record)
    }

    /**
     * A minimized window shows again; a visible one comes to the front.
     * @param {Object}                 data
     * @param {Neo.desktop.model.Task} data.record
     */
    onTaskItemClick({record}) {
        this.windowManager.restore(record.id)
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

    /**
     * Opens an app's window, or brings it back if it is open already, and lists it in the taskbar.
     * @param {WebDesktop.model.App} record
     * @returns {Promise<WebDesktop.view.AppWindow|null>}
     */
    openApp(record) {
        return this.windowManager.openApp(record)
    }
}

export default Neo.setupClass(ViewportController);
