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
     * the app, parented to the desktop's provider. Dragging and resizing both stay inside the workspace, the area above
     * the taskbar.
     * @param {WebDesktop.model.App} record
     * @returns {Promise<WebDesktop.view.AppWindow>}
     */
    async createWindow(record) {
        let me                   = this,
            launcher             = me.getReference('launcher'),
            workspaceId          = me.getReference('workspace').id,
            {appName, windowId}  = launcher,
            {default: AppWindow} = await import('./AppWindow.mjs');

        return Neo.create(AppWindow, {
            animateTargetId    : launcher.getItemId(launcher.store.get(record.id)),
            appName,
            boundaryContainerId: workspaceId,
            listeners          : {
                headerAction: data => me.onWindowHeaderAction(record.id, data),
                hide        : ()   => me.onWindowHide(record.id)
            },
            resizablePluginConfig: {boundaryContainerId: workspaceId},
            stateProvider        : {data: {app: record}, parent: me.getStateProvider()},
            windowId
        })
    }

    /**
     * The windows float on the document body, outside the viewport's items, so the controller that creates them
     * destroys them.
     * @param {...*} args
     */
    destroy(...args) {
        this.releaseWindows();
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
     * Hides every window without animation: their launcher icons may be gone already.
     */
    hideAllWindows() {
        Object.values(this.windows).forEach(promise => promise.then(window => {window.hidden || window.hide(false)}))
    }

    /**
     * Signs an account in with its own icon arrangement, or the catalog order if it saved none. The arrangement is in
     * place before the grants render the desktop, and with no account signed in yet, applying it saves nothing.
     * @param {Object}                   data
     * @param {WebDesktop.model.Account} data.record
     */
    async onAccountItemClick({record}) {
        let me      = this,
            {value} = await Neo.main.addon.LocalStorage.readLocalStorageItem({
                key     : me.getArrangementKey(record),
                windowId: me.component.windowId
            });

        me.getStore('apps').arrange(value ? JSON.parse(value) : {});

        me.setState({
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
     * Saves the signed-in account's arrangement whenever the apps store writes a new order: a drop, a keyboard move.
     */
    onAppsRowsChange() {
        let me      = this,
            account = me.getState('account');

        account && Neo.main.addon.LocalStorage.updateLocalStorageItem({
            key     : me.getArrangementKey(account),
            value   : JSON.stringify(me.getStore('apps').getArrangement()),
            windowId: me.component.windowId
        })
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

        me.getStore('apps').on({
            filter    : me.onAppsFilter,
            rowsChange: me.onAppsRowsChange,
            scope     : me
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

    /**
     * Destroys every window, open or still being imported, and stops listening to the apps store, which the desktop's
     * provider owns and destroys after this controller.
     * @protected
     */
    releaseWindows() {
        let me = this;

        me.getStore('apps')?.un('filter', me.onAppsFilter, me);

        Object.values(me.windows).forEach(promise => promise.then(window => {window.isDestroyed || window.destroy(true)}));

        me.windows = {}
    }
}

export default Neo.setupClass(ViewportController);
