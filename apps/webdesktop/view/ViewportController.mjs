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
     * The latest sign-in while its saved arrangement is being read. A later click replaces it, so the last click signs
     * in, whichever read answers first.
     * @member {Object|null} pendingSignIn=null
     * @protected
     */
    pendingSignIn = null
    /**
     * True while a sign-in restores a saved arrangement: that write is no new order, so nothing is saved
     * @member {Boolean} restoringArrangement=false
     * @protected
     */
    restoringArrangement = false
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
        let me = this;

        me.windowManager?.destroy();
        me.getStore('apps')?.un({rowsChange: me.onAppsRowsChange, scope: me});

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
     * Signs an account in with its saved icon arrangement, or the catalog order if it has none. The arrangement is in
     * place before the grants render the desktop. Of two quick clicks the later one signs in.
     * @param {Object}                   data
     * @param {WebDesktop.model.Account} data.record
     */
    async onAccountItemClick({record}) {
        let me          = this,
            signIn      = me.pendingSignIn = {record},
            arrangement = await me.readArrangement(record);

        if (me.pendingSignIn === signIn) {
            me.pendingSignIn        = null;
            me.restoringArrangement = true;

            try {
                me.getStore('apps').arrange(arrangement)
            } finally {
                me.restoringArrangement = false
            }

            me.setState({
                account    : record,
                permissions: [...record.permissions]
            })
        }
    }

    /**
     * Saves the signed-in account's arrangement whenever the apps store writes a new order: a drop, a keyboard move.
     */
    onAppsRowsChange() {
        let me      = this,
            account = me.getState('account');

        account && !me.restoringArrangement && Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : me.getArrangementKey(account),
            value   : JSON.stringify(me.getStore('apps').getArrangement()),
            windowId: me.component.windowId
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

        apps.on({rowsChange: me.onAppsRowsChange, scope: me});

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
     * Signs out at once. A sign-in whose arrangement is still being read does not outlive it, and the window manager's
     * reset ends every window load and hides every window. The windows leave the DOM before the account changes: a
     * window still mounted would re-render its content for the empty account, and that update would land after the
     * window's removal.
     * @param {Object} data
     */
    onSignOutButtonClick(data) {
        let me = this;

        me.pendingSignIn = null;
        me.windowManager.reset();

        me.setState({
            account         : null,
            permissions     : [],
            permissionsPanel: false
        })
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

    /**
     * Reads an account's saved arrangement. It is a preference: a failed read or an unreadable value gives the catalog
     * order and never blocks the sign-in.
     * @param {WebDesktop.model.Account} account
     * @returns {Promise<Object>} Group key → app keys, or `{}`
     */
    async readArrangement(account) {
        let me = this;

        try {
            let {value} = await Neo.main.addon.LocalStorage.readLocalStorageItem({
                    key     : me.getArrangementKey(account),
                    windowId: me.component.windowId
                }),
                arrangement = value && JSON.parse(value);

            return Neo.isObject(arrangement) ? arrangement : {}
        } catch {
            return {}
        }
    }
}

export default Neo.setupClass(ViewportController);
