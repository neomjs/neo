import {WebSocketServer} from 'ws';
import crypto            from 'crypto';
import Base              from '../../../../../src/core/Base.mjs';
import logger            from '../logger.mjs';

/**
 * @summary Manages WebSocket connections and JSON-RPC communication with the App Worker(s).
 *
 * This service acts as the **gateway** between the MCP server and the Neo.mjs App Worker
 * (SharedWorker or DedicatedWorker). It maintains active WebSocket sessions and manages
 * the lifecycle of remote procedure calls (RPC).
 *
 * Key responsibilities include:
 * 1.  **Session Management**: Tracking active App Worker sessions and their WebSocket connections.
 * 2.  **RPC Orchestration**: Sending requests to the App Worker (`call`) and resolving the corresponding promises when a response is received.
 * 3.  **Message Routing**: Handling incoming notifications and responses from the App Worker.
 * 4.  **Error Handling**: Managing timeouts and connection errors to ensure robust communication.
 *
 * This class implements the **Request-Response** pattern over WebSockets, allowing the agent to execute
 * code within the App Worker context asynchronously.
 *
 * @class Neo.ai.mcp.server.neural-link.services.ConnectionService
 * @extends Neo.core.Base
 * @singleton
 */
class ConnectionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.services.ConnectionService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.services.ConnectionService',
        /**
         * @member {Number} port=8081
         * @protected
         */
        port: 8081,
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Message ID counter.
     */
    msgId = 0
    /**
     * Pending RPC requests awaiting response from Browser.
     * Map<messageId, {resolve, reject, timeout}>
     */
    pendingRequests = new Map()
    /**
     * Active WebSocket sessions.
     * Map<sessionId, WebSocket>
     */
    sessions = new Map()
    /**
     * Session Metadata.
     * Map<sessionId, Object>
     */
    sessionData = new Map()
    /**
     * WebSocket Server instance.
     */
    wss = null

    /**
     * Async initialization sequence.
     * @returns {Promise<void>}
     */
    async initAsync() {
        this.wss = new WebSocketServer({port: this.port});

        this.wss.on('connection', (ws)  => this.#handleConnection(ws));
        this.wss.on('error',      (err) => logger.error('WebSocket Server Error:', err));

        logger.info(`WebSocket Server listening on port ${this.port}`);
    }

    /**
     * Handles a new WebSocket connection.
     * @param {WebSocket} ws
     * @private
     */
    #handleConnection(ws) {
        const sessionId = crypto.randomUUID();

        this.sessions.set(sessionId, ws);
        this.sessionData.set(sessionId, {
            connectedAt: Date.now(),
            sessionId
        });

        logger.info(`App Worker connected. Session: ${sessionId}`);

        ws.on('message', (data) => this.#handleMessage(sessionId, data));
        ws.on('close',   ()     => this.#handleDisconnect(sessionId));
        ws.on('error',   (err)  => logger.error(`Session error (${sessionId}):`, err));
    }

    /**
     * Handles disconnection.
     * @param {String} sessionId
     * @private
     */
    #handleDisconnect(sessionId) {
        this.sessions.delete(sessionId);
        this.sessionData.delete(sessionId);
        logger.info(`App Worker disconnected. Session: ${sessionId}`);
    }

    /**
     * Handles incoming messages from Browser.
     * @param {String} sessionId
     * @param {Buffer|String} data
     * @private
     */
    #handleMessage(sessionId, data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug(`Received message from ${sessionId}:`, message);

            // 1. Response to a pending request
            if (message.id && (message.result !== undefined || message.error !== undefined)) {
                this.#resolveRequest(message);
                return;
            }

            // 2. Notification / Request from Browser (e.g. log)
            if (message.method) {
                if (message.method === 'register') {
                    const meta = this.sessionData.get(sessionId);

                    if (meta) {
                        Object.assign(meta, message.params);
                        logger.info(`Registered App Worker: ${meta.appWorkerId} (Session: ${sessionId})`)
                    }

                    return
                }

                logger.info(`Received method from browser (${sessionId}):`, message.method, message.params);
                // TODO: Forward to Agent via MCP Notification if needed.
                return;
            }

        } catch (err) {
            logger.error('Failed to parse message:', err);
        }
    }

    /**
     * Resolves a pending RPC request.
     * @param {Object} message
     * @private
     */
    #resolveRequest(message) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(message.id);

            if (message.error) {
                pending.reject(new Error(message.error.message || 'Unknown RPC Error'));
            } else {
                pending.resolve(message.result);
            }
        }
    }

    /**
     * Sends a JSON-RPC request to a specific window.
     * @param {String} windowId    The target window ID.
     * @param {String} method      The RPC method name.
     * @param {Object} [params={}] The RPC parameters.
     * @returns {Promise<any>} Resolves with the RPC result or rejects with an error.
     * @private
     */
    #call(windowId, method, params={}) {
        return new Promise((resolve, reject) => {
            const ws = this.sessions.get(windowId);

            // If no windowId provided, try to pick the most recent one
            if (!ws) {
                if (!windowId && this.sessions.size > 0) {
                    // Pick the last connected session
                    const lastId = Array.from(this.sessions.keys()).pop();
                    logger.warn(`No windowId provided. Defaulting to ${lastId}`);
                    // Recursive call with the found ID
                    return this.#call(lastId, method, params).then(resolve).catch(reject);
                }
                logger.error(`Session not found. Requested: ${windowId}, Active: ${Array.from(this.sessions.keys()).join(', ')}`);
                return reject(new Error(`Session not found: ${windowId || 'No active sessions'}`));
            }

            const id = ++this.msgId;
            const payload = {
                jsonrpc: '2.0',
                method,
                params,
                id
            };

            // Timeout after 30s
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timed out'));
                }
            }, 30000);

            this.pendingRequests.set(id, {resolve, reject, timeout});

            ws.send(JSON.stringify(payload));
        });
    }

    /**
     * Broadcasts a message to all connected sessions.
     * @param {String} method      The RPC method name.
     * @param {Object} [params={}] The RPC parameters.
     * @private
     */
    #broadcast(method, params={}) {
        const payload = JSON.stringify({
            jsonrpc: '2.0',
            method,
            params
        });

        for (const ws of this.sessions.values()) {
            ws.send(payload);
        }
    }

    /**
     * Retrieves a property from a component by its ID.
     * @param {Object} opts The options object.
     * @param {String} opts.id The component ID.
     * @param {String} opts.property The property name to retrieve.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<any>} The value of the property.
     */
    async getComponentProperty({id, property, windowId}) {
        return await this.#call(windowId, 'get_component_property', {id, property})
    }

    /**
     * Retrieves the full component tree of the application.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<Object>} The component tree structure.
     */
    async getComponentTree({depth, rootId, windowId}) {
        return await this.#call(windowId, 'get_component_tree', {depth, rootId})
    }

    /**
     * Retrieves the VDOM tree of a component.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<Object>} The VDOM tree structure.
     */
    async getVdomTree({depth, rootId, windowId}) {
        return await this.#call(windowId, 'get_vdom_tree', {depth, rootId})
    }

    /**
     * Retrieves the VNode tree of a component.
     * @param {Object} opts            The options object.
     * @param {Number} [opts.depth]    The depth limit.
     * @param {String} [opts.rootId]   Optional root component ID.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<Object>} The VNode tree structure.
     */
    async getVnodeTree({depth, rootId, windowId}) {
        return await this.#call(windowId, 'get_vnode_tree', {depth, rootId})
    }

    /**
     * Retrieves the state of the DragCoordinator.
     * @param {Object} opts
     * @param {String} [opts.sessionId]
     * @returns {Promise<Object>}
     */
    async getDragState({sessionId}) {
        return await this.#call(sessionId, 'get_drag_state', {})
    }

    /**
     * Retrieves the topology of all connected windows.
     * @returns {Promise<Object[]>} List of windows.
     */
    async getWindowTopology() {
        const promises = [];

        for (const sessionId of this.sessions.keys()) {
            promises.push(this.#call(sessionId, 'get_window_info', {})
                .then(res => res.windows || [])
                .catch(err => {
                    logger.error(`Failed to get window info from session ${sessionId}:`, err);
                    return []
                })
            )
        }

        const results = await Promise.all(promises);
        const windows = results.flat();

        // Deduplicate by Application Window ID (not Session ID)
        const uniqueWindows = [];
        const seenIds = new Set();

        for (const win of windows) {
            if (win && win.id && !seenIds.has(win.id)) {
                seenIds.add(win.id);
                uniqueWindows.push(win)
            }
        }

        return uniqueWindows
    }

    /**
     * Retrieves the topology of all connected App Workers.
     * @returns {Promise<Object[]>}
     */
    async getWorkerTopology() {
        return Array.from(this.sessionData.values())
    }

    /**
     * Reloads the application page.
     * @param {Object} opts            The options object.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<void>}
     */
    async reloadPage({windowId}) {
        return await this.#call(windowId, 'reload_page', {})
    }

    /**
     * Sets a property on a component by its ID.
     * @param {Object} opts            The options object.
     * @param {String} opts.id         The component ID.
     * @param {String} opts.property   The property name to set.
     * @param {*}      opts.value      The value to set.
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<void>}
     */
    async setComponentProperty({id, property, value, windowId}) {
        return await this.#call(windowId, 'set_component_property', {id, property, value})
    }
}

export default Neo.setupClass(ConnectionService);
