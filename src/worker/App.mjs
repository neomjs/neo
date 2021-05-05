import Neo             from '../Neo.mjs';
import Base            from './Base.mjs';
import * as core       from '../core/_export.mjs';
import DomEventManager from '../manager/DomEvent.mjs';
import Instance        from '../manager/Instance.mjs';
import Application     from '../controller/Application.mjs';
import HashHistory     from '../util/HashHistory.mjs';

/**
 * The App worker contains most parts of the framework as well as all apps which get created.
 * See the tutorials for further infos.
 * @class Neo.worker.App
 * @extends Neo.worker.Base
 * @singleton
 */
class App extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.worker.App'
         * @protected
         */
        className: 'Neo.worker.App',
        /**
         * @member {String} ntype='app-worker'
         * @protected
         */
        ntype: 'app-worker',
        /**
         * @member {Object|null} data=null
         * @protected
         */
        data: null,
        /**
         * @member {Boolean} isUsingViewModels=false
         * @protected
         */
        isUsingViewModels: false,
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
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        fetch('../../resources/theme-map.json')
            .then(response => response.json())
            .then(data => {this.createThemeMap(data)});
    }

    /**
     *
     * @param {JSON} data
     */
    createThemeMap(data) {
        Neo.ns('Neo.cssMap.fileInfo', true);
        Neo.cssMap.fileInfo = data;
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
     *
     * @param {String} path
     * @returns {Promise}
     */
    importApp(path) {
        if (path.endsWith('.mjs')) {
            path = path.slice(0, -4);
        }

        return import(
            /* webpackInclude: /\/app.mjs$/ */
            /* webpackExclude: /\/node_modules/ */
            /* webpackMode: "lazy" */
            `../../${path}.mjs`
        );
    }

    /**
     *
     * @param {String} appName
     * @param {Neo.core.Base} proto
     */
    insertThemeFiles(appName, proto) {
        let me        = this,
            lAppName  = appName.toLowerCase(),
            className = proto.className,
            cssMap    = Neo.cssMap,
            parent    = proto.__proto__,
            classPath, fileName, mapClassName, ns, themeFolders;

        if (!cssMap) {
            throw new Error('theme-map.json did not get loaded', me);
        }

        // we need to modify app related class names
        if (!className.startsWith('Neo.')) {
            className = className.split('.');
            className.shift();

            if (className[0] === 'view') {
                className.shift();
            }

            mapClassName = `apps.${Neo.apps[appName].appThemeFolder || lAppName}.${className.join('.')}`;
            className    = `apps.${lAppName}.${className.join('.')}`;
        }

        if (parent !== Neo.core.Base.prototype) {
            if (!Neo.ns(`${lAppName}.${parent.className}`, false, cssMap)) {
                me.insertThemeFiles(appName, parent);
            }
        }

        themeFolders = Neo.ns(mapClassName || className, false, cssMap.fileInfo);

        if (themeFolders) {
            if (!Neo.ns(`${lAppName}.${className}`, false, cssMap)) {
                classPath = className.split('.');
                fileName  = classPath.pop();
                classPath = classPath.join('.');
                ns        = Neo.ns(`${lAppName}.${classPath}`, true, cssMap);

                ns[fileName] = true;

                Neo.main.addon.Stylesheet.addThemeFiles({
                    appName  : appName,
                    className: mapClassName || className,
                    folders  : themeFolders
                });
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
        let me = this,
            path;

        if (data) {
            me.data = data;
            Neo.config.resourcesPath = data.resourcesPath;
        }

        path = me.data.path;

        if (Neo.config.environment !== 'development') {
            path = path.startsWith('/') ? path.substring(1) : path;
        }

        me.importApp(path).then(module => {
            module.onStart();

            if (Neo.config.hash) {
                // short delay to ensure Component Controllers are ready
                setTimeout(() => HashHistory.push(Neo.config.hash), 5);
            }
        });
    }

    /**
     *
     * @param {Object} data
     */
    onWindowPositionChange(data) {
        this.fireMainViewsEvent('windowPositionChange', data.data);
    }

    /**
     * Only needed for SharedWorkers
     * @param {String} name
     */
    registerApp(name) {
        let me = this;

        me.ports.forEach(port => {
            if (!port.appName) {
                port.appName = name;

                me.onConnect({
                    appName: name
                });

                me.sendMessage('main', {
                    action :'registerAppName',
                    appName: name
                });
            }
        });
    }
}

Neo.applyClassConfig(App);

let instance = Neo.create(App);

Neo.applyToGlobalNs(instance);

export default instance;