import Base             from '../core/Base.mjs';
import ClassSystemUtil  from '../util/ClassSystem.mjs';
import ComponentService   from './client/ComponentService.mjs';
import DataService        from './client/DataService.mjs';
import InstanceService    from './client/InstanceService.mjs';
import InteractionService from './client/InteractionService.mjs';
import RuntimeService     from './client/RuntimeService.mjs';
import Socket             from '../data/connection/WebSocket.mjs';
import WindowManager      from '../manager/Window.mjs';
import WriteGuard         from './WriteGuard.mjs';
import TransactionService from './TransactionService.mjs';
import {parseAgentEnvelope} from './parseAgentEnvelope.mjs';

/**
 * The AI Client establishes a WebSocket connection to the Neural Link MCP Server.
 * It acts as a bridge, enabling external AI agents to inspect and manipulate the running Neo.mjs application
 * via a standardized JSON-RPC protocol.
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
         * Add custom configs for data.connection.Websocket, or pass a module or instance.
         * @member {Object|Neo.data.connection.WebSocket|null} socket=null
         */
        socketConfig: null,
        /**
         * The URL of the Neural Link MCP Server's WebSocket endpoint.
         * @member {String} url='ws://127.0.0.1:8081'
         */
        url: 'ws://127.0.0.1:8081'
    }

    /**
     * @member {Boolean} isConnected=false
     * @protected
     */
    isConnected = false
    /**
     * Buffer for console logs generated before connection is established
     * @member {Array} logs=[]
     * @protected
     */
    logs = []
    /**
     * Map JSON-RPC method prefixes to service instances
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
            instance   : Neo.create(InstanceService,    {client: me}),
            interaction: Neo.create(InteractionService, {client: me}),
            runtime    : Neo.create(RuntimeService,     {client: me})
        };

        const {component, data, instance, interaction, runtime} = me.services;

        me.serviceMap = {
            get_component         : component,
            get_computed_styles   : component,
            get_dom_rect          : component,
            get_vdom              : component,
            get_vdom_vnode        : component,
            get_vnode             : component,
            highlight_component   : component,
            observe_motion        : component,
            query_component       : component,
            query_vdom            : component,
            verify_component      : component,

            call_method            : instance,
            create_instance         : instance,
            destroy_instance        : instance,
            find_instances         : instance,
            get_instance_properties: instance,
            set_instance_properties: instance,
            undo                   : instance,
            redo                   : instance,
            abort_transaction      : instance,
            begin_transaction      : instance,
            commit_transaction     : instance,
            list_transactions      : instance,

            get_record            : data,
            inspect_state_provider: data,
            inspect_store         : data,
            list_stores           : data,
            modify_state_provider : data,

            check_namespace       : runtime,
            focus_window          : runtime,
            get_dom_event         : runtime,
            get_drag              : runtime,
            get_method_source     : runtime,
            get_namespace_tree    : runtime,
            get_neo_config        : runtime,
            get_route             : runtime,
            get_window            : runtime,
            inspect_class         : runtime,
            open_component_window : runtime,
            patch_code            : runtime,
            position_window       : runtime,
            reload_page           : runtime,
            set_route             : runtime,
            simulate_event        : interaction
        };

        Neo.currentWorker.on({
            connect   : me.onAppWorkerWindowConnect,
            disconnect: me.onAppWorkerWindowDisconnect,
            scope     : me
        });

        me.connect()
    }

    /**
     * Establishes the WebSocket connection to the Neural Link MCP Server.
     * Uses Neo.data.connection.WebSocket for robust connection management.
     */
    connect() {
        let me = this;

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
                serverAddress: url.toString(),
                listeners    : {
                    close  : me.onSocketClose,
                    error  : me.onSocketError,
                    message: me.onSocketMessage,
                    open   : me.onSocketOpen,
                    scope  : me
                }
            })
        } catch (e) {
            console.error('Neo.ai.Client: Failed to create WebSocket connection', e)
        }
    }

    /**
     * Routes specific JSON-RPC methods to their corresponding implementation.
     * This method acts as the central dispatcher for all AI-driven commands.
     * @param {String} method The JSON-RPC method name
     * @param {Object} params The parameters associated with the method
     * @param {Object} [context] Optional request context (e.g. `{agentId}`) threaded from the
     * agent-message envelope; the write services key topological-lock enforcement on it.
     * @returns {Promise<*>} The result of the operation
     */
    async handleRequest(method, params, context) {
        let me      = this,
            service = null,
            prefix;

        // Find matching service based on prefix
        // e.g. "get_component_property" -> matches "get_component" prefix
        for (prefix in me.serviceMap) {
            if (method.startsWith(prefix)) {
                service = me.serviceMap[prefix];
                break
            }
        }

        const fnName = Neo.snakeToCamel(method);

        if (service) {
            const fn = service[fnName];

            if (Neo.isFunction(fn)) {
                return fn.call(service, params, context)
            } else if (Neo.isPromise(fn)) {
                return await fn.call(service, params, context)
            }
        }

        if (service && typeof service[fnName] === 'function') {
            return service[fnName](params, context)
        }

        throw new Error(`Unknown method: ${method}`);
    }

    /**
     * @param {Object} data
     */
    onAppWorkerWindowConnect(data) {
        if (this.isConnected) {
            const
                win = WindowManager.get(data.windowId),
                {appName, windowId} = data;

            this.sendNotification('window_connected', {
                appName,
                chrome   : win?.chrome,
                innerRect: win?.innerRect,
                outerRect: win?.outerRect,
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

        if (typeof agentId !== 'string' || agentId === '' ||
            typeof sessionId !== 'string' || sessionId === '' ||
            !writeGuard) {
            return {released: 0, swept: false}
        }

        // The transaction lifecycle must not outlive the lock lifecycle: release the agent's held write-locks
        // AND sweep its open transaction + undo stack on the same `agent_disconnected` frame — otherwise a
        // disconnect (or worker restart) leaks an open transaction. `sweep` is the transaction-side counterpart
        // to `releaseAgent`; both key on the same `(agentId, sessionId)` pair validated above.
        const {released}      = writeGuard.releaseAgent({agentId, sessionId}),
              {swept = false} = transactionService?.sweep({id: {agentId, sessionId}}) ?? {};

        return {released, swept}
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
        console.log('Neo.ai.Client: Connected to MCP Server');
        this.isConnected = true;

        // Flush buffered logs
        if (this.logs.length > 0) {
            this.logs.forEach(log => {
                this.sendNotification('console_log', log)
            });
            this.logs.length = 0
        }

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
                appName  : win.appName,
                chrome   : win.chrome,
                innerRect: win.innerRect,
                outerRect: win.outerRect,
                windowId : win.id
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
     * @param {CloseEvent} event
     */
    onSocketClose(event) {
        console.log('Neo.ai.Client: Disconnected');
        this.isConnected = false
    }

    /**
     * @param {Event} event
     */
    onSocketError(event) {
        console.error('Neo.ai.Client: WebSocket Error', event)
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
                error: {
                    code   : -32603, // Internal error
                    message,
                    data   : {stack}
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
