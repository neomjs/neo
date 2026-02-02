import Base               from '../core/Base.mjs';
import DomAccess          from '../main/DomAccess.mjs';
import DomEvents          from '../main/DomEvents.mjs';
import Message            from './Message.mjs';
import Observable         from '../core/Observable.mjs';
import RemoteMethodAccess from './mixin/RemoteMethodAccess.mjs';

const NeoConfig   = Neo.config,
      useMjsFiles = NeoConfig.environment === 'development' || NeoConfig.environment === 'dist/esm';

// Using ?. since SWs do not exist for http (only https)
navigator.serviceWorker?.addEventListener('controllerchange', function() {
    window.location.reload()
}, {once: true});

/**
 * @summary Orchestrates the multi-threaded worker environment and handles message routing.
 *
 * This class is the central nervous system of the Neo.mjs runtime in the main thread. It is responsible for:
 * 1.  **Worker Creation:** Instantiating the App, Data, VDom, and other workers based on configuration.
 * 2.  **Message Routing:** Acting as the hub for inter-worker communication. While standard messages are routed
 *     via the main thread, this manager also facilitates the initial handshake to establish direct
 *     **MessageChannel** connections between workers (e.g., App <-> Canvas) for high-performance,
 *     bi-directional communication. The VDOM update process is a notable exception, using a triangular
 *     flow (App -> VDom -> Main -> App) by design.
 * 3.  **DOM Update Coordination:** intercepting VDOM update requests and synchronizing them with the
 *     browser's animation frame to ensure smooth rendering. This involves a complex promise-based
 *     mechanism to delay worker replies until the DOM changes are actually painted.
 * 4.  **Configuration Management:** synchronizing `Neo.config` changes across all threads.
 *
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
             * @member {Boolean} applicationLoaded=false
             * @protected
             */
            applicationLoaded: false,
            /**
             * @member {Boolean} constructedThreads=0
             * @protected
             */
            constructedThreads: 0,        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[Observable, RemoteMethodAccess]
         */
        mixins: [Observable, RemoteMethodAccess],
        /**
         * Remote method access for other workers
         * @member {Object} remote
         * @protected
         */
        remote: {
            app   : ['setNeoConfig', 'startWorker'],
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
                fileName: useMjsFiles ? 'App.mjs'    : 'appworker.js'
            },
            canvas: {
                fileName: useMjsFiles ? 'Canvas.mjs' : 'canvasworker.js'
            },
            data: {
                fileName: useMjsFiles ? 'Data.mjs'   : 'dataworker.js'
            },
            task: {
                fileName: useMjsFiles ? 'Task.mjs'   : 'taskworker.js'
            },
            vdom: {
                fileName: useMjsFiles ? 'VDom.mjs'   : 'vdomworker.js'
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
        let me = this;

        me.promises = {};

        super.construct(config);

        me.detectFeatures();

        !Neo.insideWorker && me.createWorkers();

        if (navigator.serviceWorker) {
            // Bind the message handler globally to ensure even "unmanaged" apps (those not using the SW addon)
            // can receive critical recovery commands (like 'reloadWindow') from the Service Worker.
            //
            // CRITICAL: We must bind this even if Neo.config.useServiceWorker is false.
            // Scenario: User visits App A (uses SW), then navigates to App B (no SW). The SW from App A
            // *still controls* App B (if in scope). If App B hits a version mismatch (404), the SW will
            // send a 'reloadWindow' command. App B must be listening to execute this recovery command,
            // otherwise it will crash with a blank page.
            navigator.serviceWorker.onmessage = me.onWorkerMessage.bind(me);
            me.checkServiceWorkerVersion()
        }

        Neo.setGlobalConfig = me.setGlobalConfig.bind(me);
        Neo.workerId        = 'main';

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
     * Proactively checks if the controlling Service Worker's version matches the client's version.
     * This is the primary defense against "Zombie Apps" (stale client code running against a new Service Worker).
     *
     * If a mismatch is detected, it forces a hard reload to fetch fresh assets.
     * Includes a throttle mechanism (via sessionStorage) to prevent infinite reload loops in case of persistent mismatches.
     *
     * @returns {Promise<void>}
     */
    async checkServiceWorkerVersion() {
        if (navigator.serviceWorker?.controller) {
            let swVersion = await this.promiseMessage('service', {
                action: 'getVersion'
            });

            if (swVersion?.version && swVersion.version !== Neo.config.version) {
                const
                    key        = 'neoVersionReload',
                    lastReload = parseInt(sessionStorage.getItem(key) || '0'),
                    now        = Date.now();

                if (now - lastReload < 5000) {
                    console.error('Reload loop detected. Aborting version enforcement.');
                    return
                }

                sessionStorage.setItem(key, String(now));

                console.error(`Version Mismatch! Client: ${Neo.config.version}, SW: ${swVersion.version}. Reloading.`);
                location.reload(true)
            }
        }
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
            worker     = new cls(filePath, {name, type: 'module'});

        (isShared ? worker.port : worker).onmessage = me.onWorkerMessage.bind(me);
        (isShared ? worker.port : worker).onerror   = me.onWorkerError  .bind(me);

        me.activeWorkers++;

        return worker
    }

    /**
     * @summary Instantiates the configured worker threads.
     *
     * This method reads the `Neo.config` to determine which workers to create (App, Data, VDom, etc.)
     * and whether to use `Worker` or `SharedWorker`. It injects the initial configuration and environment
     * data (like window ID) into each worker upon creation.
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

        NeoConfig.devicePixelRatio = window.devicePixelRatio || 1;
        NeoConfig.hasMouseEvents   = matchMedia('(pointer:fine)').matches;
        NeoConfig.hasTouchEvents   = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        NeoConfig.prefersDarkTheme = matchMedia('(prefers-color-scheme: dark)').matches;

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

        const item = this.workers[name];

        if (item) {
            return name instanceof Worker ? name : item.worker
        }

        return null
    }

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    hasWorker(name) {
        return !!this.getWorker(name)
    }

    /**
     * @summary Handles the queuing and processing of DOM update operations.
     *
     * This helper method centralizes the logic for both standard VDOM updates and direct `App.applyDeltas` calls.
     * Its primary purpose is to enforce the **"delayed reply"** pattern:
     * - If the update contains visual changes (deltas), it registers a promise and queues the update for the next animation frame.
     *   The reply to the worker is sent only *after* the main thread has processed the queue, ensuring the DOM is updated.
     * - If the update is a no-op (zero deltas), it sends an immediate reply to avoid unnecessary latency.
     *
     * This method also handles the firing of the `updateVdom` event, which triggers the actual processing in `Main.mjs`.
     *
     * @param {Object} data The message payload from the worker.
     * @param {Object[]} deltas The array of DOM deltas to process.
     * @param {String} replyDest The destination for the reply message (e.g., 'app').
     * @param {Boolean} [forward=false] If true, forwards the original message as the reply (VDOM worker path).
     *                                  If false, constructs a new success reply (App worker path).
     */
    handleDomUpdate(data, deltas, replyDest, forward=false) {
        let me = this;

        if (deltas?.length > 0) {
            me.promiseForwardMessage(data).then(msgData => {
                me.sendMessage(replyDest, forward ? msgData : {action: 'reply', replyId: msgData.id, success: true})
            });

            me.fire('updateVdom', forward ? data : {data, replyId: data.id});
            return
        }

        me.sendMessage(replyDest, forward ? data : {action: 'reply', replyId: data.id, success: true})
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

        // To include the main thread as ready, we must wait for activeWorkers + 1
        if (!me.applicationLoaded && me.constructedThreads === me.activeWorkers + 1) {
            me.applicationLoaded = true;

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
        !useMjsFiles && console.log('Worker Error:', e)
    }

    /**
     * Handler method for worker message events.
     *
     * @summary Intercepts and routes messages from workers.
     *
     * This method contains critical routing logic:
     * 1.  **DOM Update Interception:** It catches `updateVdom` actions (from App) and `reply` messages (from VDom)
     *     that contain DOM updates. It normalizes `autoMount` operations into `insertNode` deltas and delegates
     *     them to `handleDomUpdate`.
     * 2.  **Promise Resolution:** It resolves pending promises for `reply` messages (e.g., remote method calls).
     * 3.  **Message Forwarding:** It routes messages between workers (e.g., App -> Data).
     *
     * @param {Object} event
     */
    onWorkerMessage(event) {
        let me       = this,
            {data}   = event,
            transfer = null,
            promise;

        const {action, destination: dest, replyId} = data;

        me.fire('message:'+action, data);

        if (action === 'updateVdom') {
            data.replyId = data.id;
            me.handleDomUpdate(data, data.deltas, data.origin, false);
            return
        }

        if (action === 'reply') {
            promise = me.promises[replyId];

            if (!promise) {
                let payload = data.data;

                if (payload) {
                    if (payload.autoMount || payload.updateVdom) {
                        let deltas = payload.deltas;

                        if (payload.autoMount) {
                            deltas = [{
                                action   : 'insertNode',
                                index    : payload.parentIndex,
                                outerHTML: payload.outerHTML,
                                parentId : payload.parentId,
                                vnode    : payload.vnode
                            }];

                            payload.deltas = deltas
                        }

                        me.handleDomUpdate(data, deltas, dest, true)
                    } else {
                        me.sendMessage(dest, data)
                    }
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

        if (dest !== 'main' && dest !== me.windowId && action !== 'reply') {
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
        else if ((dest === 'main' || dest === me.windowId) && action === 'registerAppName') {
            let {appName} = data;

            me.appNames.push(appName);

            me.broadcast({action: 'registerApp', appName})
        }

        else if ((dest === 'main' || dest === me.windowId) && action === 'remoteMethod') {
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
                opts.windowId ??= me.windowId;

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

    /**
     * Starts a worker in case it is not running yet
     * @param {Object} data
     * @param {String} data.name
     * @returns {Boolean} true in case the worker was started or is already running
     */
    startWorker({name}) {
        let me = this;

        if (me.hasWorker(name)) {
            return true
        }

        let item = me.workers[name];

        if (!item) {
            console.error(`Worker with name '${name}' is not defined.`);
            return false
        }

        // 1. Update Config (in case it was false)
        let configKey = 'use' + Neo.capitalize(name) + 'Worker';

        if (NeoConfig[configKey] === false) {
            NeoConfig[configKey] = true
        }

        // 2. Create
        item.worker = me.createWorker(item);

        // 3. Register Config
        let config               = Neo.clone(NeoConfig, true),
            {hash, href, search} = location,
            {windowId}           = me;

        delete config.cesiumJsToken;
        config.url = {href, search};

        if (hash) {
            config.hash = {
                hash      : DomEvents.parseHash(hash.substring(1)),
                hashString: hash.substring(1),
                windowId
            }
        }

        let workerConfig = {...config, windowId};

        me.sendMessage(name, {
            action: 'registerNeoConfig',
            data  : workerConfig
        });

        return true
    }
}

export default Neo.setupClass(Manager);
