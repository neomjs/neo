import Base               from '../core/Base.mjs';
import DomAccess          from '../main/DomAccess.mjs';
import DomEvents          from '../main/DomEvents.mjs';
import Message            from './Message.mjs';
import Observable         from '../core/Observable.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

const NeoConfig    = Neo.config,
      hasJsModules = NeoConfig.environment === 'development' || NeoConfig.environment === 'dist/esm';

// Using ?. since SWs do not exist for http (only https)
navigator.serviceWorker?.addEventListener('controllerchange', function() {
    window.location.reload()
}, {once: true});

/**
 * The worker manager lives inside the main thread and creates the App, Data & VDom worker.
 * Also, responsible for sending messages from the main thread to the different workers.
 * @class Neo.worker.Manager
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @mixes Neo.worker.mixin.RemoteMethodAccess
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
         * @member {Number} constructedThreads=0
         * @protected
         */
        constructedThreads: 0,
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[Observable, RemoteMethodAccess]
         */
        mixins: [Observable, RemoteMethodAccess],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app   : ['setNeoConfig'],
            canvas: ['setNeoConfig'],
            data  : ['setNeoConfig'],
            task  : ['setNeoConfig'],
            vdom  : ['setNeoConfig']
        },
        /**
         * True in case the current browser supports window.SharedWorker.
         * @member {Boolean} sharedWorkersEnabled=false
         * @protected
         */
        sharedWorkersEnabled: false,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
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
         * Using crypto.randomUUID() as a unique window identifier
         * @member {String} windowId=window.__NEO_SSR__?.windowId||crypto.randomUUID()
         * @protected
         */
        windowId: window.__NEO_SSR__?.windowId || crypto.randomUUID(),
        /**
         * Contains the fileNames for the App, Data & Vdom workers
         * @member {Object} workers
         * @protected
         */
        workers: {
            app: {
                fileName: hasJsModules ? 'App.mjs'    : 'appworker.js'
            },
            canvas: {
                fileName: hasJsModules ? 'Canvas.mjs' : 'canvasworker.js'
            },
            data: {
                fileName: hasJsModules ? 'Data.mjs'   : 'dataworker.js'
            },
            task: {
                fileName: hasJsModules ? 'Task.mjs'   : 'taskworker.js'
            },
            vdom: {
                fileName: hasJsModules ? 'VDom.mjs'   : 'vdomworker.js'
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

        Neo.setGlobalConfig = me.setGlobalConfig.bind(me);
        Neo.workerId        = 'main';

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
     * Only sends to workers that are currently active and available.
     * @param {Object} msg             The message payload to broadcast.
     * @param {Object} [excludeOrigin] Optionally pass the origin realm name to exclude from the broadcast.
     */
    broadcast(msg, excludeOrigin) {
        let me = this;

        Object.keys(me.workers).forEach(name => {
            if (name !== excludeOrigin && me.getWorker(name)) {
                me.sendMessage(name, msg)
            }
        })
    }

    /**
     * Creates a web worker using the passed options as well as adding error & message event listeners.
     * @param {Object} opts
     * @returns {SharedWorker|Worker}
     */
    createWorker(opts) {
        let me         = this,
            {fileName} = opts,
            filePath   = (opts.basePath || Neo.config.workerBasePath) + fileName,
            name       = `neomjs-${fileName.substring(0, fileName.indexOf('.')).toLowerCase()}-worker`,
            isShared   = me.sharedWorkersEnabled && NeoConfig.useSharedWorkers,
            cls        = isShared ? SharedWorker : Worker,
            worker     = hasJsModules
                ? new cls(filePath, {name, type: 'module'})
                : new cls(filePath, {name});

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
            ssrData              = window.__NEO_SSR__,
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

            let workerConfig = {...config, windowId};

            if (ssrData && key === 'app') {
                Object.assign(workerConfig, {
                    cssMap : ssrData.cssMap,
                    useSSR: true,
                    vnode : ssrData.vnode
                });

                if (ssrData.hash) {
                    workerConfig.hash = ssrData.hash;
                }
            }

            me.sendMessage(key, {
                action: 'registerNeoConfig',
                data  : workerConfig
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

        // Useful for styling
        document.body.classList.add(NeoConfig.hasMouseEvents ? 'neo-mouse' : 'neo-no-mouse');

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
     *
     */
    loadApplication() {
        this.sendMessage('app', {action: 'loadApplication' })
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
                me.loadApplication()
            })
        }
    }

    /**
     * Handler method for worker error events
     * @param {Object} e
     */
    onWorkerError(e) {
        // starting a worker from a JS module will show JS errors in a correct way
        !hasJsModules && console.log('Worker Error:', e)
    }

    /**
     * Handler method for worker message events
     * @param {Object} event
     */
    onWorkerMessage(event) {
        let me       = this,
            {data}   = event,
            transfer = null,
            promise;

        const {action, destination: dest, replyId} = data;

        me.fire('message:'+action, data);

        if (action === 'reply') {
            promise = me.promises[replyId];

            if (!promise) {
                if (data.data) {
                    data.data.autoMount  && me.fire('automount',  data);
                    data.data.updateVdom && me.fire('updateVdom', data);

                    // We want to delay the message until the rendering queue has processed it
                    // See: https://github.com/neomjs/neo/issues/2864
                    me.promiseForwardMessage(data).then(msgData => {
                        me.sendMessage(msgData.destination, msgData)
                    })
                }
            } else {
                if (dest === 'main') {
                    data = data.data
                }

                if (data) {
                    promise[data.reject ? 'reject' : 'resolve'](data);
                    delete me.promises[replyId]
                }
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
                msgId;

            if (!message) {
                reject(new Error(me.stopCommunication ? 'Communication is stopped.' : `Target worker '${dest}' does not exist.`));
                return
            }

            msgId = message.id;

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
     * @returns {Neo.worker.Message|null}
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

            if (worker) {
                opts.destination = dest;

                message = new Message(opts);

                (worker.port ? worker.port : worker).postMessage(message, transfer);
                return message
            }
        }

        return null
    }

    /**
     * Initiates a global Neo.config change from the Main Thread.
     *
     * This method acts as a proxy, routing the config change request to the App Worker.
     * This design centralizes the complex multi-threaded and multi-window synchronization
     * logic within the App Worker's `setGlobalConfig` method.
     *
     * Developers should typically use `Neo.setGlobalConfig(config)` directly,
     * which will correctly resolve to this proxy when called from the Main Thread.
     *
     * @param {Object} config The partial or full Neo.config object with changes to apply.
     */
    setGlobalConfig(config) {
        // Remotely calls the App Worker's setGlobalConfig method.
        // This ensures all global config changes are processed through the App Worker
        // which contains the centralized multi-window synchronization logic.
        Neo.worker.App.setGlobalConfig(config)
    }

    /**
     * Change Neo.config globally from a worker
     * @param {Object}  data
     * @param {Boolean} data.broadcast
     * @param {Object}  data.config
     * @param {String}  [data.excludeOrigin]
     */
    setNeoConfig({broadcast, config, excludeOrigin}) {
        let me = this;

        Neo.merge(Neo.config, config);

        me.fire('neoConfigChange', config);

        broadcast && me.broadcast({action: 'setNeoConfig', config}, excludeOrigin)
    }
}

export default Neo.setupClass(Manager);
