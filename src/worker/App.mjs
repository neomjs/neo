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

    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.App'
         * @protected
         */
        className: 'Neo.worker.App',
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
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.applyDeltas = this.applyDeltas.bind(this); // convenience shortcut
    }

    /**
     * @param {String} appName
     * @param {Array|Object} deltas
     * @returns {Promise<*>}
     */
    applyDeltas(appName, deltas) {
         return this.promiseMessage('main', {
            action: 'updateDom',
            appName,
            deltas
        });
    }

    /**
     * @param {Object} data
     */
    createThemeMap(data) {
        Neo.ns('Neo.cssMap.fileInfo', true);
        Neo.cssMap.fileInfo = data;
        this.resolveThemeFilesCache();
    }

    /**
     * Only needed for the SharedWorkers context
     * @param {String} eventName
     * @param {Object} data
     */
    fireMainViewsEvent(eventName, data) {
        this.ports.forEach(port => {
            Neo.apps[port.appName].mainViewInstance.fire(eventName, data);
        });
    }

    /**
     * @param {String} path
     * @returns {Promise}
     */
    importApp(path) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4);
        }

        return import(
            /* webpackInclude: /[\\\/]app.mjs$/ */
            /* webpackExclude: /[\\\/]node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        );
    }

    /**
     * In case you don't want to include prototype based CSS files, use the className param instead
     * @param {String} appName
     * @param {Neo.core.Base} [proto]
     * @param {String} [className]
     */
    insertThemeFiles(appName, proto, className) {
        if (Neo.config.themes.length > 0) {
            className = className || proto.className;

            let me       = this,
                lAppName = appName.toLowerCase(),
                cssMap   = Neo.cssMap,
                parent   = proto?.__proto__,
                classPath, classRoot, fileName, mapClassName, ns, themeFolders;

            if (!cssMap) {
                me.themeFilesCache.push([appName, proto]);
            } else {
                // we need to modify app related class names
                if (!className.startsWith('Neo.')) {
                    className = className.split('.');
                    classRoot = className.shift().toLowerCase();

                    className[0] === 'view' && className.shift();

                    mapClassName = `apps.${Neo.apps[appName].appThemeFolder || classRoot}.${className.join('.')}`;
                    className    = `apps.${lAppName}.${className.join('.')}`;
                }

                if (parent && parent !== Neo.core.Base.prototype) {
                    if (!Neo.ns(`${lAppName}.${parent.className}`, false, cssMap)) {
                        me.insertThemeFiles(appName, parent);
                    }
                }

                themeFolders = Neo.ns(mapClassName || className, false, cssMap.fileInfo);

                if (themeFolders && !Neo.ns(`${lAppName}.${className}`, false, cssMap)) {
                    classPath = className.split('.');
                    fileName  = classPath.pop();
                    classPath = classPath.join('.');
                    ns        = Neo.ns(`${lAppName}.${classPath}`, true, cssMap);

                    ns[fileName] = true;

                    Neo.main.addon.Stylesheet.addThemeFiles({
                        appName,
                        className: mapClassName || className,
                        folders  : themeFolders
                    });
                }
            }
        }
    }

    /**
     * Every dom event will get forwarded as a worker message from main and ends up here first
     * @param {Object} data useful event properties, differs for different event types. See Neo.main.DomEvents.
     */
    onDomEvent(data) {
        DomEventManager.fire(data);
    }

    /**
     * Every URL hash-change will create a post message in main and end up here first.
     * @param {Object} data parsed key-value pairs for each hash value
     */
    onHashChange(data) {
        HashHistory.push(data.data);
    }

    /**
     * The starting point for apps
     * @param {Object} data
     */
    onLoadApplication(data) {
        let me     = this,
            config = Neo.config,
            path;

        if (data) {
            me.data = data;
            config.resourcesPath = data.resourcesPath;
        }

        path = me.data.path;

        if (config.environment !== 'development') {
            path = path.startsWith('/') ? path.substring(1) : path;
        }

        me.importApp(path).then(module => {
            module.onStart();

            // short delay to ensure Component Controllers are ready
            config.hash && setTimeout(() => HashHistory.push(config.hash), 5);
        });
    }

    /**
     * @param {Object} msg
     */
    onRegisterNeoConfig(msg) {
        super.onRegisterNeoConfig(msg);

        let config = Neo.config,
            url    = `resources/theme-map${config.useCssVars ? '' : '-no-vars'}.json`;

        if (config.environment === 'development') {
            url = `../../${url}`;
        }

        if (config.workerBasePath?.includes('node_modules')) {
            url = `../../${url}`;
        }

        if (url[0] !== '.') {
            url = `./${url}`;
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {this.createThemeMap(data)});

        config.remotesApiUrl  && import('../remotes/Api.mjs').then(module => module.default.load());
        !config.useVdomWorker && import('../vdom/Helper.mjs');
    }

    /**
     * @param {Object} msg
     */
    onRegisterPort(msg) {
        let me   = this,
            port = msg.transfer;

        port.onmessage = me.onMessage.bind(me);

        me.channelPorts[msg.origin] = port;
    }

    /**
     * @param {Object} data
     */
    onWindowPositionChange(data) {
        this.fireMainViewsEvent('windowPositionChange', data.data);
    }

    /**
     * Only needed for SharedWorkers
     * @param {String} appName
     */
    registerApp(appName) {
        // register the name as fast as possible
        this.onRegisterApp({ appName });

        this.sendMessage('main', {
            action: 'registerAppName',
            appName
        });
    }

    /**
     * Unregister the app from the CSS map
     * Only needed for SharedWorkers
     * @param {String} appName
     */
    removeAppFromThemeMap(appName) {
        delete Neo.cssMap[appName.toLowerCase()];
    }

    /**
     * @private
     */
    resolveThemeFilesCache() {
        let me = this;

        me.themeFilesCache.forEach(item => {
            me.insertThemeFiles(...item);
        });

        me.themeFilesCache = [];
    }
}

Neo.applyClassConfig(App);

let instance = Neo.create(App);

Neo.applyToGlobalNs(instance);

export default instance;
