import Neo           from './Neo.mjs';
import * as core     from './core/_export.mjs';
import DomAccess     from './main/DomAccess.mjs';
import DomEvents     from './main/DomEvents.mjs';
import Observable    from './core/Observable.mjs';
import WorkerManager from './worker/Manager.mjs';

/**
 * @class Neo.Main
 * @extends Neo.core.Base
 * @singleton
 */
class Main extends core.Base {
    static getStaticConfig() {return {
        /**
         * True automatically applies the core/Observable.mjs mixin
         * @member {Boolean} observable=true
         * @static
         */
        observable: true
    }}

    static getConfig() {return {
        /**
         * @member {String} className='Neo.Main'
         * @protected
         */
        className: 'Neo.Main',
        /**
         * @member {String} mode='read'
         * @protected
         */
        mode: 'read',
        /**
         * @member {Object} openWindows={}
         * @protected
         */
        openWindows: {},
        /**
         * @member {Array} readQueue=[]
         * @protected
         */
        readQueue: [],
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'alert',
                'editRoute',
                'getWindowData',
                'setNeoConfig',
                'setRoute',
                'windowClose',
                'windowMoveTo',
                'windowOpen',
                'windowResizeTo'
            ]
        },
        /**
         * @member {Boolean} running=false
         * @protected
         */
        running: false,
        /**
         * @member {Boolean} showFps=false
         */
        showFps: false,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Number} timeLimit=15
         */
        timeLimit: 15,
        /**
         * should be dev only
         * @member {Number} totalFrameCount=0
         * @protected
         */
        totalFrameCount: 0,
        /**
         * @member {Array} updateQueue=[]
         * @protected
         */
        updateQueue: [],
        /**
         * @member {Array} writeQueue=[]
         * @protected
         */
        writeQueue: []
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        WorkerManager.on({
            'automount'        : me.onRender,
            'message:mountDom' : me.onMountDom,
            'message:updateDom': me.onUpdateDom,
            'updateVdom'       : me.onUpdateVdom,
            scope              : me
        });

        DomEvents.on('domContentLoaded', me.onDomContentLoaded, me);

        if (document.readyState !== 'loading') {
            DomEvents.onDomContentLoaded();
        }
    }

    /**
     * Workers can not trigger alert(), so we need remote method access.
     * @param {Object} data
     * @param {String} data.message
     */
    alert(data) {
        alert(data.message);
    }

    /**
     * Edit the location.hash value
     * A value of null will remove the given key.
     * @param {Object} data
     */
    editRoute(data) {
        let hashObj = DomEvents.parseHash(window.location.hash.substr(1)),
            hashArr = [];

        if (typeof data === 'string') {
            data = DomEvents.parseHash(data);
        }

        Object.assign(hashObj, data);

        Object.entries(hashObj).forEach(([key, value]) => {
            if (value !== null) {
                hashArr.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
            }
        });

        window.location.hash = hashArr.join('&');
    }

    /**
     * window.screen is not spreadable
     * @returns {Object}
     */
    getWindowData() {
        let win    = window,
            screen = win.screen;

        return {
            innerHeight: win.innerHeight,
            innerWidth : win.innerWidth,
            outerHeight: win.outerHeight,
            outerWidth : win.outerWidth,
            screen: {
                availHeight: screen.availHeight,
                availLeft  : screen.availLeft,
                availTop   : screen.availTop,
                availWidth : screen.availWidth,
                colorDepth : screen.colorDepth,
                height     : screen.height,
                orientation: {angle: screen.orientation?.angle, type: screen.orientation?.type},
                pixelDepth : screen.pixelDepth,
                width      : screen.width
            },
            screenLeft: win.screenLeft,
            screenTop : win.screenTop,
        };
    }

    // todo: https://developer.mozilla.org/en-US/docs/Web/Events/resize
    globalResizeListener(event) {
        console.log('globalResizeListener', event);
    }

    /**
     *
     */
    async onDomContentLoaded() {
        let me               = this,
            config           = Neo.config,
            mainThreadAddons = config.mainThreadAddons,
            imports          = [],
            modules;

        DomAccess.onDomContentLoaded();

        // not in use right now
        // window.addEventListener('resize', me.globalResizeListener.bind(me));

        // we need different publicPath values for the main thread inside the webpack based dist envs,
        // depending on the hierarchy level of the app entry point
        if (config.environment !== 'development') {
            __webpack_require__.p = config.basePath.substring(6);
        }

        // intended for the online examples where we need an easy way to add GA to every generated app
        if (config.useGoogleAnalytics && !mainThreadAddons.includes('AnalyticsByGoogle')) {
            mainThreadAddons.push('AnalyticsByGoogle');
        }

        if (config.useServiceWorker && !mainThreadAddons.includes('ServiceWorker')) {
            mainThreadAddons.push('ServiceWorker');
        }

        mainThreadAddons.forEach(addon => {
            if (addon.startsWith('WS/')) {
                imports.push(import(`../../../src/main/addon/${addon.substr(3)}.mjs`));
            } else {
                imports.push(import(`./main/addon/${addon}.mjs`));
            }
        });

        modules = await Promise.all(imports);

        me.addon = {};

        modules.forEach(module => {
            me.addon[module.default.constructor.name] = module.default;
        });

        WorkerManager.onWorkerConstructed({
            origin: 'main'
        });
    }

    /**
     * @param {Object} data
     */
    onMountDom(data) {
        this.queueWrite(data);

        WorkerManager.sendMessage(data.origin || 'app', {
            action : 'reply',
            replyId: data.id,
            success: true
        });
    }

    /**
     * @param {Object} data
     */
    onRender(data) {
        data.data.replyId = data.replyId;
        this.queueWrite(data.data);
    }

    /**
     * @param {Object} data
     */
    onUpdateDom(data) {
        this.queueUpdate(data);
    }

    /**
     * @param {Object} data
     */
    onUpdateVdom(data) {
        data.data.replyId = data.replyId;
        this.queueUpdate(data.data);
    }

    /**
     * @param {Object[]} queue
     * @param {Date} start
     * @returns {Number}
     * @protected
     */
    processQueue(queue, start) {
        let me    = this,
            limit = me.timeLimit,
            operation;

        while (operation = queue.shift()) {
            if (new Date() - start > limit) {
                queue.unshift(operation);
                return requestAnimationFrame(me.renderFrame.bind(me));
            } else {
                DomAccess[me.mode](operation);
                WorkerManager.resolveDomOperationPromise(operation.replyId);
            }
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    queueRead(data) {
        let me = this;
        me.readQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    queueUpdate(data) {
        let me = this;
        me.updateQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     * @param data
     * @protected
     */
    queueWrite(data) {
        let me = this;
        me.writeQueue.push(data);

        if (!me.running) {
            me.running = true;
            requestAnimationFrame(me.renderFrame.bind(me));
        }
    }

    /**
     * Triggers the different DOM operation queues
     * @protected
     */
    renderFrame() {
        let me      = this,
            read    = me.readQueue,
            update  = me.updateQueue,
            write   = me.writeQueue,
            reading = me.mode === 'read',
            start   = new Date();

        if (Neo.config.logDeltaUpdates) {
            me.totalFrameCount++;
            console.log('Total Frames: ' + me.totalFrameCount);
        }

        if (reading || !write.length) {
            me.mode = 'read';
            if (me.processQueue(read, start)) {
                return;
            }
        }

        if (update.length) {
            me.mode = 'update';
            if (me.processQueue(update, start)) {
                return;
            }
        }

        if (write.length) {
            me.mode = 'write';
            if (me.processQueue(write, start)) {
                return;
            }
        }

        me.running = false;
    }

    /**
     * Change the location.hash value
     * @param {Object} data
     * @param {String} data.key
     * @param {*} data.value
     */
    setNeoConfig(data) {
        Neo.config[data.key] = data.value;
    }

    /**
     * Change the location.hash value
     * @param {Object} data
     * @param {String} data.value
     */
    setRoute(data) {
        window.location.hash = data.value;
    }

    /**
     * Closes popup windows
     * @param {Object} data
     * @param {Array|String} data.names
     */
    windowClose(data) {
        if (!Array.isArray(data.names)) {
            data.names = [data.names];
        }

        data.names.forEach(name => {
            this.openWindows[name].close();
            delete this.openWindows[name];
        })
    }

    /**
     * Move a popup window
     * @param {Object} data
     * @param {String} data.windowName
     * @param {String} data.x
     * @param {String} data.y
     */
    windowMoveTo(data) {
        this.openWindows[data.windowName].moveTo(data.x, data.y);
    }

    /**
     * Open a new popup window
     * @param {Object} data
     * @param {String} data.url
     * @param {String} data.windowFeatures
     * @param {String} data.windowName
     */
    windowOpen(data) {
        this.openWindows[data.windowName] = window.open(data.url, data.windowName, data.windowFeatures);
    }

    /**
     * Move a popup window
     * @param {Object} data
     * @param {Number} [data.height]
     * @param {Number} [data.width]
     * @param {String} data.windowName
     */
    windowResizeTo(data) {
        let win    = this.openWindows[data.windowName],
            height = data.height || win.outerHeight,
            width  = data.width  || win.outerWidth;

        win.resizeTo(width, height);
    }
}

Neo.applyClassConfig(Main);

let instance = Neo.create(Main);

Neo.applyToGlobalNs(instance);

export default instance;
