import Neo             from '../Neo.mjs';
import Base            from './Base.mjs';
import * as core       from '../core/_export.mjs';
import Application     from '../controller/Application.mjs';
import Instance        from '../manager/Instance.mjs';
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
                'setConfigs'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {String} workerId='app'
         * @protected
         */
        workerId: 'app'
    }

    /**
     * @member {Object|null} data=null
     * @protected
     */
    data = null
    /**
     * @member {Boolean} isUsingViewModels=false
     * @protected
     */
    isUsingViewModels = false
    /**
     * We are storing the params of insertThemeFiles() calls here, in case the method does get triggered
     * before the json theme structure got loaded.
     * @member {Array[]} themeFilesCache=[]
     * @protected
     */
    themeFilesCache = []

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // convenience shortcuts
        Neo.applyDeltas    = me.applyDeltas   .bind(me);
        Neo.setCssVariable = me.setCssVariable.bind(me)
    }

    /**
     * @param {String} appName
     * @param {Array|Object} deltas
     * @returns {Promise<*>}
     */
    applyDeltas(appName, deltas) {
         return this.promiseMessage('main', {action: 'updateDom', appName, deltas})
    }

    /**
     * Remote method to use inside main threads for creating neo based class instances.
     * Be aware that you can only pass configs which can get converted into pure JSON.
     *
     * Rendering a component into the document.body
     * @example:
     *     Neo.worker.App.createNeoInstance({
     *         ntype     : 'button',
     *         autoMount : true,
     *         autoRender: true
     *         text      : 'Hi Nige!'
     *     }).then(id => console.log(id))
     *
     * Inserting a component into a container
     * @example:
     *     Neo.worker.App.createNeoInstance({
     *         ntype      : 'button',
     *         parentId   : 'neo-container-3',
     *         parentIndex: 0
     *         text       : 'Hi Nige!'
     *     }).then(id => console.log(id))
     *
     * @param {Object} config
     * @param {String} [config.importPath] you can lazy load missing classes via this config. dev mode only.
     * @param {String} [config.parentId] passing a parentId will put your instance into a container
     * @param {Number} [config.parentIndex] if a parentId is passed, but no index, neo will use add()
     * @returns {String} the instance id
     */
    async createNeoInstance(config) {
        if (config.importPath) {
            await import(/* webpackIgnore: true */ config.importPath);
            delete config.importPath
        }

        let appName   = Object.keys(Neo.apps)[0], // fallback in case no appName was provided
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
            config.autoMount  = true;
            config.autoRender = true;

            instance = Neo[config.ntype ? 'ntype' : 'create'](config)
        }

        return instance.id
    }

    /**
     * @param {Object} data
     */
    createThemeMap(data) {
        Neo.ns('Neo.cssMap.fileInfo', true);
        Neo.cssMap.fileInfo = data;
        this.resolveThemeFilesCache()
    }

    /**
     * Remote method to use inside main threads for destroying neo based class instances.
     *
     * @example:
     *     Neo.worker.App.destroyNeoInstance('neo-button-3').then(success => console.log(success))
     *
     * @param {String} id
     * @returns {Boolean} returns true, in case the instance was found
     */
    destroyNeoInstance(id) {
        let instance = Neo.get(id),
            parent;

        if (instance) {
            if (instance.parentId) {
                parent = Neo.getComponent(instance.parentId);

                if (parent) {
                    parent.remove(instance);
                    return true
                }
            }

            instance.destroy(true, true);
            return true
        }

        return false
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
            Neo.apps[port.appName].mainView.fire(eventName, data)
        })
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
            /* webpackExclude: /(?:\/|\\)node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        )
    }

    /**
     * In case you don't want to include prototype based CSS files, use the className param instead
     * @param {String} appName
     * @param {Number} windowId
     * @param {Neo.core.Base} [proto]
     * @param {String} [className]
     */
    insertThemeFiles(appName, windowId, proto, className) {
        if (Neo.config.themes.length > 0) {
            className = className || proto.className;
            //console.log(windowId, className);
            let me       = this,
                lAppName = appName.toLowerCase(),
                cssMap   = Neo.cssMap,
                parent   = proto?.__proto__,
                classPath, classRoot, fileName, mapClassName, ns, themeFolders;

            if (!cssMap) {
                me.themeFilesCache.push([appName, windowId, proto])
            } else {
                // we need to modify app related class names
                if (!className.startsWith('Neo.')) {
                    className = className.split('.');
                    classRoot = className.shift().toLowerCase();

                    className[0] === 'view' && className.shift();

                    mapClassName = `apps.${Neo.apps[appName].appThemeFolder || classRoot}.${className.join('.')}`;
                    className    = `apps.${lAppName}.${className.join('.')}`
                }

                if (parent && parent !== Neo.core.Base.prototype) {
                    if (!Neo.ns(`${windowId}.${parent.className}`, false, cssMap)) {
                        me.insertThemeFiles(appName, windowId, parent)
                    }
                }

                themeFolders = Neo.ns(mapClassName || className, false, cssMap.fileInfo);
                //console.log(cssMap);
                if (themeFolders && !Neo.ns(`${windowId}.${className}`, false, cssMap)) {
                    classPath = className.split('.');
                    fileName  = classPath.pop();
                    classPath = classPath.join('.');
                    ns        = Neo.ns(`${windowId}.${classPath}`, true, cssMap);

                    ns[fileName] = true;

                    Neo.main.addon.Stylesheet.addThemeFiles({
                        appName,
                        className: mapClassName || className,
                        folders  : themeFolders,
                        windowId
                    })
                }
            }
        }
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
        let me       = this,
            {config} = Neo,
            app, path;

        if (data) {
            me.data = data;
            config.resourcesPath = data.resourcesPath
        }

        path = me.data.path;

        if (config.environment !== 'development') {
            path = path.startsWith('/') ? path.substring(1) : path
        }

        me.importApp(path).then(module => {
            app = module.onStart();

            // short delay to ensure Component Controllers are ready
            config.hash && setTimeout(() => {
                HashHistory.push(config.hash);
                // apps which will get created later must not use outdated hash values
                delete config.hash
            }, 5)
        })
    }

    /**
     * Fire event on all apps
     * @param {Object} data
     * @param {Number} data.angle
     * @param {String} data.layout landscape|portrait
     * @param {Number} data.type landscape-primary|landscape-secondary|portrait-primary|portrait-secondary
     */
    onOrientationChange(data) {
        Object.values(Neo.apps).forEach(app => {
            app.fire('orientationchange', data.data)
        })
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let config = Neo.config,
            {data} = msg,
            url    = 'resources/theme-map.json';

        Neo.windowConfigs = Neo.windowConfigs || {};

        Neo.windowConfigs[data.windowId] = data;

        if (config.environment === 'development') {
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
     * @param {Object} data
     */
    onWindowPositionChange(data) {
        this.fireMainViewsEvent('windowPositionChange', data.data)
    }

    /**
     * Only needed for SharedWorkers
     * @param {String} appName
     */
    registerApp(appName) {
        // register the name as fast as possible
        this.onRegisterApp({ appName });
        this.sendMessage('main', {action: 'registerAppName', appName})
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
     */
    setConfigs(data) {
        let instance = Neo.get(data.id);

        if (instance) {
            delete data.id;
            instance.set(data);

            return true
        }

        return false
    }

    /**
     * @param {Object} data
     * @param {String} data.key
     * @param {String} [data.priority] optionally pass 'important'
     * @param {String} data.theme=Neo.config.themes[0]
     * @param {String} data.value
     * @returns {Promise<any>}
     */
    setCssVariable(data) {
        let addon = Neo.main?.addon?.Stylesheet,
            theme = Neo.config.themes?.[0];

        if (!addon) {
            return Promise.reject('Neo.main.addon.Stylesheet not imported')
        } else {
            if (theme.startsWith('neo-')) {
                theme = theme.substring(4)
            }

            return addon.setCssVariable({theme, ...data})
        }
    }
}

export default Neo.setupClass(App);
