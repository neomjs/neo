import Base                  from '../core/Base.mjs';
import * as core             from '../core/_export.mjs';
import Observable            from '../core/Observable.mjs';
import ClassHierarchyManager from '../manager/ClassHierarchy.mjs';
import Message               from './Message.mjs';
import RemoteMethodAccess    from './mixin/RemoteMethodAccess.mjs';

/**
 * The abstract base class for e.g. the App, Data & VDom worker
 * @class Neo.worker.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @mixes Neo.worker.mixin.RemoteMethodAccess
 * @abstract
 */
class Worker extends Base {
    static config = {
        /**
         * @member {String} className='Neo.worker.Base'
         * @protected
         */
        className: 'Neo.worker.Base',
        /**
         * @member {String[]|Neo.core.Base[]|null} mixins=[Observable,RemoteMethodAccess]
         */
        mixins: [Observable, RemoteMethodAccess]
    }

    /**
     * @member {Object|null} channelPorts=null
     * @protected
     */
    channelPorts = null
    /**
     * Only needed for SharedWorkers
     * @member {Boolean} isConnected=false
     * @protected
     */
    isConnected = false
    /**
     * @member {Boolean} isSharedWorker=false
     * @protected
     */
    isSharedWorker = false
    /**
     * Only needed for SharedWorkers
     * @member {Array|null} ports=null
     */
    ports = null
    /**
     * @member {String|null} workerId=null
     * @protected
     */
    workerId = null

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this,
            gt = globalThis;

        Object.assign(me, {
            channelPorts     : {},
            isSharedWorker   : gt.toString() === '[object SharedWorkerGlobalScope]',
            ports            : [],
            promises         : {},
            remotesToRegister: []
        });

        if (me.isSharedWorker) {
            gt.onconnect = me.onConnected.bind(me)
        } else {
            gt.onmessage = me.onMessage.bind(me)
        }

        Neo.currentWorker   = me;
        Neo.setGlobalConfig = me.setGlobalConfig.bind(me);
        Neo.workerId        = me.workerId
    }

    /**
     * Entry point for dedicated and shared workers
     */
    afterConnect() {}

    /**
     * @param {String} name
     * @returns {Boolean}
     */
    hasWorker(name) {
        switch (name) {
            case 'app':
            case 'data':
            case 'main':
                return true;
            case 'canvas':
                return Neo.config.useCanvasWorker;
            case 'service':
                return Neo.config.useServiceWorker;
            case 'task':
                return Neo.config.useTaskWorker;
            case 'vdom':
                return Neo.config.useVdomWorker;
        }

        return false
    }

    /**
     * @param {Object} opts
     * @returns {Object|null}
     */
    getPort(opts) {
        let returnPort = null,
            hasMatch;

        this.ports.forEach(port => {
            hasMatch = true;

            Object.entries(opts).forEach(([key, value]) => {
                if (value !== port[key]) {
                    hasMatch = false
                }
            });

            if (hasMatch) {
                returnPort = port
            }
        });

        return returnPort
    }

    /**
     * Only relevant for SharedWorkers
     * @param {Object} data
     */
    async onConnect(data) {
        // short delay to ensure app VCs are in place
        await this.timeout(10);

        let {appName, windowId} = data;
        this.fire('connect', {appName, windowId})
    }

    /**
     * Only relevant for SharedWorkers
     * @param {Object} e
     */
    onConnected(e) {
        let me = this,
            id = Neo.getId('port');

        me.isConnected = true;

        me.ports.push({
            appName : null,
            id,
            port    : e.ports[0],
            windowId: null
        });

        me.ports[me.ports.length - 1].port.onmessage = me.onMessage.bind(me);

        // core.Base: initRemote() subscribes to this event for the SharedWorkers context
        me.fire('connected');

        me.sendMessage(id, {action: 'workerConstructed', port: id})

        me.remotesToRegister.forEach(remote => {
            me.sendMessage(id, {action : 'registerRemote', ...remote})
        });

        me.afterConnect()
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (!me.isSharedWorker) {
            me.sendMessage(Neo.config.windowId, {action: 'workerConstructed'});
            me.afterConnect()
        }
    }

    /**
     * Only relevant for SharedWorkers
     * @param {Object} data
     */
    onDisconnect(data) {
        let {appName, windowId} = data;
        this.fire('disconnect', {appName, windowId})
    }

    /**
     * @param {Object} e
     */
    onMessage(e) {
        let me                = this,
            {data}            = e,
            {action, replyId} = data,
            promise;

        if (!action) {
            throw new Error('Message action is missing: ' + data.id)
        }

        if (action !== 'reply') {
            me['on' + Neo.capitalize(action)](data);
        } else if (promise = action === 'reply' && me.promises[replyId]) {
            if (data.reject) {
                promise.reject(data.data)
            } else {
                promise.resolve(data.data)
            }

            delete me.promises[replyId]
        }
    }

    /**
     * @param {Object} msg
     */
    onPing(msg) {
        this.resolve(msg, {originMsg: msg})
    }

    /**
     * Only relevant for SharedWorkers
     * @param {Object} msg
     * @param {String} msg.appName
     */
    onRegisterApp(msg) {
        let me        = this,
            {appName} = msg,
            port;

        for (port of me.ports) {
            if (!port.appName) {
                port.appName = appName;
                me.onConnect({appName, windowId: port.windowId});
                break
            }
        }
    }

    /**
     * Handles the initial registration of the `Neo.config` for this worker's realm.
     * Triggered when receiving a worker message with `{action: 'registerNeoConfig'}` from the Main Thread's `Neo.worker.Manager`.
     * This method is primarily responsible for setting the initial global `Neo.config` object in this worker's scope
     * upon its creation. It also handles associating `windowId` with `MessagePort`s for Shared Workers.
     *
     * @param {Object} msg The incoming message object.
     * @param {Object} msg.data The initial global Neo.config data object.
     * @param {String} msg.data.windowId The unique ID of the window/tab.
     */
    onRegisterNeoConfig({data}) {
        Neo.ns('Neo.config', true);

        for (const port of this.ports) {
            if (!port.windowId) {
                port.windowId = data.windowId;
                break
            }
        }

        Neo.merge(Neo.config, data)
    }

    /**
     * Handles runtime updates to the global `Neo.config` for this worker's realm.
     * This method is triggered when receiving a worker message with `{action: 'setNeoConfig'}`
     * from the Main Thread's `Neo.worker.Manager`. This message signifies a global config change
     * that originated either from this worker's Main Thread or was broadcast from another
     * connected browser window via a Shared Worker.
     *
     * It merges the incoming configuration changes into this worker's local `Neo.config`
     * and fires a local `neoConfigChange` event, allowing other instances within this worker
     * to react to the updated configuration.
     *
     * @param {Object} msg The destructured arguments from the message payload.
     * @param {Object} msg.config The partial or full `Neo.config` object to merge.
     */
    onSetNeoConfig({config}) {
        let me = this;

        Neo.merge(Neo.config, config);

        me.fire('neoConfigChange', config)
    }

    /**
     * @param {String} dest app, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Promise<any>}
     */
    promiseMessage(dest, opts, transfer) {
        let me = this;

        return new Promise(function(resolve, reject) {
            let message = me.sendMessage(dest, opts, transfer),
                msgId   = message?.id;

            if (!msgId) {
                // a window got closed and the message port no longer exist (SharedWorkers)
                reject()
            } else {
                me.promises[msgId] = {reject, resolve}
            }
        })
    }

    /**
     * @param {String} dest app, canvas, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Neo.worker.Message}
     * @protected
     */
    sendMessage(dest, opts, transfer) {
        if (dest === 'main' && this.isSharedWorker && opts.action !== 'registerRemote') {
            console.warn('sendMessage destination "main" is deprecated. Use a windowId instead.', opts)
        }

        opts.destination = dest;

        let me = this,
            message, port, portObject;

        if (me.channelPorts[dest]) {
            port = me.channelPorts[dest]
        } else if (!me.isSharedWorker) {
            port = globalThis
        } else {
            // Check if dest is a direct target (Window ID or Port ID)
            portObject = me.getPort({windowId: dest}) || me.getPort({id: dest});

            if (portObject) {
                port      = portObject.port;
                opts.port = portObject.id
            } else if (opts.port) {
                port = me.getPort({id: opts.port}).port
            } else if (opts.windowId) {
                portObject = me.getPort({windowId: opts.windowId});
                port       = portObject?.port;

                opts.port = portObject?.id
            }  else if (opts.appName) {
                portObject = me.getPort({appName: opts.appName});
                port       = portObject?.port;

                opts.port = portObject?.id
            } else {
                port = me.ports[0].port
            }
        }

        if (port) {
            message = new Message(opts);
            port.postMessage(message, transfer);
        }

        return message
    }

    /**
     * Initiates a global Neo.config change from a worker's context.
     * This method is exposed globally as `Neo.setGlobalConfig` within each worker realm.
     *
     * It orchestrates the propagation of the config change to the Main Thread
     * and, if a Shared Worker is active, across all connected browser windows,
     * ensuring a single, consistent Neo.config state everywhere.
     *
     * You can pass a partial config object to update specific keys.
     * For nested objects, Neo.mjs performs a deep merge.
     *
     * @param {Object} config The partial or full Neo.config object with changes to apply.
     */
    setGlobalConfig(config) {
        const
            me        = this,
            {Manager} = Neo.worker; // Remote access proxy object

        // Apply the config change locally to this worker's Neo.config and
        // trigger its local change events immediately. This ensures immediate
        // feedback and an updated state for the worker that initiated the change.
        me.onSetNeoConfig({config});

        if (me.isSharedWorker) {
            // This block executes when the calling worker instance is a Shared Worker.
            // This happens if `Neo.config.useSharedWorkers` is true, meaning App, VDom,
            // Data, Canvas, and Task workers are all SharedWorker instances.
            // This Shared Worker (the one where setGlobalConfig was called) acts as the
            // central point to inform all connected Main Threads (browser windows).
            me.ports.forEach((port, index) => {
                // Send the config change to each connected Main Thread.
                // The `broadcast` flag is crucial here for the *receiving* Main Thread:
                // - `broadcast: true` (for the first port/Main Thread in the list): This Main Thread
                //   will apply the config locally and is then responsible for propagating it to *all*
                //   its own associated Shared Workers connected to that Main Thread),
                //   **excluding the worker that originated this change**.
                // - `broadcast: false` (for all other ports/Main Threads): These Main Threads
                //   will simply apply the config locally and stop. They are passive recipients
                //   of the broadcast, synchronizing their state without initiating further actions back.
                // The `excludeOrigin` parameter ensures the originating worker doesn't receive a redundant broadcast.
                Manager.setNeoConfig({broadcast: index < 1, config, excludeOrigin: me.workerId, windowId: port.windowId})
            })
        } else {
            // This Dedicated Worker (the one where setGlobalConfig was called) informs
            // its single, connected Main Thread. The Main Thread will then:
            // 1. Apply the config locally.
            // 2. Broadcast this change to *all* other Dedicated Workers connected to
            //    *that same Main Thread*, **excluding the sender worker itself**.
            Manager.setNeoConfig({broadcast: true, config, excludeOrigin: me.workerId})
        }
    }
}

export default Neo.setupClass(Worker);
