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
     * Environments {@link #forwardErrorToMainThread} may write into.
     *
     * An ALLOWLIST, deliberately. The first version excluded `dist/production` alone and left
     * `dist/esm` mirroring — a real value a shipped build sets (`esmDistTransforms.mjs`), which
     * {@link #afterSetCountLoadingThemeFiles}'s sibling branch in this same file already knows
     * about. A denylist of shipped environments fails in the shipped direction and does it
     * silently; an allowlist means a new environment gets no mirror until someone decides it
     * should, which is the right default for something that writes into a user's console.
     *
     * Deliberately NOT coupled to `Neo.config.enableLogsInProduction`, which is `util.Logger`'s
     * escape hatch for an application's own logging. This is a diagnostic for a condition the
     * reader did not ask about; turning it on in production is a separate decision from turning
     * application logs back on, and conflating them would grant it by accident.
     * @member {String[]} mirrorEnvironments=['development','dist/development']
     * @static
     * @protected
     */
    static mirrorEnvironments = ['development', 'dist/development']

    /**
     * Re-entrancy latch for {@link #forwardErrorToMainThread}: the mirror runs inside the console
     * interceptor, so anything the send path logs would arrive back through it.
     * @member {Boolean} isForwardingError=false
     * @protected
     */
    isForwardingError = false
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
        Neo.workerId        = me.workerId;

        // Every worker, not only App: the inspector-context gap belongs to SharedWorkers as a class.
        // `forwardErrorToMainThread` declines in dedicated mode, so a non-shared worker installs the
        // interceptor and mirrors nothing.
        me.interceptConsole()
    }

    /**
     * @summary Whether a mirrored error could reach a page at all, independent of any one call.
     *
     * Split out so {@link #interceptConsole} can decline BEFORE serializing: the string is discarded
     * in dedicated mode and in every shipped environment, and five workers now pay for it where one
     * used to. The latch stays inside {@link #forwardErrorToMainThread}, being per-call rather than
     * per-configuration.
     * @returns {Boolean}
     * @protected
     */
    canMirrorErrors() {
        return this.isSharedWorker && this.constructor.mirrorEnvironments.includes(Neo.config.environment)
    }

    /**
     * @summary Renders console arguments into one string, Errors as message plus stack.
     * @param {Array} args
     * @returns {String}
     * @protected
     */
    serializeConsoleArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) {
                return arg.message + '\n' + arg.stack
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg)
                } catch (e) {
                    return String(arg)
                }
            }
            return String(arg)
        }).join(' ')
    }

    /**
     * @summary Mirrors a SharedWorker error into every connected window's console.
     *
     * A SharedWorker's own `console.error` writes to its inspector context, which no page can
     * read — and therefore neither can anything driving a browser. This lives on `worker.Base`
     * rather than on `worker.App` because that is a property of every SharedWorker, and
     * `worker/Manager.mjs` makes all five shared through one `createWorker` path: before the hoist
     * `interceptConsole` existed in exactly one file, so an error raised in Data, VDom, Canvas or
     * Task reached neither the page nor the Neural Link — uninstrumented, not merely un-mirrored.
     *
     * Errors only, and never in production: a diagnostic mirror, not a logging transport.
     * @param {String} message
     * @protected
     */
    forwardErrorToMainThread(message) {
        let me = this;

        // SharedWorker ONLY, because a dedicated worker needs no help: the browser already forwards
        // its console output to the owner document, so mirroring there would double every error.
        // Measured rather than assumed — a Blob worker calling `console.error` reaches
        // `page.on('console')` with no forwarding at all. A SharedWorker instead gets its own
        // inspector context that no page can read, which is the entire gap this closes.
        //
        // Re-entry is guarded rather than merely unlikely: a failed forward must never log, and the
        // send path is free to warn — an unrouted `main` destination warns about its own
        // deprecation, and that warning would arrive back through the interceptor that called us.
        if (me.isForwardingError || !me.canMirrorErrors()) {
            return
        }

        me.isForwardingError = true;

        try {
            // Derived from the class name rather than from a table: `Neo.worker.VDom` yields `VDom`,
            // which no capitalisation of the lowercase `workerId` would produce. Four workers
            // sharing one prefix would make a mirrored line unattributable.
            //
            // Idempotent, because some workers already name themselves inside their own message
            // text (`Data.mjs:237`, `Canvas.mjs:92`). Prefixing unconditionally would render those
            // as "Data Worker: Data Worker: …"; rewriting those four call sites is not this change.
            const prefix = me.className.split('.').pop() + ' Worker: ',
                  value  = message.startsWith(prefix) ? message : prefix + message;

            // Addressed per window, so the deprecated unrouted `main` destination is never used.
            // A window that closed between the error and this call rejects with NEO_DEAD_PORT,
            // which is ordinary teardown; swallowed, never reported.
            me.ports.forEach(({windowId}) => {
                windowId && Neo.Main?.log?.({method: 'error', value, windowId})?.catch?.(Neo.emptyFn)
            })
        } catch (err) {
            // A diagnostic mirror must not become a fault of its own.
        } finally {
            me.isForwardingError = false
        }
    }

    /**
     * Intercepts console output, mirroring errors onto the main thread
     * ({@link #forwardErrorToMainThread}) and forwarding everything to the Neural Link when one is
     * attached.
     *
     * The `Neo.ai?.Client` lookup stays a lazy check rather than becoming an App-worker branch: only
     * the App worker constructs a client today, so it is App-only in effect — but making it
     * structurally App-only would reintroduce the coupling this path exists to remove, where an
     * error could not be observed at all without a Brain runtime.
     */
    interceptConsole() {
        let me = this;

        const types = ['log', 'warn', 'error', 'info'];

        types.forEach(type => {
            const original = console[type];

            console[type] = (...args) => {
                original.apply(console, args);

                // Use the Client singleton if available (lazy check)
                const client  = Neo.ai?.Client,
                      isError = type === 'error',
                      // Not merely "is an error" — "will actually be mirrored", so a configuration
                      // that can never use the string does not build it.
                      mirror  = isError && me.canMirrorErrors();

                // The mirror is deliberately independent of the client: an error must reach the
                // main thread whether or not a Brain runtime is attached.
                if (!client && !mirror) {
                    return
                }

                let message;

                try {
                    message = me.serializeConsoleArgs(args)
                } catch (err) {
                    return
                }

                mirror && me.forwardErrorToMainThread(message);

                if (client) {
                    try {
                        const logEntry = {
                            type,
                            message,
                            timestamp: Date.now(),
                            stack    : isError ? new Error().stack : undefined
                        };

                        if (client.isConnected) {
                            client.sendNotification('console_log', logEntry)
                        } else {
                            // Direct push to Client instance array
                            client.logs.push(logEntry)
                        }
                    } catch (err) {
                        // Prevent infinite loop if logging fails
                    }
                }
            }
        });

        // Intercept unhandled errors
        const originalOnError = globalThis.onerror;

        globalThis.onerror = (msg, url, lineNo, columnNo, error) => {
            const client = Neo.ai?.Client;

            me.forwardErrorToMainThread(error?.stack || msg);

            if (client) {
                const logEntry = {
                    type     : 'error',
                    message  : msg,
                    timestamp: Date.now(),
                    stack    : error?.stack
                };

                if (client.isConnected) {
                    client.sendNotification('console_log', logEntry)
                } else {
                    client.logs.push(logEntry)
                }
            }

            if (originalOnError) {
                return originalOnError(msg, url, lineNo, columnNo, error)
            }

            return false
        }
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
                if (key === 'appName' ? !this.hasPortApp(port, value) : value !== port[key]) {
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
     * @summary Checks one app registration without reducing a multi-app browser window to one scalar owner.
     * @param {Object} portEntry
     * @param {String} appName
     * @returns {Boolean}
     */
    hasPortApp(portEntry, appName) {
        return portEntry.appNames instanceof Set
            ? portEntry.appNames.has(appName)
            : portEntry.appName === appName
    }

    /**
     * @summary Verifies that an async operation still belongs to the exact connected port generation.
     * @param {Object|null} portEntry
     * @param {Object} [identity]
     * @param {String} [identity.appName]
     * @param {String} [identity.windowId]
     * @returns {Boolean}
     */
    isCurrentPort(portEntry, {appName, windowId}={}) {
        return !portEntry || (
            this.ports.includes(portEntry)
            && (!appName  || this.hasPortApp(portEntry, appName))
            && (!windowId || portEntry.windowId === windowId)
        )
    }

    /**
     * Only relevant for SharedWorkers
     * @param {Object} data
     * @param {String} data.appName
     * @param {Object} [data.sourcePort]
     * @param {String} data.windowId
     */
    async onConnect(data) {
        // short delay to ensure app VCs are in place
        await this.timeout(10);

        let {appName, sourcePort, windowId} = data;

        if (!this.isCurrentPort(sourcePort, {appName, windowId})) {
            return
        }

        this.fire('connect', {appName, windowId})
    }

    /**
     * Binds one freshly connected SharedWorker port: registers it, announces `workerConstructed`, and
     * replays every stored `registerRemote` so a window that joins a running worker holds the same remote
     * proxies as the first. The replay is addressed to `main` — the receiving thread accepts a registration
     * only when the destination names it — and routed to exactly this port through `opts.port`; the port
     * has no `windowId` yet, so the port id is the only routing key that exists.
     * Only relevant for SharedWorkers.
     * @param {Object} e
     */
    onConnected(e) {
        let me        = this,
            id        = Neo.getId('port'),
            portEntry = {
                appNames: new Set(),
                id,
                port    : e.ports[0],
                windowId: null
            };

        me.isConnected = true;

        me.ports.push(portEntry);
        portEntry.port.onmessage = event => me.onMessage(event, portEntry);

        // core.Base: initRemote() subscribes to this event for the SharedWorkers context
        me.fire('connected');

        me.sendMessage(id, {action: 'workerConstructed', port: id})

        me.remotesToRegister.forEach(remote => {
            me.sendMessage('main', {action: 'registerRemote', port: id, ...remote})
        });

        me.afterConnect()
    }

    /**
     * @summary Retires one exact SharedWorker port generation and releases its message handler.
     * @param {Object} portEntry
     * @returns {Boolean} True when the entry was live and removed
     */
    removePort(portEntry) {
        const
            me    = this,
            index = me.ports.indexOf(portEntry);

        if (index === -1) {
            return false
        }

        me.ports.splice(index, 1);
        portEntry.port.onmessage = null;
        portEntry.port.close?.();

        Object.entries(me.promises).forEach(([id, promise]) => {
            if (promise.portEntry === portEntry) {
                delete me.promises[id];
                promise.reject(new Error(`Worker port disconnected before reply: ${portEntry.id}`))
            }
        });

        return true
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
     * @param {String} data.appName
     * @param {String} data.windowId
     * @param {Object} [sourcePort]
     */
    onDisconnect(data, sourcePort) {
        let me                  = this,
            {appName, windowId} = data;

        sourcePort ??= me.isSharedWorker ? me.getPort({windowId}) : null;

        if (sourcePort && !me.isCurrentPort(sourcePort, {appName, windowId})) {
            return
        }

        if (me.isSharedWorker && !sourcePort) {
            return
        }

        if (sourcePort?.appNames instanceof Set) {
            sourcePort.appNames.delete(appName);
            sourcePort.appNames.size || me.removePort(sourcePort)
        } else if (sourcePort) {
            me.removePort(sourcePort)
        }

        this.fire('disconnect', {appName, windowId})
    }

    /**
     * @param {Object} e
     * @param {Object} [sourcePort] Exact SharedWorker port entry which delivered the message
     */
    onMessage(e, sourcePort) {
        let me                = this,
            {data}            = e,
            {action, replyId} = data,
            promise;

        if (sourcePort && !me.ports.includes(sourcePort)) {
            return
        }

        if (!action) {
            throw new Error('Message action is missing: ' + data.id)
        }

        if (action !== 'reply') {
            me['on' + Neo.capitalize(action)](data, sourcePort);
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
     * @param {Object} [sourcePort]
     */
    onRegisterApp(msg, sourcePort) {
        let me        = this,
            {appName} = msg,
            port      = sourcePort || me.ports.find(item => (
                item.appNames instanceof Set ? item.appNames.size === 0 : !item.appName
            ));

        if (port && !me.hasPortApp(port, appName)) {
            port.appNames ??= new Set(port.appName ? [port.appName] : []);
            port.appNames.add(appName);
            me.onConnect({appName, sourcePort: port, windowId: port.windowId})
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
     * @param {Object} [sourcePort]
     */
    onRegisterNeoConfig({data}, sourcePort) {
        Neo.ns('Neo.config', true);

        let port = sourcePort || this.ports.find(item => !item.windowId);

        if (port) {
            port.windowId = data.windowId
        }

        if (!Neo.config.windowId) {
            Neo.merge(Neo.config, data)
        }
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
                // A window got closed and its message port no longer exists (SharedWorkers).
                // Typed, so consumers can discriminate expected teardown from real failures
                // (see draggable.DragZone#destroyDragProxy); the message carries the routing
                // context because envelope forwarding may preserve only the string.
                const remote = opts.remoteClassName ? ` ${opts.remoteClassName}.${opts.remoteMethod}` : '';

                reject(Object.assign(
                    new Error(`worker.Base#promiseMessage: no live port for destination "${dest}" (${opts.action}${remote}) — a window closed?`),
                    {code: 'NEO_DEAD_PORT'}
                ))
            } else {
                me.promises[msgId] = {
                    portEntry: message.port ? me.getPort({id: message.port}) : null,
                    reject,
                    resolve
                }
            }
        })
    }

    /**
     * Port resolution for SharedWorkers is a fall-through cascade over the available routing keys:
     * direct dest target (windowId or port id) → opts.port → opts.windowId → opts.appName →
     * last-resort first port (only when no routing key was given at all). A stale key never
     * short-circuits the cascade. When no live port resolves, the message is NOT sent
     * and the return value is `undefined` — callers which require delivery must check it.
     * @param {String} dest app, canvas, data, main or vdom (excluding the current worker)
     * @param {Object} opts configs for Neo.worker.Message
     * @param {Array} [transfer] An optional array of Transferable objects to transfer ownership of.
     * If the ownership of an object is transferred, it becomes unusable (neutered) in the context it was sent from
     * and becomes available only to the worker it was sent to.
     * @returns {Neo.worker.Message|undefined} The sent message, or `undefined` when no live port could be resolved
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

            // Fall through the remaining routing keys on a lookup miss: a stale opts.port
            // (a port which disconnected between message receipt and reply) must not
            // short-circuit the cascade — opts.windowId / opts.appName describe the same
            // logical target and can still resolve its re-registered port.
            if (!portObject && opts.port)     {portObject = me.getPort({id: opts.port})}
            if (!portObject && opts.windowId) {portObject = me.getPort({windowId: opts.windowId})}
            if (!portObject && opts.appName)  {portObject = me.getPort({appName: opts.appName})}

            if (portObject) {
                port      = portObject.port;
                opts.port = portObject.id
            } else if (!opts.port && !opts.windowId && !opts.appName) {
                // Last-resort only when no routing key was given at all: delivering a keyed
                // message to an arbitrary port would misroute it into a foreign window, which
                // loses it just as silently as dropping it.
                portObject = me.ports[0];

                if (portObject) {
                    port      = portObject.port;
                    opts.port = portObject.id
                }
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
