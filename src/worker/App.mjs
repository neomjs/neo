import Neo             from '../Neo.mjs';
import Base            from './Base.mjs';
import Application     from '../controller/Application.mjs';
import InstanceManager from '../manager/Instance.mjs';
import DomEventManager from '../manager/DomEvent.mjs';
import HashHistory     from '../util/HashHistory.mjs';

/**
 * The App worker contains most parts of the framework as well as all apps which get created.
 * See the tutorials for further infos.
 * @class Neo.worker.App
 * @extends Neo.worker.Base
 * @singleton
 */
class App extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.App'
         * @protected
         */
        className: 'Neo.worker.App',
        /**
         * @member {Number} countLoadingThemeFiles_=0
         * @reactive
         */
        countLoadingThemeFiles_: 0,
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            main: [
                'createNeoInstance',
                'destroyNeoInstance',
                'fireEvent',
                'getConfigs',
                'loadModule',
                'setConfigs',
                'setGlobalConfig' // points to worker.Base: setGlobalConfig()
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * We are storing the params of insertThemeFiles() calls here, in case the method does get triggered
     * before the json theme structure got loaded.
     * @member {Array[]} themeFilesCache=[]
     * @protected
     */
    themeFilesCache = []
    /**
     * @member {String} workerId='app'
     * @protected
     */
    workerId = 'app'

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Neo.apps       ??= {};
        Neo.appsByName ??= {};

        // convenience shortcuts
        Neo.applyDeltas    = me.applyDeltas   .bind(me);
        Neo.setCssVariable = me.setCssVariable.bind(me)
    }

    /**
     * Triggered after the countLoadingThemeFiles config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetCountLoadingThemeFiles(value, oldValue) {
        if (value === 0 && oldValue !== undefined) {
            this.fire('themeFilesLoaded')
        }
    }

    /**
     * @param {String} windowId
     * @param {Array|Object} deltas
     * @returns {Promise<*>}
     */
    applyDeltas(windowId, deltas) {
        if (!Array.isArray(deltas)) {
            deltas = [deltas]
        }

        return this.promiseMessage(windowId, {action: 'updateVdom', deltas})
    }

    /**
     * Remote method to use inside main threads for creating neo based class instances.
     * Be aware that you can only pass configs which can get converted into pure JSON.
     *
     * Mounting a component into the document.body
     * @example:
     *     Neo.worker.App.createNeoInstance({
     *         ntype        : 'button',
     *         autoInitVnode: true,
     *         autoMount    : true,
     *         text         : 'Hi Nige!'
     *     }).then(result => console.log(result.id))
     *
     * Inserting a component into a container
     * @example:
     *     Neo.worker.App.createNeoInstance({
     *         ntype      : 'button',
     *         parentId   : 'neo-container-3',
     *         parentIndex: 0
     *         text       : 'Hi Nige!'
     *     }).then(result => console.log(result.id))
     *
     * @param {Object} config
     * @param {String} [config.importPath] you can lazy load missing classes via this config. dev mode only.
     * @param {String} [config.parentId] passing a parentId will put your instance into a container
     * @param {Number} [config.parentIndex] if a parentId is passed, but no index, neo will use add()
     * @returns {Object}
     */
    async createNeoInstance(config) {
        try {
            if (config.importPath) {
                await import(/* webpackIgnore: true */ config.importPath);
                delete config.importPath
            }

            let appName   = Object.values(Neo.apps)[0]?.name, // fallback in case no appName was provided
                Container = Neo.container?.Base,
                index, instance, parent;

            config = {appName, ...config};

            if (config.parentId) {
                parent = Neo.getComponent(config.parentId);

                if (Container && parent && parent instanceof Container) {
                    index = config.parentIndex;

                    delete config.parentId;
                    delete config.parentIndex;

                    if (Neo.isNumber(index)) {
                        instance = parent.insert(index, config)
                    } else {
                        instance = parent.add(config)
                    }
                }
            } else {
                // default parentId='document.body' => we want it to get shown
                config.autoInitVnode = true;
                config.autoMount     = true;

                instance = Neo[config.ntype ? 'ntype' : 'create'](config)
            }

            return {success: true, id: instance.id}
        } catch (error) {
            console.error('Error in createNeoInstance:', error);
            return {success: false, error: {className: error.name, message: error.message, stack: error.stack}}
        }
    }

    /**
     * @param {Object} data
     */
    createThemeMap(data) {
        Neo.ns('Neo.cssMap.fileInfo', true);
        Neo.cssMap.fileInfo = data;

        let {config} = Neo;

        if (config.useSSR && config.cssMap) {
            Object.assign(Neo.cssMap, config.cssMap);
            delete config.cssMap
        }

        this.resolveThemeFilesCache()
    }

    /**
     * Remote method to use inside main threads for destroying neo based class instances.
     *
     * @example:
     *     Neo.worker.App.destroyNeoInstance('neo-button-3').then(result => console.log(result.success))
     *
     * @param {String} id
     * @returns {Object} returns true, in case the instance was found
     */
    destroyNeoInstance(id) {
        try {
            let instance = Neo.get(id),
                parent;

            if (instance) {
                if (instance.parentId) {
                    parent = Neo.getComponent(instance.parentId);

                    if (parent) {
                        parent.remove(instance);
                        return {success: true}
                    }
                }

                instance.destroy(true, true);
                return {success: true}
            }

            return {success: false, error: {message: `Instance with id ${id} not found`}};
        } catch (error) {
            console.error(`Error in destroyNeoInstance for id: ${id}`, error);
            return {success: false, error: {className: error.name, message: error.message, stack: error.stack}}
        }
    }

    /**
     * Fires a custom event based on core.Observable on any app realm based Neo instance from main
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.name
     */
    fireEvent(data) {
        let instance = Neo.get(data.id),
            name;

        if (instance) {
            name = data.name;

            delete data.id;
            delete data.name;

            instance.fire(name, data);

            return true
        }

        return false
    }

    /**
     * Only needed for the SharedWorkers context
     * @param {String} eventName
     * @param {Object} data
     */
    fireMainViewsEvent(eventName, data) {
        this.ports.forEach(port => {
            if (port.windowId && Neo.apps[port.windowId]) {
                Neo.apps[port.windowId].mainView.fire(eventName, data)
            }
        })
    }

    /**
     * Convenience shortcut to lazy-load main thread addons, in case they are not imported yet
     * @param {String} name
     * @param {String} windowId
     * @returns {Promise<Neo.main.addon.Base>} The namespace of the addon to use via remote method access
     */
    async getAddon(name, windowId) {
        let addon = Neo.main?.addon?.[name];

        if (!addon) {
            await Neo.Main.importAddon({name, windowId});
            addon = Neo.main.addon[name]
        }

        return addon
    }

    /**
     * Get configs of any app realm based Neo instance from main
     * @param {Object} data
     * @param {String} data.id
     * @param {String|String[]} data.keys
     * Returns an array of configs if a keys array was passed.
     * Returns the value of a given config directly, in case no array was passed
     * Returns false, in case no instance got found.
     * @returns {*}
     */
    getConfigs(data) {
        let instance    = Neo.get(data.id),
            {keys}      = data,
            returnArray = [];

        if (instance) {
            if (!Array.isArray(keys)) {
                return instance[keys]
            }

            keys.forEach(key => {
                returnArray.push(instance[key])
            });

            return returnArray
        }

        return false
    }

    /**
     * @param {String} path
     * @returns {Promise}
     */
    importApp(path) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4)
        }

        return import(
            /* webpackInclude: /(?:\/|\\)app.mjs$/ */
            /* webpackExclude: /(?:\/|\\)(dist|node_modules)/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        )
    }

    /**
     * In case you don't want to include prototype based CSS files, use the className param instead
     * @param {String} windowId
     * @param {Neo.core.Base} [proto]
     * @param {String} [className]
     */
    insertThemeFiles(windowId, proto, className) {
        if (Neo.config.themes.length > 0) {
            className = className || proto.className;

            let me     = this,
                cssMap = Neo.cssMap,
                parent = proto?.__proto__,
                classPath, classRoot, fileName, lClassRoot, mapClassName, ns, themeFolders;

            if (!cssMap) {
                me.themeFilesCache.push([windowId, proto, className])
            } else {
                // we need to modify app related class names
                if (!className.startsWith('Neo.')) {
                    className  = className.split('.');
                    classRoot  = className.shift();
                    lClassRoot = classRoot.toLowerCase();

                    className[0] === 'view' && className.shift();

                    mapClassName = `apps.${Neo.apps[classRoot]?.appThemeFolder || lClassRoot}.${className.join('.')}`;
                    className    = `apps.${lClassRoot}.${className.join('.')}`
                }

                proto?.additionalThemeFiles?.forEach(ns => {
                    me.insertThemeFiles(windowId, null, ns)
                });

                if (parent && parent !== Neo.core.Base.prototype) {
                    if (!Neo.ns(`${windowId}.${parent.className}`, false, cssMap)) {
                        me.insertThemeFiles(windowId, parent)
                    }
                }

                themeFolders = Neo.ns(mapClassName || className, false, cssMap.fileInfo);

                if (themeFolders && !Neo.ns(`${windowId}.${className}`, false, cssMap)) {
                    classPath = className.split('.');
                    fileName  = classPath.pop();
                    classPath = classPath.join('.');
                    ns        = Neo.ns(`${windowId}.${classPath}`, true, cssMap);

                    ns[fileName] = true;

                    me.countLoadingThemeFiles++;

                    Neo.main.addon.Stylesheet.addThemeFiles({
                        className: mapClassName || className,
                        folders  : themeFolders,
                        windowId
                    }).then(() => {
                        me.countLoadingThemeFiles--
                    })
                }
            }
        }
    }

    /**
     * @summary Remotely loads an ES module into the App Worker.
     * @warning For component testing via Playwright ONLY. Do NOT use this in application code.
     * This method relies on dynamic imports that are ignored by webpack and will fail in production builds.
     * @param {Object} data
     * @param {String} data.path The path to the module to load (e.g., '../../src/button/Base.mjs').
     * @returns {Promise<Object>} A promise which resolves to an object like {success: true, path}
     */
    async loadModule({path}) {
        try {
            await import(/* webpackIgnore: true */ path);
            return {success: true, path};
        } catch (error) {
            console.error(`Failed to load module via RMA: ${path}`, error);
            return {success: false, path, error};
        }
    }

    /**
     * @param {Object} data
     */
    async onConnect(data) {
        // short delay to ensure app VCs are in place
        await this.timeout(10);

        let {appName, windowId} = data,
            windowData;

        try {
            windowData = await Neo.Main.getWindowData({windowId})
        } catch (e) {
            console.error('onConnect: getWindowData failed', e)
        }

        this.fire('connect', {appName, windowData, windowId})
    }

    /**
     * Every dom event will get forwarded as a worker message from main and ends up here first
     * @param {Object} data useful event properties, differs for different event types. See Neo.main.DomEvents.
     */
    onDomEvent(data) {
        DomEventManager.fire(data)
    }

    /**
     * Every URL hash-change will create a post message in main and end up here first.
     * @param {Object} data parsed key-value pairs for each hash value
     */
    onHashChange(data) {
        HashHistory.push(data.data)
    }

    /**
     * The starting point for apps
     * @param {Object} data
     */
    onLoadApplication(data) {
        let me        = this,
            {config}  = Neo,
            {appPath} = config;

        if (config.environment !== 'development') {
            appPath = appPath.startsWith('/') ? appPath.substring(1) : appPath
        }

        me.importApp(appPath).then(module => {
            module.onStart();

            // short delay to ensure Component Controllers are ready
            config.hash && me.timeout(5).then(() => {
                HashHistory.push(config.hash);
                // apps which will get created later must not use outdated hash values
                delete config.hash
            })
        })
    }

    /**
     * @param {Object}  msg
     * @param {Object}  msg.data
     * @param {Boolean} msg.data.angle
     * @param {Boolean} msg.data.layout landscape|portrait
     * @param {String}  msg.data.type landscape-primary|landscape-secondary|portrait-primary|portrait-secondary
     * @param {Number}  msg.data.windowId
     */
    onOrientationChange(msg) {
        Neo.apps[data.windowId]?.fire('orientationchange', data.data)
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        if (Neo.config.useSharedWorkers) {
            import('../manager/Window.mjs')
        }

        let {config} = Neo,
            {data}   = msg,
            url      = 'resources/theme-map.json';

        Neo.windowConfigs = Neo.windowConfigs || {};

        Neo.windowConfigs[data.windowId] = data;

        if (config.environment === 'development' || config.environment === 'dist/esm') {
            url = `../../${url}`
        }

        if (config.workerBasePath?.includes('node_modules')) {
            url = `../../${url}`
        }

        if (url[0] !== '.') {
            url = `./${url}`
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {this.createThemeMap(data)});

        config.remotesApiUrl  && import('../remotes/Api.mjs').then(module => module.default.load());
        config.useAiClient    && import('../ai/Client.mjs');
        !config.useVdomWorker && import('../vdom/Helper.mjs')
    }

    /**
     * @param {Object} msg
     */
    onRegisterPort(msg) {
        let me   = this,
            port = msg.transfer;

        port.onmessage = me.onMessage.bind(me);

        me.channelPorts[msg.origin] = port
    }

    /**
     * @param {Object}  msg
     * @param {Object}  msg.data
     * @param {Boolean} msg.data.hidden
     * @param {String}  msg.data.visibilityState
     * @param {Number}  msg.data.windowId
     */
    onVisibilityChange(msg) {
        Neo.apps[msg.data.windowId]?.fire('visibilitychange', msg.data)
    }

    /**
     * @param {Object} data
     * @param {Object} data.data
     */
    onWindowPositionChange({data}) {
        // Only available in shared workers
        Neo.manager.Window?.onWindowPositionChange(data);

        this.fireMainViewsEvent('windowPositionChange', data)
    }

    /**
     * Only needed for SharedWorkers
     * @param {String} appName
     * @param {String} windowId
     */
    registerApp(appName, windowId) {
        // register the name as fast as possible
        this.onRegisterApp({appName});
        this.sendMessage(windowId, {action: 'registerAppName', appName})
    }

    /**
     * Unregister the app from the CSS map
     * Only needed for SharedWorkers
     * @param {String} appName
     */
    removeAppFromThemeMap(appName) {
        delete Neo.cssMap[appName.toLowerCase()]
    }

    /**
     * @private
     */
    resolveThemeFilesCache() {
        let me = this;

        me.themeFilesCache.forEach(item => {
            me.insertThemeFiles(...item)
        });

        me.themeFilesCache = []
    }

    /**
     * Set configs of any app realm based Neo instance from main
     * @param {Object} data
     * @param {String} data.id
     * @returns {Object}
     */
    setConfigs(data) {
        try {
            let instance = Neo.get(data.id);

            if (instance) {
                delete data.id;
                instance.set(data);
                return {success: true}
            }

            return {success: false, error: {message: `Instance with id ${data.id} not found`}}
        } catch (error) {
            console.error(`Error in setConfigs for id: ${data.id}`, error);
            return {success: false, error: {className: error.name, message: error.message, stack: error.stack}}
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.key
     * @param {String} [data.priority] optionally pass 'important'
     * @param {String} data.theme=Neo.config.themes[0]
     * @param {String} data.value
     * @param {String} data.windowId
     * @returns {Promise<any>}
     */
    async setCssVariable(data) {
        let Stylesheet = await this.getAddon('Stylesheet', data.windowId),
            theme      = data.theme || Neo.config.themes?.[0];

        if (theme.startsWith('neo-')) {
            theme = theme.substring(4)
        }

        return Stylesheet.setCssVariable({theme, ...data})
    }
}

export default Neo.setupClass(App);
