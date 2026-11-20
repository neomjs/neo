import BaseContainer             from '../container/Base.mjs';
import ClassSystemUtil           from '../util/ClassSystem.mjs';
import Launcher                  from './Launcher.mjs';
import Taskbar                   from './Taskbar.mjs';
import Tasks                     from './store/Tasks.mjs';
import WindowManager             from './WindowManager.mjs';
import {isDescriptor, mergeFrom} from '../core/ConfigSymbols.mjs';

/**
 * @summary A web desktop in one component: the workspace with the app launcher, the taskbar below it, and the app
 * windows, which open over the workspace and stay inside it.
 *
 * It creates and owns a `Neo.desktop.WindowManager` ({@link #windowManager}). An app opens from the launcher, from the
 * start menu or through {@link #openApp}; a click on its task restores its window or brings it to the front; and the
 * container's destroy takes the windows along. A consumer that signs users out ends every open at once with
 * `windowManager.reset()`.
 *
 * {@link #appStore} feeds the launcher, the start menu and the window manager, whose filter decides which apps may
 * keep a window open. Without an apps store the workspace stays empty. The windows are {@link #windowClass}, loaded
 * on the first open: each grows out of its app's launcher icon, stays inside the workspace when dragged or resized and
 * when the workspace changes size (`Neo.dialog.Base#keepInBoundary`), and names this container its `parentComponent`,
 * so its state provider continues into the container's.
 *
 * Its items are a map, so a consumer adds to them by key, e.g. a side panel beside the launcher:
 * `items: {workspace: {items: {panel: {module: MyPanel, weight: 20}}}}`. The launcher and the taskbar take their configs
 * from {@link #launcherConfig} and {@link #taskbarConfig}, the taskbar's own items included.
 * @class Neo.desktop.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.desktop.Container'
         * @protected
         */
        className: 'Neo.desktop.Container',
        /**
         * The apps, e.g. a `Neo.desktop.store.Apps`: one store for the launcher, the start menu and the window
         * manager. The container never destroys it.
         * @member {Neo.data.TreeStore|null} appStore_=null
         * @reactive
         */
        appStore_: null,
        /**
         * Each app window's own config, by app id, over the one every app window gets: its size, for example, and
         * `view`, the app's content as a class or a loader. A loader runs on the app's first open, and the view fills
         * the window. An app without an entry opens the window class as it is.
         * @example
         * appWindowConfigs: {
         *     mail: {height: 600, width: 880, view: () => import('./apps/Mail.mjs')}
         * }
         * @member {Object|null} appWindowConfigs=null
         */
        appWindowConfigs: null,
        /**
         * @member {String[]} baseCls=['neo-desktop','neo-container']
         * @protected
         */
        baseCls: ['neo-desktop', 'neo-container'],
        /**
         * @member {Object} items
         */
        items: {
            [isDescriptor]: true,
            clone         : 'deep',
            merge         : 'deep',
            value         : {
                workspace: {
                    module: BaseContainer,
                    cls   : ['neo-desktop-workspace'],
                    flex  : 1,
                    layout: {ntype: 'hbox', align: 'stretch'},
                    weight: 10,
                    items : {
                        launcher: {
                            [mergeFrom]: 'launcherConfig',
                            weight     : 10
                        }
                    }
                },
                taskbar: {
                    [mergeFrom]: 'taskbarConfig',
                    weight     : 20
                }
            }
        },
        /**
         * The launcher's config, merged deep into the shipped one
         * @member {Object} launcherConfig_
         * @reactive
         */
        launcherConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                module          : Launcher,
                autoDestroyStore: false,
                flex            : 1,
                listeners       : {openApp: 'up.onLauncherOpenApp'},
                store           : '@config:appStore'
            }
        },
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * The taskbar's config, merged deep into the shipped one, e.g. `{items: {account: {module: MyChip, weight: 40}}}`
         * @member {Object} taskbarConfig_
         * @reactive
         */
        taskbarConfig_: {
            [isDescriptor]: true,
            merge         : 'deep',
            value         : {
                module   : Taskbar,
                appStore : '@config:appStore',
                flex     : 'none',
                taskStore: '@config:taskStore'
            }
        },
        /**
         * The open apps. Without one the container creates a `Neo.desktop.store.Tasks`, and it destroys only a store
         * it created.
         * @member {Neo.data.Store|null} taskStore_=null
         * @reactive
         */
        taskStore_: null,
        /**
         * Child viewport URL for app windows that can leave this desktop during a header drag.
         * An app can override it through its `appWindowConfigs` entry.
         * @member {String|null} tearOutUrl=null
         */
        tearOutUrl: null,
        /**
         * The class of the app windows, or an async loader of it: `Neo.desktop.AppWindow` by default, loaded on the
         * first open (`Neo.desktop.WindowManager#windowClass`)
         * @member {Neo.dialog.Base|Function} windowClass=() => import('./AppWindow.mjs')
         */
        windowClass: () => import('./AppWindow.mjs')
    }

    /**
     * The tasks store the container created, which it destroys
     * @member {Neo.data.Store|null} #createdTaskStore=null
     */
    #createdTaskStore = null
    /**
     * Opens the app windows and keeps them in step with the tasks store. The container creates it once its items exist.
     * @member {Neo.desktop.WindowManager|null} windowManager=null
     */
    windowManager = null

    /**
     * Triggered after the appStore config got changed. The construction hands the store to its items instead.
     * @param {Neo.data.TreeStore|null} value
     * @param {Neo.data.TreeStore|null} oldValue
     * @protected
     */
    afterSetAppStore(value, oldValue) {
        let me = this;

        if (me.windowManager) {
            me.getItem('launcher').store  = value;
            me.getItem('taskbar').appStore = value;
            me.windowManager.appStore      = value
        }
    }

    /**
     * Triggered after the taskStore config got changed. The construction hands the store to its items instead.
     * @param {Neo.data.Store} value
     * @param {Neo.data.Store} oldValue
     * @protected
     */
    afterSetTaskStore(value, oldValue) {
        let me = this;

        if (me.windowManager) {
            me.getItem('taskbar').taskStore = value;
            me.windowManager.taskStore      = value
        }
    }

    /**
     * Creates a `Neo.desktop.store.Tasks` when none is given, and destroys a replaced store it created
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetTaskStore(value, oldValue) {
        let me    = this,
            store = ClassSystemUtil.beforeSetInstance(value, Tasks);

        oldValue && oldValue === me.#createdTaskStore && oldValue.destroy();

        me.#createdTaskStore = store !== value ? store : null;

        return store
    }

    /**
     * Destroys the window manager first, which destroys the windows, then a tasks store the container created
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.windowManager?.destroy();
        me.#createdTaskStore?.destroy();

        super.destroy(...args)
    }

    /**
     * The config of an app's window: the desktop's own, then the app's {@link #appWindowConfigs} entry, whose `view`
     * becomes the window's content once a loader resolves it
     * @param {Neo.desktop.model.App} record
     * @returns {Promise<Object>}
     * @protected
     */
    async getWindowConfig(record) {
        let me                   = this,
            launcher             = me.getItem('launcher'),
            workspaceId          = me.getItem('workspace').id,
            icon                 = launcher.store.get(record.id),
            {view, ...appConfig} = me.appWindowConfigs?.[record.id] || {},
            config               = {
                animateTargetId      : icon ? launcher.getItemId(icon) : null,
                appName              : me.appName,
                boundaryContainerId  : workspaceId,
                keepInBoundary       : true,
                parentComponent      : me,
                record,
                resizablePluginConfig: {boundaryContainerId: workspaceId},
                tearOutUrl           : me.tearOutUrl,
                windowId             : me.windowId,
                ...appConfig
            };

        if (Neo.isFunction(view) && !view.isClass) {
            let module = await view();

            view = module.default || module
        }

        if (view) {
            config.items = [{module: view, flex: 1}]
        }

        return config
    }

    /**
     * Creates the window manager once the launcher and the workspace exist
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.windowManager = Neo.create(WindowManager, {
            appStore    : me.appStore,
            taskStore   : me.taskStore,
            windowClass : me.windowClass,
            windowConfig: record => me.getWindowConfig(record)
        })
    }

    /**
     * @param {Object}                data
     * @param {Neo.desktop.model.App} data.record
     */
    onLauncherOpenApp({record}) {
        this.openApp(record)
    }

    /**
     * A start menu calls it for a chosen app (`Neo.desktop.model.App#handler`)
     * @param {Neo.desktop.model.App} record The start menu's copy of the app
     */
    onStartMenuAppChoose(record) {
        this.openApp(record)
    }

    /**
     * A minimized window shows again, a visible one comes to the front
     * @param {Object}                 data
     * @param {Neo.desktop.model.Task} data.record
     */
    onTaskItemClick({record}) {
        this.windowManager.restore(record.id)
    }

    /**
     * Opens an app's window, or brings it back if it is open already, and lists the app in the taskbar. A start menu
     * hands over its own copy of the app, so the window gets the apps store's record.
     * @param {Neo.desktop.model.App} record
     * @returns {Promise<Neo.dialog.Base|null>} null when the open ended (`Neo.desktop.WindowManager#openApp`)
     */
    openApp(record) {
        return this.windowManager.openApp(this.appStore?.get(record.id) || record)
    }
}

export default Neo.setupClass(Container);
