import Base                                                    from '../core/Base.mjs';
import ClassSystemUtil                                         from '../util/ClassSystem.mjs';
import ComponentService,   {registerComponentServiceMethods}   from './client/ComponentService.mjs';
import DataService,        {registerDataServiceMethods}        from './client/DataService.mjs';
import DockService,        {registerDockServiceMethods}        from './client/DockService.mjs';
import InstanceService,    {registerInstanceServiceMethods}    from './client/InstanceService.mjs';
import InteractionService, {registerInteractionServiceMethods} from './client/InteractionService.mjs';
import RuntimeService,     {registerRuntimeServiceMethods}     from './client/RuntimeService.mjs';
import {dispatchServiceMethod}                                 from './client/resolveServiceMethod.mjs';
import Socket                                                  from '../data/connection/WebSocket.mjs';
import WindowManager                                           from '../manager/Window.mjs';
import WriteGuard                                              from './WriteGuard.mjs';
import TransactionService                                      from './TransactionService.mjs';
import {parseAgentEnvelope}                                    from './parseAgentEnvelope.mjs';

/**
 * The AI Client hosts the Neural Link API in the App Worker: a registry of six services behind one JSON-RPC
 * dispatcher, plus an optional WebSocket transport to the Neural Link MCP Server. External AI agents reach the
 * dispatcher through that transport; a registry-only test boot reaches it through {@link #handleTestRequest}.
 * @class Neo.ai.Client
 * @extends Neo.core.Base
 * @singleton
 */
class Client extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.Client'
         * @protected
         */
        className: 'Neo.ai.Client',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Add custom configs for data.connection.WebSocket, or pass a module or instance. The default socket retries
         * clean closes too. Explicit `reconnectOnCleanClose: false` ends automatic recovery after a clean code-1000
         * close, including window-return retries: no exhausted cycle is invented. A supplied instance keeps its policy.
         * @member {Object|Neo.data.connection.WebSocket|null} socketConfig=null
         */
        socketConfig: null,
        /**
         * The URL of the Neural Link MCP Server's WebSocket endpoint.
         * @member {String} url='ws://127.0.0.1:8081'
         */
        url: 'ws://127.0.0.1:8081'
    }

    /**
     * When the socket last ran out of reconnect attempts. Null while it is connected or still reconnecting on its own.
     * From then on only {@link #redial} dials, and the failures it meets are no news.
     * @member {Number|null} gaveUpAt=null
     * @protected
     */
    gaveUpAt = null
    /**
     * Whether the current socket opened, so a close can tell a lost connection from a refused dial
     * @member {Boolean} #opened=false
     */
    #opened = false
    /**
     * Console lines logged before the socket opened, flushed by {@link #onSocketOpen}. Null until {@link #connect}
     * starts the transport: a registry-only boot has nothing to flush to.
     * @member {Object[]|null} #logs=null
     */
    #logs = null
    /**
     * The App-worker events this client follows, kept so {@link #destroy} unsubscribes exactly what construct added.
     * @member {Object|null} #workerListeners=null
     */
    #workerListeners = null
    /**
     * JSON-RPC method prefix → service instance, filled by each service's `register*ServiceMethods` at
     * construction; insertion order is the prefix precedence.
     * @member {Object} serviceMap
     * @protected
     */
    serviceMap = null
    /**
     * @member {Object} services=null
     * @protected
     */
    services = null
    /**
     * @member {Neo.data.connection.WebSocket|null} socket=null
     * @protected
     */
    socket = null
    /**
     * The per-heap multi-writer write-lock authority — owns the live held-lock table for this App-Worker heap.
     * One {@link Neo.ai.Client} (a singleton) ⇒ one {@link Neo.ai.WriteGuard} ⇒ the heap's shared write truth, so a
     * write-class service can deny a *different* writer's overlapping subtree write. See {@link Neo.ai.admitWrite}.
     * @member {Neo.ai.WriteGuard|null} writeGuard=null
     * @protected
     */
    writeGuard = null
    /**
     * The per-heap undo authority — the in-heap per-session transaction stack ({@link Neo.ai.TransactionService})
     * that records the *reverse* of each enforcement-granted Neural Link write so an agent can undo it. Sibling to
     * {@link Neo.ai.Client#writeGuard}: one Client ⇒ one stack authority, keyed on the same `(agentId, sessionId)`
     * writer pair, so the lock + undo lifecycles align.
     * @member {Neo.ai.TransactionService|null} transactionService=null
     * @protected
     */
    transactionService = null

    /**
     * True while the socket is open. Read from the socket rather than kept as a flag: a failing socket reports `error`
     * before `close`, and the worker forwards every console line to the bridge while this is true. A stale flag would
     * send a failure's own log through the failed socket, whose `sendMessage()` reconnects, which logs again.
     * @member {Boolean} isConnected
     * @protected
     */
    get isConnected() {
        return this.socket?.socket?.readyState === WebSocket.OPEN
    }

    /**
     * Where `Neo.worker.Base#interceptConsole` puts a line while no socket is open. Without a started transport each
     * read is a fresh array, so the line is dropped instead of kept for a socket that never opens.
     * @member {Object[]} logs
     * @protected
     */
    get logs() {
        return this.#logs ?? []
    }

    /**
     * @summary Builds the registry (write guard, undo stack, six services, prefix map) and the window listeners, but
     * starts no transport: the App boot calls {@link #connect} when `useAiClient` resolves true. Without a socket the
     * listeners stay inert: {@link #redial} needs a socket that gave up, and every send needs an open one.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.writeGuard         = Neo.create(WriteGuard);
        me.transactionService = Neo.create(TransactionService);

        me.services = {
            component  : Neo.create(ComponentService,   {client: me}),
            data       : Neo.create(DataService,        {client: me}),
            dock       : Neo.create(DockService,        {client: me}),
            instance   : Neo.create(InstanceService,    {client: me}),
            interaction: Neo.create(InteractionService, {client: me}),
            runtime    : Neo.create(RuntimeService,     {client: me})
        };

        const {component, data, dock, instance, interaction, runtime} = me.services;

        // Registration order is prefix precedence: the first registered prefix a method starts with wins.
        me.serviceMap = {};

        registerComponentServiceMethods(me.serviceMap, component);
        registerDockServiceMethods(me.serviceMap, dock);
        registerInstanceServiceMethods(me.serviceMap, instance);
        registerDataServiceMethods(me.serviceMap, data);
        registerRuntimeServiceMethods(me.serviceMap, runtime);
        registerInteractionServiceMethods(me.serviceMap, interaction);

        me.#workerListeners = {
            appRegistered   : me.onAppRegistered,
            connect         : me.onAppWorkerWindowConnect,
            disconnect      : me.onAppWorkerWindowDisconnect,
            visibilityChange: me.onWindowVisibilityChange,
            windowFocus     : me.redial,
            scope           : me
        };

        Neo.currentWorker.on(me.#workerListeners)
    }

    /**
     * @summary Starts the transport, a WebSocket to the Neural Link MCP Server. A second call keeps the first socket:
     * recovery belongs to the socket's own reconnect and to {@link #redial}.
     */
    connect() {
        let me = this;

        if (me.socket) {
            return
        }

        me.#logs = [];

        try {
            let url     = new URL(Neo.config.neuralLinkUrl || me.url),
                appName = Neo.config.appName || 'Unknown App';

            if (appName === 'Unknown App' && Neo.config.appPath) {
                let match = Neo.config.appPath.match(/apps\/([^\/]+)\//);

                if (match) {
                    appName = match[1]
                } else {
                    match = Neo.config.appPath.match(/examples\/([^\/]+)\/([^\/]+)\//);
                    if (match) {
                        appName = `Neo.examples.${match[1]}.${match[2]}`
                    }
                }
            }

            url.searchParams.set('appWorkerId', Neo.worker.App.id);
            url.searchParams.set('appName', appName);

            me.socket = ClassSystemUtil.beforeSetInstance(me.socketConfig, Socket, {
                reconnectOnCleanClose: true,
                serverAddress        : url.toString(),
                listeners            : {
                    close          : me.onSocketClose,
                    error          : me.onSocketError,
                    message        : me.onSocketMessage,
                    open           : me.onSocketOpen,
                    reconnectFailed: me.onSocketReconnectFailed,
                    scope          : me
                }
            })
        } catch (e) {
            console.error('Neo.ai.Client: Failed to create WebSocket connection', e)
        }
    }

    /**
     * Destroys what {@link #construct} and {@link #connect} created: the worker subscriptions, the six services, the
     * write guard, the undo stack and a started socket.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        Neo.currentWorker.un(me.#workerListeners);

        Object.values(me.services).forEach(service => service.destroy());
        me.writeGuard.destroy();
        me.transactionService.destroy();
        me.socket?.destroy();

        super.destroy(...args)
    }

    /**
     * Routes a JSON-RPC method to the service that registered its prefix — the central dispatcher for
     * every AI-driven command; the rule lives in {@link Neo.ai.client.resolveServiceMethod}.
     * @param {String} method The JSON-RPC method name
     * @param {Object} params The parameters associated with the method
     * @param {Object} [context] Optional request context (e.g. `{agentId}`) threaded from the
     * agent-message envelope; the write services key topological-lock enforcement on it.
     * @returns {Promise<*>} The result of the operation
     */
    async handleRequest(method, params, context) {
        return dispatchServiceMethod(this.serviceMap, method, params, context)
    }

    /**
     * @summary The test harness's entry to {@link #handleRequest} on a registry-only boot. It refuses before dispatch
     * unless `Neo.config.allowAiClientInTests` is set and the context is a full writer pair, so the null context,
     * which admits a write without a lock, is unreachable from a test.
     * @param {String} method The JSON-RPC method name
     * @param {Object} params The parameters associated with the method
     * @param {Object} context `{agentId, sessionId}`, the shape {@link Neo.ai.parseAgentEnvelope} produces
     * @returns {Promise<*>} The result of the operation
     */
    async handleTestRequest(method, params, context) {
        if (!Neo.config.allowAiClientInTests) {
            throw new Error('Neo.ai.Client: handleTestRequest needs config.allowAiClientInTests')
        }

        if (!this.isWriterPair(context)) {
            throw new Error('Neo.ai.Client: a test request needs a full {agentId, sessionId} writer pair')
        }

        const {agentId, sessionId} = context;

        return this.handleRequest(method, params, {agentId, sessionId})
    }

    /**
     * Announces the window of a non-SharedWorker app that registers after this socket opened. The usual agent
     * flow starts the Neural Link before the page, so the socket opens before `Neo.app()` registers, and
     * {@link #onSocketOpen} announces only the windows that exist at open time. An app registering before the
     * open is that open's to announce; a SharedWorker window arrives through its port's `connect`.
     * @param {Object} data
     * @param {String} data.appName
     * @param {String} data.windowId
     */
    onAppRegistered({appName, windowId}) {
        if (this.#opened && !Neo.worker.App.isSharedWorker && !WindowManager.get(windowId)) {
            this.sendNotification('window_connected', {appName, windowId})
        }
    }

    /**
     * @param {Object} data
     */
    onAppWorkerWindowConnect(data) {
        if (this.isConnected) {
            const
                win                 = WindowManager.get(data.windowId),
                {appName, windowId} = data;

            this.sendNotification('window_connected', {
                appName,
                capabilities: win?.capabilities,
                chrome      : win?.chrome,
                innerRect   : win?.innerRect,
                outerRect   : win?.outerRect,
                windowId
            })
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.windowId
     */
    onAppWorkerWindowDisconnect({windowId}) {
        if (this.isConnected) {
            this.sendNotification('window_disconnected', {windowId})
        }
    }

    /**
     * @summary Release held write locks AND sweep the open transaction for one Bridge-stamped disconnected
     * agent session — both on the same frame, so the lock and transaction lifecycles cannot diverge silently.
     * App-side `agent_disconnected` frames are lifecycle notifications, not JSON-RPC. Require the full
     * `(agentId, sessionId)` writer key before calling {@link Neo.ai.WriteGuard#releaseAgent} +
     * {@link Neo.ai.TransactionService#sweep}; a half-stamped frame is dropped so it can neither release a
     * whole agent (or every agent sharing a session id) nor sweep a transaction stack it cannot key.
     * @param {Object} [frame={}]
     * @param {String} [frame.agentId]
     * @param {String} [frame.sessionId]
     * @returns {{released: Number, swept: Boolean}}
     */
    handleAgentDisconnected(frame = {}) {
        const
            {agentId, sessionId}             = frame,
            {transactionService, writeGuard} = this;

        if (!this.isWriterPair(frame) || !writeGuard) {
            return {released: 0, swept: false}
        }

        // The transaction lifecycle must not outlive the lock lifecycle: release the agent's held write-locks
        // AND sweep its open transaction + undo stack on the same `agent_disconnected` frame — otherwise a
        // disconnect (or worker restart) leaks an open transaction. `sweep` is the transaction-side counterpart
        // to `releaseAgent`; both key on the same `(agentId, sessionId)` pair validated above.
        const {released} = writeGuard.releaseAgent({agentId, sessionId}),
              {swept     = false} = transactionService?.sweep({id: {agentId, sessionId}}) ?? {};

        return {released, swept}
    }

    /**
     * Whether a context carries the full `(agentId, sessionId)` writer pair that the write guard and undo stack key on.
     * @param {Object|null} [context]
     * @returns {Boolean}
     */
    isWriterPair(context) {
        const {agentId, sessionId} = context || {};

        return typeof agentId === 'string' && agentId !== '' && typeof sessionId === 'string' && sessionId !== ''
    }

    /**
     * Handles incoming messages from the WebSocket.
     * Parses the JSON-RPC payload and delegates valid requests to `handleRequest`.
     * @param {Object} data
     */
    async onSocketMessage({data}) {
        if (data?.type === 'agent_disconnected') {
            this.handleAgentDisconnected(data);
            return
        }

        const {jsonrpc, context} = parseAgentEnvelope(data);

        if (jsonrpc?.method) {
            try {
                const result = await this.handleRequest(jsonrpc.method, jsonrpc.params, context);
                this.sendResponse(jsonrpc.id, result)
            } catch (e) {
                console.error('Neo.ai.Client: Failed to handle message', e);
                this.sendError(jsonrpc.id, e.message, e.stack)
            }
        }
    }

    /**
     * @param {Event} event
     */
    onSocketOpen(event) {
        this.gaveUpAt = null;
        this.#opened  = true;

        // Flush buffered logs, which are older than the line announcing this connection
        const logs = this.#logs;

        if (logs?.length > 0) {
            logs.forEach(log => {
                this.sendNotification('console_log', log)
            });
            logs.length = 0
        }

        console.log('Neo.ai.Client: Connected to MCP Server');

        const appWorker = Neo.worker.App;

        // 1. Register the worker
        this.socket.sendMessage({
            jsonrpc: '2.0',
            method : 'register',
            params : {
                appWorkerId   : appWorker.id,
                environment   : Neo.config.environment,
                isSharedWorker: appWorker.isSharedWorker,
                userAgent     : navigator.userAgent
            }
        });

        // 2. Rehydrate window topology
        WindowManager.items.forEach(win => {
            this.sendNotification('window_connected', {
                appName     : win.appName,
                capabilities: win.capabilities,
                chrome      : win.chrome,
                innerRect   : win.innerRect,
                outerRect   : win.outerRect,
                windowId    : win.id
            })
        })

        // 2b. A non-SharedWorker app never fires the App-worker `connect` event that populates
        // WindowManager.items, so the rehydration above sends nothing — the bridge never learns
        // about the single implicit window, leaving `get_window_topology` empty and `simulate_event`
        // unroutable (every event needs a windowId). Register each app's window explicitly from the
        // windowId-keyed `Neo.apps` registry. Rects stay optional here (the SharedWorker path also
        // omits them until a WindowManager entry exists); routing only needs the windowId.
        if (!appWorker.isSharedWorker) {
            Object.entries(Neo.apps).forEach(([windowId, app]) => {
                if (!WindowManager.get(windowId)) {
                    this.sendNotification('window_connected', {appName: app.name, windowId})
                }
            })
        }

        // 3. Rehydrate drag state (if active)
        const dragCoordinator = Neo.manager?.DragCoordinator;

        if (dragCoordinator?.activeTargetZone) {
            this.sendNotification('drag_active', {
                sortGroup : dragCoordinator.activeTargetZone.sortGroup,
                sourceZone: dragCoordinator.activeTargetZone.id
            })
        }
    }

    /**
     * A dial that never opened disconnects nothing, so only a lost connection is logged
     * @param {CloseEvent} event
     */
    onSocketClose(event) {
        let me     = this,
            opened = me.#opened;

        me.#opened = false;
        opened && console.log('Neo.ai.Client: Disconnected')
    }

    /**
     * @summary Reports a socket-level failure, which for an optional bridge is not an app fault.
     *
     * `warn`, not `error`, and the level is the whole point. This fires on every boot of every app
     * declaring `useAiClient` whenever no Neural Link bridge is listening — the ordinary state for
     * CI and for anyone not running one. The event itself carries nothing: the WebSocket spec
     * deliberately reduces it to `{isTrusted: true}` so a page cannot probe why a connection
     * failed, and the actionable detail lives on the close event's code instead. An error level on
     * a content-free, expected condition trains readers to skip the channel. Once the socket gave up,
     * a refused {@link #redial} is not even news, so it stays silent: the browser logs it anyway.
     * @param {Event} event
     */
    onSocketError(event) {
        this.gaveUpAt || console.warn('Neo.ai.Client: WebSocket Error', event)
    }

    /**
     * @summary The bridge stayed unreachable through every reconnect attempt: the same ordinary state
     * {@link #onSocketError} reports for anyone not running a Neural Link bridge, so a warning here too,
     * once. A refused {@link #redial} ends here as well, silently, and restarts the wait for the next one.
     * @param {Object}  failure
     * @param {Boolean} failure.handled Set, so the socket does not report it as an error
     */
    onSocketReconnectFailed(failure) {
        let me = this;

        if (!me.gaveUpAt) {
            console.warn('Neo.ai.Client: the Neural Link bridge stayed unreachable, reconnecting stopped ' +
                'until a window is focused or shown again')
        }

        me.gaveUpAt     = Date.now();
        failure.handled = true
    }

    /**
     * A window shown again is a return, like a window regaining focus: see {@link #redial}
     * @param {Object}  data
     * @param {Boolean} data.hidden
     */
    onWindowVisibilityChange({hidden}) {
        hidden || this.redial()
    }

    /**
     * @summary Dials once more after the socket gave up, when a user returns to one of this worker's windows:
     * the moment a bridge started meanwhile becomes worth a try.
     *
     * Never on a timer. Every refused dial writes a browser-level DevTools error that no script can suppress,
     * so a page without a bridge pays at most one per return, and at most one per backoff step since the
     * last failure. One dial at a time: a return while it connects changes nothing.
     */
    redial() {
        let {gaveUpAt, socket} = this;

        if (gaveUpAt && socket.socket.readyState === WebSocket.CLOSED &&
            Date.now() - gaveUpAt >= socket.backoffStrategy(socket.reconnectAttempts)) {
            socket.createSocket()
        }
    }

    /**
     * Sends a JSON-RPC error response
     * @param {Number|String} id
     * @param {String} message
     * @param {String} [stack]
     */
    sendError(id, message, stack) {
        if (this.isConnected) {
            this.socket.sendMessage({
                jsonrpc: '2.0',
                id,
                error  : {
                    code: -32603, // Internal error
                    message,
                    data: {stack}
                }
            })
        }
    }

    /**
     * Sends a JSON-RPC notification (no id)
     * @param {String} method
     * @param {Object} params
     */
    sendNotification(method, params) {
        if (this.isConnected) {
            this.socket.sendMessage({
                jsonrpc: '2.0',
                method,
                params
            })
        }
    }

    /**
     * Sends a JSON-RPC response
     * @param {Number|String} id
     * @param {*} result
     */
    sendResponse(id, result) {
        if (this.isConnected) {
            this.socket.sendMessage({
                jsonrpc: '2.0',
                id,
                result
            })
        }
    }
}

export default Neo.setupClass(Client);
