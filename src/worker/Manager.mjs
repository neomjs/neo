import Base               from '../core/Base.mjs';
import DomAccess          from '../main/DomAccess.mjs';
import DomEvents          from '../main/DomEvents.mjs';
import Message            from './Message.mjs';
import Observable         from '../core/Observable.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

const NeoConfig = Neo.config,
      devMode   = NeoConfig.environment === 'development';

/**
 * The worker manager lives inside the main thread and creates the App, Data & VDom worker.
 * Also, responsible for sending messages from the main thread to the different workers.
 * @class Neo.worker.Manager
 * @extends Neo.core.Base
 * @singleton
 */
class Manager extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.Manager'
         * @protected
         */
        className: 'Neo.worker.Manager',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Number} activeWorkers=0
         * @protected
         */
        activeWorkers: 0,
        /**
         * @member {String[]} appNames=[]
         * @protected
         */
        appNames: [],
        /**
         * The base path for the worker file URLs, can e.g. get set inside the index.html.
         * @member {String|null} basePath=Neo.config.workerBasePath || 'worker/'
         * @protected
         */
        basePath: NeoConfig.workerBasePath || 'worker/',
        /**
         * @member {Number} constructedThreads=0
         * @protected
         */
        constructedThreads: 0,
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[Observable, RemoteMethodAccess]
         */
        mixins: [Observable, RemoteMethodAccess],
        /**
         * True in case the current browser supports window.SharedWorker.
         * @member {Boolean} sharedWorkersEnabled=false
         * @protected
         */
        sharedWorkersEnabled: false,
        /**
         * Internal flag to stop the worker communication in case their creation fails
         * @member {Boolean} stopCommunication=false
         * @protected
         */
        stopCommunication: false,
        /**
         * True in case the current browser supports window.Worker.
         * The neo.mjs framework is not able to run without web workers.
         * @member {Boolean} sharedWorkersEnabled=false
         * @protected
         */
        webWorkersEnabled: false,
        /**
         * Using the current timestamp as an unique window identifier
         * @member {Number} windowId=new Date().getTime()
         * @protected
         */
        windowId: new Date().getTime(),
        /**
         * Contains the fileNames for the App, Data & Vdom workers
         * @member {Object} workers
         * @protected
         */
        workers: {
            app: {
                fileName: devMode ? 'App.mjs'    : 'appworker.js'
            },
            canvas: {
                fileName: devMode ? 'Canvas.mjs' : 'canvasworker.js'
            },
            data: {
                fileName: devMode ? 'Data.mjs'   : 'dataworker.js'
            },
            task: {
                fileName: devMode ? 'Task.mjs'   : 'taskworker.js'
            },
            vdom: {
                fileName: devMode ? 'VDom.mjs'   : 'vdomworker.js'
            }
        }
    }

    /**
     * navigator.serviceWorker.controller can be null in case we load a page for the first time
     * or in case of a force refresh.
     * See: https://www.w3.org/TR/service-workers/#navigator-service-worker-controller
     * Only in this case main.addon.ServiceWorker will store the active registration once ready here.
     * @member {ServiceWorker|null} serviceWorker=null
     */
    serviceWorker = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.detectFeatures();

        !Neo.insideWorker && me.createWorkers();

        Neo.workerId = 'main';

        me.promises = {};

        me.on({
            'message:addDomListener'    : {fn: DomEvents.addDomListener,       scope: DomEvents},
            'message:getOffscreenCanvas': {fn: DomAccess.onGetOffscreenCanvas, scope: DomAccess},
            'message:readDom'           : {fn: DomAccess.onReadDom,            scope: DomAccess},
            'message:registerRemote'    : {fn: me.onRegisterRemote,            scope: me},
            'message:workerConstructed' : {fn: me.onWorkerConstructed,         scope: me}
        })
    }

    /**
     * Sends a message to each worker defined inside the this.workers config.
     * @param {Object} msg
     */
    broadcast(msg) {
        Object.keys(this.workers).forEach(name => {
            if (!(
                name === 'canvas' && !NeoConfig.useCanvasWorker ||
                name === 'task'   && !NeoConfig.useTaskWorker   ||
                name === 'vdom'   && !NeoConfig.useVdomWorker
            )) {
                this.sendMessage(name, msg)
            }
        });
    }

    /**
     * Creates a web worker using the passed options as well as adding error & message event listeners.
     * @param {Object} opts
     * @returns {SharedWorker|Worker}
     */
    createWorker(opts) {
        let me         = this,
            {fileName} = opts,
            filePath   = (opts.basePath || me.basePath) + fileName,
            name       = `neomjs-${fileName.substring(0, fileName.indexOf('.')).toLowerCase()}-worker`,
            isShared   = me.sharedWorkersEnabled && NeoConfig.useSharedWorkers,
            cls        = isShared ? SharedWorker : Worker,
            worker     = devMode  // todo: switch to the new syntax to create a worker from a JS module once browsers are ready
                ? new cls(filePath, {name: name, type: 'module'})
                : new cls(filePath, {name: name});

        (isShared ? worker.port : worker).onmessage = me.onWorkerMessage.bind(me);
        (isShared ? worker.port : worker).onerror   = me.onWorkerError  .bind(me);

        me.activeWorkers++;

        return worker
    }

    /**
     * Calls createWorker for each worker inside the this.workers config.
     */
    createWorkers() {
        let me                   = this,
            config               = Neo.clone(NeoConfig, true),
            {hash, href, search} = location,
            {windowId}           = me,
            key, value;

        // remove configs which are not relevant for the workers scope
        delete config.cesiumJsToken;

        // pass the initial hash value as Neo.configs
        if (hash) {
            config.hash = {
                hash      : DomEvents.parseHash(hash.substring(1)),
                hashString: hash.substring(1),
                windowId
            }
        }

        config.url = {href, search};

        for ([key, value] of Object.entries(me.workers)) {
            if (key === 'canvas' && !config.useCanvasWorker ||
                key === 'task'   && !config.useTaskWorker   ||
                key === 'vdom'   && !config.useVdomWorker
            ) {
                continue
            }

            try {
                value.worker = me.createWorker(value)
            } catch (e) {
                document.body.innerHTML = e;
                me.stopCommunication = true;
                break
            }

            me.sendMessage(key, {
                action: 'registerNeoConfig',
                data  : {...config, windowId}
            })
        }
    }

    /**
     *
     */
    detectFeatures() {
        let me = this;

        NeoConfig.hasMouseEvents = matchMedia('(pointer:fine)').matches;
        NeoConfig.hasTouchEvents = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

        if (window.Worker) {
            me.webWorkersEnabled = true
        } else {
            throw new Error('Your browser does not support Web Workers')
        }

        if (window.SharedWorker) {
            me.sharedWorkersEnabled = true
        }
    }

    /**
     * @param {String|Worker} name
     * @returns {Worker}
     */
    getWorker(name) {
        if (name === 'service') {
            return navigator.serviceWorker?.controller || this.serviceWorker
        }

        return name instanceof Worker ? name : this.workers[name].worker
    }

    /**
     * @param {String} path
     */
    loadApplication(path) {
        this.sendMessage('app', {
            action       : 'loadApplication',
            path,
            resourcesPath: NeoConfig.resourcesPath
        })
    }

    /**
     * @param {Object} data
     */
    onWorkerConstructed(data) {
        let me = this;

        me.constructedThreads++;

        if (me.constructedThreads === me.activeWorkers) {
            // better safe than sorry => all remotes need to be registered
            NeoConfig.appPath && me.timeout(NeoConfig.loadApplicationDelay).then(() => {
                me.loadApplication(NeoConfig.appPath)
            })
        }
    }

    /**
     * Handler method for worker error events
     * @param {Object} e
     */
    onWorkerError(e) {
        // starting a worker from a JS module will show JS errors in a correct way
        !devMode && console.log('Worker Error:', e)
    }

    /**
     * Handler method for worker message events
     * @param {Object} e
     */
    onWorkerMessage(e) {
        let me       = this,
            {data}   = e,
            transfer = null,
            promise;

        const {action, destination: dest, replyId} = data;

        // console.log('Main: Incoming Worker message: ' + data.origin + ':' + action, data);

        me.fire('message:'+action, data);

        if (action === 'reply') {
            promise = me.promises[replyId];

            if (!promise) {
                if (data.data) {
                    data.data.autoMount  && me.fire('automount',  data);
                    data.data.updateVdom && me.fire('updateVdom', data);

                    // we want to delay the message until the rendering queue has processed it
                    // see: https://github.com/neomjs/neo/issues/2864
                    me.promiseForwardMessage(data).then(msgData => {
                        me.sendMessage(msgData.destination, msgData)
                    })
                }
            } else {
                if (data.destination === 'main') {
                    data = data.data
                }

                promise[data.reject ? 'reject' : 'resolve'](data);
                delete me.promises[replyId]
            }
        }

        if (dest !== 'main' && action !== 'reply') {
            if (data.transfer) {
                transfer = [data.transfer]
            }

            me.promiseMessage(dest, data, transfer).then(response => {
                me.sendMessage(response.destination, response)
            }).catch(err => {
                me.sendMessage(data.origin, {
                    action : 'reply',
                    reject : true,
                    replyId: data.id,
                    error  : err.message
                })
            })
        }

        // only needed for SharedWorkers
        else if (dest === 'main' && action === 'registerAppName') {
            let {appName} = data;

            me.appNames.push(appName);

            me.broadcast({action: 'registerApp', appName})
        }

        else if (dest === 'main' && action === 'remoteMethod') {
            me.onRemoteMethod(data)
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.replyId
     * @returns {Promise<any>}
     */
    promiseForwardMessage(data) {
        return new Promise((resolve, reject) => {
            this.promises[data.replyId] = {data, reject, resolve}
        })
    }

    /**
     * @param {String} dest app, canvas, data or vdom
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Promise<any>}
     */
    promiseMessage(dest, opts, transfer) {
        let me = this;

        return new Promise((resolve, reject) => {
            let message = me.sendMessage(dest, opts, transfer),
                msgId   = message.id;

            me.promises[msgId] = {reject, resolve}
        })
    }

    /**
     * @param {String} replyId
     */
    resolveDomOperationPromise(replyId) {
        if (replyId) {
            let {promises} = this,
                promise    = promises[replyId];

            if (promise) {
                promise.resolve(promise.data);
                delete promises[replyId]
            }
        }
    }

    /**
     * @param {String} dest app, canvas, data or vdom
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Neo.worker.Message}
     * @protected
     */
    sendMessage(dest, opts, transfer) {
        let me = this,
            message, worker;

        if (!me.stopCommunication) {
            if (opts.channelPort) {
                worker = opts.channelPort;
                delete opts.channelPort
            } else {
                worker = me.getWorker(dest)
            }

            if (!worker) {
                throw new Error('Called sendMessage for a worker that does not exist: ' + dest)
            }

            opts.destination = dest;

            message = new Message(opts);

            (worker.port ? worker.port : worker).postMessage(message, transfer);
            return message
        }
    }
}

export default Neo.setupClass(Manager);
