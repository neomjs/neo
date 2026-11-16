import Controller from '../../../src/controller/Component.mjs';

/**
 * @summary Signs accounts in and out, opens apps in windows, and hands the start menu the apps store.
 *
 * Signing in copies the account's permission keys into the root state provider; everything the account sees follows
 * from that one write. A window outlives no permission: when the apps store's filter drops an app, its window closes.
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
     * One window per app id, created on its first open and kept afterwards. Each value is the promise of the window,
     * so a second open during the lazy import reuses the first.
     * @member {Object} windows={}
     */
    windows = {}

    /**
     * Creates an app's window on first use. It grows out of the app's launcher icon, and its own state provider holds
     * the app, parented to the desktop's provider.
     * @param {WebDesktop.model.App} record
     * @returns {Promise<WebDesktop.view.AppWindow>}
     */
    async createWindow(record) {
        let me                   = this,
            launcher             = me.getReference('launcher'),
            {appName, windowId}  = launcher,
            {default: AppWindow} = await import('./AppWindow.mjs');

        return Neo.create(AppWindow, {
            animateTargetId    : launcher.getItemId(launcher.store.get(record.id)),
            appName,
            boundaryContainerId: me.getReference('workspace').id,
            listeners          : {
                headerAction: data => me.onWindowHeaderAction(record.id, data),
                hide        : ()   => me.onWindowHide(record.id)
            },
            stateProvider      : {data: {app: record}, parent: me.getStateProvider()},
            windowId
        })
    }

    /**
     * Hides every window without animation: their launcher icons may be gone already.
     */
    hideAllWindows() {
        Object.values(this.windows).forEach(promise => promise.then(window => {window.hidden || window.hide(false)}))
    }

    /**
     * @param {Object}                   data
     * @param {WebDesktop.model.Account} data.record
     */
    onAccountItemClick({record}) {
        this.setState({
            account    : record,
            permissions: [...record.permissions]
        })
    }

    /**
     * Closes every open app the permission filter no longer keeps, minimized ones included.
     */
    onAppsFilter() {
        let me      = this,
            apps    = me.getStore('apps'),
            tasks   = me.getStore('tasks'),
            revoked = tasks.items.filter(task => !apps.isKept(task.id));

        revoked.length && tasks.remove(revoked);
        revoked.forEach(task => me.windows[task.id].then(window => {window.hidden || window.hide(false)}))
    }

    /**
     * The start menu is a `menu.List` cascade over the apps store: every level reads the same filtered tree.
     */
    onComponentConstructed() {
        super.onComponentConstructed();

        let me = this;

        me.getReference('start-button').menu = {
            align: {edgeAlign: 'b0-t0', targetMargin: 8},
            cls  : ['webdesktop-start-menu'],
            store: me.getStore('apps')
        };

        me.getStore('apps').on('filter', me.onAppsFilter, me)
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
     * @param {Object} data
     */
    onSignOutButtonClick(data) {
        let me = this;

        me.hideAllWindows();
        me.getStore('tasks').clear();

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
     * @param {Object}                data
     * @param {WebDesktop.model.Task} data.record
     */
    async onTaskItemClick({record}) {
        let window = await this.windows[record.id];

        if (window.hidden) {
            record.minimized = false;
            window.toFront();
            window.show()
        } else {
            window.toFront()
        }
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
     * Minimizing keeps the app's task and hides its window into the launcher icon.
     * @param {String}                    appId
     * @param {Object}                    data
     * @param {String}                    data.action
     * @param {WebDesktop.view.AppWindow} data.dialog
     */
    onWindowHeaderAction(appId, {action, dialog}) {
        if (action === 'minimize') {
            this.getStore('tasks').get(appId).minimized = true;
            dialog.hide()
        }
    }

    /**
     * A window hidden without minimizing was closed (header button or Escape): its task goes.
     * @param {String} appId
     */
    onWindowHide(appId) {
        let tasks = this.getStore('tasks'),
            task  = tasks.get(appId);

        task && !task.minimized && tasks.remove(task)
    }

    /**
     * Opens an app's window, or brings it back if it is open already, and lists it in the taskbar.
     * @param {WebDesktop.model.App} record
     */
    async openApp(record) {
        let me     = this,
            {id}   = record,
            tasks  = me.getStore('tasks'),
            window = await (me.windows[id] ??= me.createWindow(record)),
            task   = tasks.get(id);

        if (task) {
            task.minimized = false
        } else {
            tasks.add({color: record.color, iconCls: record.iconCls, id, text: record.text})
        }

        window.toFront();
        window.hidden && window.show()
    }
}

export default Neo.setupClass(ViewportController);
