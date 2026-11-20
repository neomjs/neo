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
 * `hide` and `headerAction` events, and its `style.zIndex`. It creates each window hidden and shows it when the open
 * publishes. It keeps its windows, so it creates them with `closeAction: 'hide'`: the close button, Escape and an
 * animated hide all hide the dialog, where a stock dialog would destroy itself. It can restore what it minimizes, so
 * it gives each window the minimize action of its header's vocabulary (`Neo.dialog.Base#getWindowActionMap`).
 *
 * A dialog has one fixed z-index and no order among dialogs, so each manager keeps a stack of the windows it created and
 * sets their z-index from {@link #baseZIndex} up: two desktops on one App worker keep separate orders. A `mousedown` on
 * a window brings it to the front.
 *
 * An open publishes its window and task only while it is current. A reset, a destroy, a close of its app, or an app
 * store that no longer keeps the app ends it, during its load or after.
 *
 * The windows float outside every component tree, so the manager destroys the ones it created, and its tasks go with
 * them.
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
         * and dialogs at 1000, so a taskbar's menu opens above every window.
         * @member {Number} baseZIndex=10
         */
        baseZIndex: 10,
        /**
         * The open apps, one task each, minimized or not, e.g. a `Neo.desktop.store.Tasks`
         * @member {Neo.data.Store|null} taskStore_=null
         * @reactive
         */
        taskStore_: null,
        /**
         * The class of the windows: a `Neo.dialog.Base` subclass, or an async loader such as
         * `() => import('./AppWindow.mjs')`. A loader runs on each app's first open until a load succeeds.
         * @member {Neo.dialog.Base|Function|null} windowClass=null
         */
        windowClass: null,
        /**
         * The config of an app's window, `record => Object`, or a Promise of one, so an app can load its content on
         * its first open: where it animates from, its browser window, its state provider. The manager awaits it with
         * the window class, adds the z-index and listens to the window itself.
         * @member {Function|null} windowConfig=null
         */
        windowConfig: null
    }

    /**
     * Counts each app's closes: an open that began before one publishes nothing
     * @member {Map<String, Number>} #closes
     */
    #closes = new Map()
    /**
     * The windows that exist, by app id
     * @member {Map<String, Neo.dialog.Base>} #created
     */
    #created = new Map()
    /**
     * The minimize actions this manager contributed, by app id
     * @member {Map<String, Neo.component.Base>} #minimizes
     */
    #minimizes = new Map()
    /**
     * Counts resets, a destroy included: an open that began before one publishes nothing
     * @member {Number} #resets=0
     */
    #resets = 0
    /**
     * The windows this manager created, back to front
     * @member {Neo.dialog.Base[]} #stack
     */
    #stack = []
    /**
     * The task records this manager added, by app id. A task store can be shared: the manager touches only these
     * records, never another owner's task under the same key.
     * @member {Map<String, Neo.desktop.model.Task>} #tasks
     */
    #tasks = new Map()
    /**
     * The load in flight per app id, the promise of its window: a second open during a load joins the first
     * @member {Map<String, Promise<Neo.dialog.Base|null>>} #windows
     */
    #windows = new Map()

    /**
     * Whether an open that took its ticket may still publish. A manager being destroyed publishes nothing, so an open
     * a store listener starts during the destroy ends at once.
     * @param {String} appId
     * @param {String} ticket
     * @returns {Boolean}
     */
    #admits(appId, ticket) {
        let me = this;

        return !me.isDestroying && ticket === me.#ticket(appId) && me.#keeps(appId)
    }

    /**
     * Triggered after the appStore config got changed. A new store closes the windows of the apps it does not keep,
     * and one replacing another binds the windows and tasks of the apps it keeps to its own records.
     * @param {Neo.data.TreeStore|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @protected
     */
    afterSetAppStore(value, oldValue) {
        let me = this;

        // on() and un() consume keys like `scope` from the passed object, so each call gets its own
        oldValue && !oldValue.isDestroyed && oldValue.un({filter: me.onAppStoreFilter, scope: me});
        value?.on({filter: me.onAppStoreFilter, scope: me});

        // The construction sets the tasks store after this config
        oldValue !== undefined && value && me.onAppStoreFilter();

        oldValue && value && me.#rebind()
    }

    /**
     * Triggered after the taskStore config got changed. A store replacing another takes over this manager's tasks: each
     * leaves the old store, if it still exists, and comes back in the new one, minimized if its window is hidden. A key
     * another owner's task holds in the new store leaves its window without a task of this manager. Nothing could
     * restore that window from a minimize, so it shows again, as one opened beside another owner's task does.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetTaskStore(value, oldValue) {
        let me     = this,
            appIds = [...me.#tasks.keys()];

        if (!oldValue || !value) {
            return
        }

        // The old store may be gone, its records with it, so a task is rebuilt from its app and its window
        oldValue.isDestroyed || me.#removeTasks(appIds, oldValue);
        me.#tasks.clear();

        appIds.forEach(appId => {
            let window = me.#created.get(appId),
                app    = me.appStore?.get(appId),
                task;

            if (!window) {
                return
            }

            if (!value.get(appId)) {
                task = value.createRecord({
                    color    : app?.color,
                    iconCls  : app?.iconCls,
                    id       : appId,
                    minimized: window.hidden,
                    text     : app?.text
                });

                me.#tasks.set(appId, task);
                value.add(task)
            }

            me.#syncMinimize(appId, window);

            if (!me.#taskOf(appId) && window.hidden) {
                me.bringToFront(appId);
                window.show()
            }
        })
    }

    /**
     * Focuses the app's popup when detached, or draws its window above the others on this desktop.
     * @param {String} appId
     */
    bringToFront(appId) {
        let me     = this,
            stack  = me.#stack,
            window = me.#created.get(appId),
            index  = stack.indexOf(window);

        if (window?.focusTornOutWindow?.()) {
            return
        }

        if (index > -1 && index < stack.length - 1) {
            stack.push(...stack.splice(index, 1));
            me.#restack()
        }
    }

    /**
     * Closes an app's window: its task goes, minimized or not, a visible window hides, and an open still loading ends
     * @param {String} appId
     */
    close(appId) {
        let me     = this,
            window = me.#created.get(appId);

        me.#end(appId);
        me.#removeTasks([appId]);

        window && !window.hidden && window.hide()
    }

    /**
     * Creates an app's window, unless its open ended during the load
     * @param {Object} record The app
     * @param {String} ticket The open's ticket
     * @returns {Promise<Neo.dialog.Base|null>} null when the open ended
     */
    async #createWindow(record, ticket) {
        let me                    = this,
            {id}                  = record,
            [WindowClass, config] = await Promise.all([me.#loadWindowClass(), me.#loadWindowConfig(record)]);

        if (!me.#admits(id, ticket)) {
            return null
        }

        config ||= {};

        // Created hidden, a window shows once its open publishes, and it closes by hiding, since the manager keeps it
        let window = Neo.create(WindowClass, {
            ...config,
            autoShow   : false,
            closeAction: 'hide',
            hidden     : true,
            style      : {...config.style, zIndex: me.baseZIndex + me.#stack.length + 1}
        });

        window.on({
            headerAction: data => me.#onWindowHeaderAction(id, data),
            hide        : ()   => me.#onWindowHide(id)
        });

        window.addDomListeners({mousedown: () => me.bringToFront(id)});

        // Offered before the first render, which then holds it; an open without a task of this manager takes it back
        me.#offerMinimize(id, window);

        me.#created.set(id, window);
        me.#stack.push(window);

        return window
    }

    /**
     * Destroys the windows it created and removes their tasks, and only theirs; a load still running creates none
     * @param {...*} args
     */
    destroy(...args) {
        let me          = this,
            {taskStore} = me;

        me.#resets++;
        me.appStore = null;

        taskStore && !taskStore.isDestroyed && me.#removeTasks();

        me.#created.forEach(window => {window.isDestroyed || window.destroy(true)});
        me.#created.clear();
        me.#minimizes.clear();
        me.#stack.length = 0;
        me.#windows.clear();

        super.destroy(...args)
    }

    /**
     * Ends an app's open: a load in flight creates nothing, and an open that began before publishes nothing
     * @param {String} appId
     */
    #end(appId) {
        let me = this;

        me.#closes.set(appId, (me.#closes.get(appId) || 0) + 1);
        me.#windows.delete(appId)
    }

    /**
     * @param {String} appId
     * @returns {Neo.dialog.Base|null} The app's window, once it exists
     */
    getWindow(appId) {
        return this.#created.get(appId) || null
    }

    /**
     * Whether the app store keeps an app: it holds the app, and its filter keeps it. `TreeStore#isKept()` alone also
     * answers true for a key the store lacks. Without an app store every app is kept.
     * @param {String} appId
     * @returns {Boolean}
     */
    #keeps(appId) {
        let {appStore} = this;

        return !appStore || Boolean(appStore.get(appId)) && appStore.isKept(appId)
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
     * A config callback that throws rejects like one whose promise rejects, so the class load beside it stays observed
     * @param {Object} record The app
     * @returns {Promise<Object|undefined>} The config {@link #windowConfig} gives
     */
    async #loadWindowConfig(record) {
        return this.windowConfig?.(record)
    }

    /**
     * Minimizes an app's window: its task stays, marked minimized, and the window hides
     * @param {String} appId
     */
    minimize(appId) {
        let me     = this,
            task   = me.#taskOf(appId),
            window = me.#created.get(appId);

        if (task && window && !window.hidden) {
            task.minimized = true;
            window.hide()
        }
    }

    /**
     * Gives an app's window the minimize action, a contribution ahead of its header's own actions, unless this manager
     * offered it already. A header that lists minimize itself keeps its own, and one whose vocabulary drops it
     * (`actionMap: {minimize: null}`) gets none.
     * @param {String} appId
     * @param {Neo.dialog.Base} window
     */
    #offerMinimize(appId, window) {
        let me      = this,
            toolbar = window.headerToolbar,
            factory = toolbar?.actionMap?.minimize,
            action;

        if (!me.#minimizes.has(appId) && factory && !toolbar.getAction('minimize')) {
            action = toolbar.addActionContribution(factory());
            action && me.#minimizes.set(appId, action)
        }
    }

    /**
     * Closes the windows this manager created for every app the app store no longer keeps, minimized ones included,
     * removes their tasks, and ends their loads in flight. The windows hide without animation: the app's launcher icon
     * may be gone already. Another owner's tasks on a shared task store stay.
     * @protected
     */
    onAppStoreFilter() {
        let me      = this,
            revoked = [...me.#created.keys()].filter(appId => !me.#keeps(appId));

        // A load in flight has no window yet. Ended now, it stays ended when a later filter keeps the app again.
        [...me.#windows.keys()].forEach(appId => {me.#keeps(appId) || me.#end(appId)});

        me.#removeTasks(revoked);

        revoked.forEach(appId => {
            let window = me.#created.get(appId);

            window.hidden || window.hide(false)
        })
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
        let me   = this,
            task = me.#taskOf(appId);

        task && !task.minimized && me.#removeTasks([appId])
    }

    /**
     * Opens an app's window, or brings it back if it exists, and lists the app as a task. A window that exists opens at
     * once; a new one waits for its load, which a second open joins.
     * @param {Object} record The app: its id, and `text`, `iconCls` and `color` for its task
     * @returns {Promise<Neo.dialog.Base|null>} null when the load failed silently or the open ended
     */
    async openApp(record) {
        let me     = this,
            {id}   = record,
            ticket = me.#ticket(id),
            window = me.#created.get(id);

        if (!window) {
            let windows = me.#windows,
                request = windows.get(id);

            if (!request) {
                let settle;

                // Listed before the loaders run, since they are the consumer's code: one that opens the app joins this
                // open, and one that closes it ends this open, so the next open loads afresh
                request = new Promise((resolve, reject) => {settle = {resolve, reject}});
                windows.set(id, request);
                me.#createWindow(record, ticket).then(settle.resolve, settle.reject)
            }

            // The window lives on in #created, and a failed or ended load leaves nothing to join
            try {
                window = await request
            } finally {
                windows.get(id) === request && windows.delete(id)
            }
        }

        if (!window || !me.#admits(id, ticket)) {
            return null
        }

        let {taskStore} = me,
            task        = me.#taskOf(id);

        if (task) {
            task.minimized = false
        } else if (!taskStore.get(id)) {
            // The record is the manager's before the store announces it: a listener may put another in its place
            task = taskStore.createRecord({color: record.color, iconCls: record.iconCls, id, text: record.text});
            me.#tasks.set(id, task);
            taskStore.add(task)
        }
        // Otherwise another owner's task holds the app's key: the window opens without a task of this manager

        // A store listener may have ended the open during the task's notifications, by a reset, a close or a destroy
        if (!me.#admits(id, ticket)) {
            return null
        }

        me.#syncMinimize(id, window);
        me.bringToFront(id);
        window.hidden && window.show();

        return window
    }

    /**
     * Binds the windows and tasks of the apps the app store keeps to its records, as a replacing store needs: a window
     * with a `record` config, as `Neo.desktop.AppWindow` has, takes the new record, and this manager's task takes its
     * text, icon and colour. A window class without one keeps what its `windowConfig` gave it.
     */
    #rebind() {
        let me = this;

        me.#created.forEach((window, appId) => {
            let record = me.appStore.get(appId),
                task   = me.#taskOf(appId);

            if (record && me.#keeps(appId)) {
                'record' in window && (window.record = record);
                task?.set({color: record.color, iconCls: record.iconCls, text: record.text})
            }
        })
    }

    /**
     * Removes the tasks this manager added for some apps, all of them by default. A record another owner put under the
     * same key stays. The manager lets go of each record before the store removes it, so an open a store listener
     * starts meanwhile adds a task of its own.
     * @param {String[]} [appIds] All the apps this manager listed by default
     * @param {Neo.data.Store} [taskStore=this.taskStore] The store that holds the tasks
     */
    #removeTasks(appIds=[...this.#tasks.keys()], taskStore=this.taskStore) {
        let me    = this,
            tasks = appIds.map(appId => me.#taskOf(appId, taskStore)).filter(Boolean);

        appIds.forEach(appId => {me.#tasks.delete(appId)});

        tasks.length && taskStore.remove(tasks)
    }

    /**
     * Ends every open at once, as a sign-out does: loads in flight create no window, the manager's tasks go, and every
     * window hides without animation. The windows are kept for the next open, and an open after the reset loads afresh.
     */
    reset() {
        let me = this;

        me.#resets++;
        me.#windows.clear();
        me.#removeTasks();
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
     * Shows a minimized app's window again, or brings a visible one to the front. Only an open app restores: a closed
     * one has no task.
     * @param {String} appId
     */
    restore(appId) {
        let me     = this,
            task   = me.#taskOf(appId),
            window = me.#created.get(appId);

        if (task && window) {
            task.minimized = false;
            me.bringToFront(appId);
            window.hidden && window.show()
        }
    }

    /**
     * Keeps the minimize action on an app's window while this manager holds the app's task, and takes its offer back
     * when it does not: a window that opened beside another owner's task has nothing to minimize into.
     * @param {String} appId
     * @param {Neo.dialog.Base} window
     */
    #syncMinimize(appId, window) {
        let me      = this,
            offered = me.#minimizes.get(appId);

        if (me.#taskOf(appId)) {
            me.#offerMinimize(appId, window)
        } else if (offered) {
            window.headerToolbar.removeActionContribution(offered);
            me.#minimizes.delete(appId)
        }
    }

    /**
     * An open's ticket. A reset, a destroy or a close of the app makes it stale.
     * @param {String} appId
     * @returns {String}
     */
    #ticket(appId) {
        return `${this.#resets}/${this.#closes.get(appId) || 0}`
    }

    /**
     * The task this manager added for an app, while the task store still holds that very record
     * @param {String} appId
     * @param {Neo.data.Store} [taskStore=this.taskStore] The store that holds the tasks
     * @returns {Neo.desktop.model.Task|null}
     */
    #taskOf(appId, taskStore=this.taskStore) {
        let task = this.#tasks.get(appId);

        return task && taskStore?.get(appId) === task ? task : null
    }
}

export default Neo.setupClass(WindowManager);
