import {WebSocketServer} from 'ws';
import crypto            from 'crypto';
import Base              from '../../../../../src/core/Base.mjs';
import logger            from '../logger.mjs';

/**
 * @summary Manages WebSocket connections and JSON-RPC communication with the browser.
 *
 * This service acts as the **gateway** between the MCP server and the Neo.mjs application running in the browser.
 * It maintains active WebSocket sessions, handles the JSON-RPC handshake, and manages the lifecycle of
 * remote procedure calls (RPC).
 *
 * Key responsibilities include:
 * 1.  **Session Management**: Tracking active browser windows (`windowId`) and their WebSocket connections.
 * 2.  **RPC Orchestration**: Sending requests to the browser (`call`) and resolving the corresponding promises when a response is received.
 * 3.  **Message Routing**: Handling incoming notifications and responses from the browser.
 * 4.  **Error Handling**: Managing timeouts and connection errors to ensure robust communication.
 *
 * This class implements the **Request-Response** pattern over WebSockets, allowing the agent to execute
 * code within the browser context asynchronously.
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
     * Map<windowId, WebSocket>
     */
    sessions = new Map()
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
        // Temporary ID until handshake.
        // For now, we assume the browser sends a 'register' message or we assign a random ID.
        // Let's assign a random ID first.
        const windowId = crypto.randomUUID();

        this.sessions.set(windowId, ws);
        logger.info(`Client connected: ${windowId}`);

        ws.on('message', (data) => this.#handleMessage(windowId, data));
        ws.on('close',   ()     => this.#handleDisconnect(windowId));
        ws.on('error',   (err)  => logger.error(`Client error (${windowId}):`, err));
    }

    /**
     * Handles disconnection.
     * @param {String} windowId
     * @private
     */
    #handleDisconnect(windowId) {
        this.sessions.delete(windowId);
        logger.info(`Client disconnected: ${windowId}`);
    }

    /**
     * Handles incoming messages from Browser.
     * @param {String} windowId
     * @param {Buffer|String} data
     * @private
     */
    #handleMessage(windowId, data) {
        try {
            const message = JSON.parse(data.toString());
            logger.debug(`Received message from ${windowId}:`, message);

            // 1. Response to a pending request
            if (message.id && (message.result !== undefined || message.error !== undefined)) {
                this.#resolveRequest(message);
                return;
            }

            // 2. Notification / Request from Browser (e.g. log)
            if (message.method) {
                logger.info(`Received method from browser (${windowId}):`, message.method, message.params);
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
     * @param {String} [opts.windowId] The target window ID.
     * @returns {Promise<Object>} The component tree structure.
     */
    async getComponentTree({windowId}) {
        return await this.#call(windowId, 'get_component_tree', {})
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
