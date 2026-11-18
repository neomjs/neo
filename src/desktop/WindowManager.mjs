import Base from '../core/Base.mjs';

/**
 * @summary Opens a web desktop's app windows and keeps them in step with its tasks. Each app gets one window, created on
 * its first open and kept: a minimize hides it into its task, a restore shows it again, and a close or a filter that
 * drops its app removes the task.
 *
 * A window here is an app window, addressed by `appId`, the id of its app record. `windowId` keeps its engine meaning,
 * a browser window (`Neo.manager.Window`): an app window lives in whichever browser window {@link #windowConfig} names.
 *
 * Any `Neo.dialog.Base` works as {@link #windowClass}. The manager uses its `show()`, `hide()` and `hidden`, its
 * `hide` and `headerAction` events, and its `style.zIndex`. A dialog has one fixed z-index and no order among dialogs,
 * so each manager keeps a stack of the windows it created and sets their z-index from {@link #baseZIndex} up: two
 * desktops on one App worker keep separate orders. A `mousedown` on a window brings it to the front.
 *
 * The windows float outside every component tree, so the manager destroys the ones it created.
 * @class Neo.desktop.WindowManager
 * @extends Neo.core.Base
 */
class WindowManager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.desktop.WindowManager'
         * @protected
         */
        className: 'Neo.desktop.WindowManager',
        /**
         * The apps: a `Neo.data.TreeStore` whose filter decides which apps may keep a window open
         * (`TreeStore#isKept()`). When a filter drops an app, its window closes, minimized or not.
         * @member {Neo.data.TreeStore|null} appStore_=null
         * @reactive
         */
        appStore_: null,
        /**
         * The z-index below the lowest window. The default keeps the windows under the engine's floating layer, menus
         * at 100 and dialogs at 1000, so a taskbar's menu opens above every window.
         * @member {Number} baseZIndex=10
         */
        baseZIndex: 10,
        /**
         * The open apps, one task each, minimized or not, e.g. a `Neo.desktop.store.Tasks`
         * @member {Neo.data.Store|null} taskStore=null
         */
        taskStore: null,
        /**
         * The class of the windows: a `Neo.dialog.Base` subclass, or an async loader such as
         * `() => import('./AppWindow.mjs')`. A loader runs on each app's first open until a load succeeds.
         * @member {Neo.dialog.Base|Function|null} windowClass=null
         */
        windowClass: null,
        /**
         * The config of an app's window, `record => Object`: where it animates from, its browser window, its state
         * provider. The manager adds the z-index and listens to the window itself.
         * @member {Function|null} windowConfig=null
         */
        windowConfig: null
    }

    /**
     * The windows that exist, by app id
     * @member {Map<String, Neo.dialog.Base>} #created
     */
    #created = new Map()
    /**
     * Counts resets, a destroy included: a load that ends after one creates no window
     * @member {Number} #resets=0
     */
    #resets = 0
    /**
     * The windows this manager created, back to front
     * @member {Neo.dialog.Base[]} #stack
     */
    #stack = []
    /**
     * One request per app id, the promise of its window: a second open during a load reuses the first
     * @member {Map<String, Promise<Neo.dialog.Base|null>>} #windows
     */
    #windows = new Map()

    /**
     * Triggered after the appStore config got changed
     * @param {Neo.data.TreeStore|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @protected
     */
    afterSetAppStore(value, oldValue) {
        let me = this;

        // on() and un() consume keys like `scope` from the passed object, so each call gets its own
        oldValue && !oldValue.isDestroyed && oldValue.un({filter: me.onAppStoreFilter, scope: me});
        value?.on({filter: me.onAppStoreFilter, scope: me})
    }

    /**
     * Draws an app's window above every other window of this manager
     * @param {String} appId
     */
    bringToFront(appId) {
        let me     = this,
            stack  = me.#stack,
            index  = stack.indexOf(me.#created.get(appId));

        if (index > -1 && index < stack.length - 1) {
            stack.push(...stack.splice(index, 1));
            me.#restack()
        }
    }

    /**
     * Closes an app's window: its task goes, minimized or not, and a visible window hides
     * @param {String} appId
     */
    close(appId) {
        let me     = this,
            task   = me.taskStore.get(appId),
            window = me.#created.get(appId);

        task && me.taskStore.remove(task);
        window && !window.hidden && window.hide()
    }

    /**
     * Creates an app's window. A reset or a destroy during the load cancels it.
     * @param {Object} record The app
     * @returns {Promise<Neo.dialog.Base|null>} null when a reset ended the open
     */
    async #createWindow(record) {
        let me          = this,
            resets      = me.#resets,
            WindowClass = await me.#loadWindowClass();

        if (resets !== me.#resets) {
            return null
        }

        let {id}   = record,
            config = me.windowConfig?.(record) || {},
            window = Neo.create(WindowClass, {
                ...config,
                style: {...config.style, zIndex: me.baseZIndex + me.#stack.length + 1}
            });

        window.on({
            headerAction: data => me.#onWindowHeaderAction(id, data),
            hide        : ()   => me.#onWindowHide(id)
        });

        window.addDomListeners({mousedown: () => me.bringToFront(id)});

        me.#created.set(id, window);
        me.#stack.push(window);

        return window
    }

    /**
     * Destroys the windows it created; a load still running creates none
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.#resets++;
        me.appStore = null;

        me.#created.forEach(window => {window.isDestroyed || window.destroy(true)});
        me.#created.clear();
        me.#stack.length = 0;
        me.#windows.clear();

        super.destroy(...args)
    }

    /**
     * @param {String} appId
     * @returns {Neo.dialog.Base|null} The app's window, once it exists
     */
    getWindow(appId) {
        return this.#created.get(appId) || null
    }

    /**
     * @returns {Promise<Neo.dialog.Base>} The window class, loaded if {@link #windowClass} is a loader
     */
    async #loadWindowClass() {
        let {windowClass} = this;

        if (Neo.typeOf(windowClass) === 'NeoClass') {
            return windowClass
        }

        let module = await windowClass();

        return module.default || module
    }

    /**
     * Minimizes an app's window: its task stays, marked minimized, and the window hides
     * @param {String} appId
     */
    minimize(appId) {
        let me     = this,
            task   = me.taskStore.get(appId),
            window = me.#created.get(appId);

        if (task && window && !window.hidden) {
            task.minimized = true;
            window.hide()
        }
    }

    /**
     * Closes the windows of every app the filter no longer keeps, minimized ones included. They hide without animation:
     * the app's launcher icon may be gone already.
     * @protected
     */
    onAppStoreFilter() {
        let me                    = this,
            {appStore, taskStore} = me,
            revoked               = taskStore.items.filter(task => !appStore.isKept(task.id));

        if (revoked.length) {
            taskStore.remove(revoked);

            revoked.forEach(task => {
                let window = me.#created.get(task.id);

                window && !window.hidden && window.hide(false)
            })
        }
    }

    /**
     * Minimize is a header action the manager handles; maximize and close are the dialog's own
     * @param {String} appId
     * @param {Object} data
     * @param {String} data.action
     */
    #onWindowHeaderAction(appId, {action}) {
        action === 'minimize' && this.minimize(appId)
    }

    /**
     * A window hidden without a minimize was closed, by its header button or Escape: its task goes
     * @param {String} appId
     */
    #onWindowHide(appId) {
        let {taskStore} = this,
            task        = taskStore?.get(appId);

        task && !task.minimized && taskStore.remove(task)
    }

    /**
     * Opens an app's window, or brings it back if it exists, and lists the app as a task
     * @param {Object} record The app: its id, and `text`, `iconCls` and `color` for its task
     * @returns {Promise<Neo.dialog.Base|null>} null when the load failed silently or a reset cancelled it
     */
    async openApp(record) {
        let me      = this,
            {id}    = record,
            windows = me.#windows,
            request = windows.get(id),
            window;

        if (!request) {
            request = me.#createWindow(record);
            windows.set(id, request)
        }

        // A failed load, or one a reset cancelled, caches nothing: the next open loads again
        try {
            window = await request
        } finally {
            !window && windows.get(id) === request && windows.delete(id)
        }

        if (!window) {
            return null
        }

        let {taskStore} = me,
            task        = taskStore.get(id);

        if (task) {
            task.minimized = false
        } else {
            taskStore.add({color: record.color, iconCls: record.iconCls, id, text: record.text})
        }

        me.bringToFront(id);
        window.hidden && window.show();

        return window
    }

    /**
     * Ends every open at once, as a sign-out does: loads in flight create no window, the tasks clear, and every window
     * hides without animation. The windows are kept for the next open.
     */
    reset() {
        let me = this;

        me.#resets++;
        me.taskStore.clear();
        me.#created.forEach(window => {window.hidden || window.hide(false)})
    }

    /**
     * Gives each window the z-index of its place in the stack; a window already at its place is left alone
     */
    #restack() {
        let {baseZIndex} = this;

        this.#stack.forEach((window, index) => {
            let zIndex = baseZIndex + index + 1;

            if (window.style?.zIndex !== zIndex) {
                window.style = {...window.style, zIndex}
            }
        })
    }

    /**
     * Shows a minimized app's window again, or brings a visible one to the front
     * @param {String} appId
     */
    restore(appId) {
        let me     = this,
            window = me.#created.get(appId);

        if (window) {
            if (window.hidden) {
                let task = me.taskStore.get(appId);

                task && (task.minimized = false);
                me.bringToFront(appId);
                window.show()
            } else {
                me.bringToFront(appId)
            }
        }
    }
}

export default Neo.setupClass(WindowManager);
