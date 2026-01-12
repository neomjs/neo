import aiConfig  from '../config.mjs';
import {spawn}   from 'child_process';
import crypto    from 'crypto';
import fs        from 'fs';
import WebSocket from 'ws';
import Base      from '../../../../../src/core/Base.mjs';
import logger    from '../logger.mjs';

/**
 * @summary Manages the connection to the Neural Link Bridge and orchestrates RPC calls.
 *
 * **Architecture Change (v2):**
 * This service no longer hosts a WebSocket Server. Instead, it acts as a **Client** to the
 * standalone Neural Link Bridge process (running on port 8081).
 *
 * **Responsibilities:**
 * 1.  **Bridge Management**: Ensures the Bridge process is running (spawns it if missing).
 * 2.  **Agent Identity**: Connects to the Bridge as an 'agent'.
 * 3.  **Session Tracking**: Maintains a local cache of active App Worker sessions based on Bridge events.
 * 4.  **RPC Routing**: Routes requests to specific App Workers via the Bridge.
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
         * @member {String|null} cwd=null @protected
         */
        cwd: null,
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
     * Active Agents connected to the Bridge.
     * Set<agentId>
     */
    activeAgents = new Set()
    /**
     * Unique ID for this Agent instance.
     */
    agentId = `agent-${crypto.randomUUID()}`
    /**
     * Bridge child process (if spawned by this service).
     */
    bridgeProcess = null
    /**
     * The WebSocket connection to the Bridge.
     */
    bridgeSocket = null
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
     * Active App Worker sessions (Metadata only).
     * Map<sessionId, Object>
     */
    sessionData = new Map()

    /**
     * Async initialization sequence.
     * @returns {Promise<void>}
     */
    async initAsync() {
        if (aiConfig.autoConnect) {
            await this.ensureBridgeAndConnect();
        }
    }

    /**
     * Sends a JSON-RPC request to a specific session via the Bridge.
     * @param {String} sessionId    The target session ID.
     * @param {String} method      The RPC method name.
     * @param {Object} [params={}] The RPC parameters.
     * @returns {Promise<any>}
     */
    async call(sessionId, method, params={}) {
        if (!this.bridgeSocket) {
            throw new Error('Not connected to Neural Link Bridge');
        }

        // If no sessionId, pick the most recent one (Auto-Targeting)
        if (!sessionId) {
            if (this.sessionData.size > 0) {
                sessionId = Array.from(this.sessionData.keys()).pop();
                logger.warn(`No sessionId provided. Defaulting to ${sessionId}`);
            } else {
                // Wait for a session?
                throw new Error('No active App Worker sessions found.');
            }
        }

        const id = ++this.msgId;
        const rpcMessage = {
            jsonrpc: '2.0',
            method,
            params,
            id
        };

        const bridgePayload = {
            target : sessionId,
            message: rpcMessage
        };

        logger.info(`[ConnectionService] Sending call ${id} to ${sessionId}: ${method}`);

        return new Promise((resolve, reject) => {
            // Timeout after configured time
            const timeout = setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    logger.error(`[ConnectionService] Call ${id} timed out`);
                    reject(new Error('Request timed out'));
                }
            }, aiConfig.rpcTimeout);

            this.pendingRequests.set(id, {resolve, reject, timeout});

            this.bridgeSocket.send(JSON.stringify(bridgePayload));
        });
    }

    /**
     * Connects to the Bridge WebSocket.
     * @returns {Promise<void>}
     */
    async connectToBridge() {
        return new Promise((resolve, reject) => {
            const url = `ws://127.0.0.1:${this.port}?role=agent&id=${this.agentId}`;
            const ws  = new WebSocket(url);

            ws.on('open', () => {
                logger.info(`Connected to Neural Link Bridge as ${this.agentId}`);
                this.bridgeSocket = ws;
                resolve();
            });

            ws.on('message', (data) => this.handleBridgeMessage(data));

            ws.on('close', () => {
                logger.warn('Disconnected from Neural Link Bridge');
                this.bridgeSocket = null;
                // Optional: Auto-reconnect logic could go here
            });

            ws.on('error', (err) => {
                if (!this.bridgeSocket) {
                    reject(err); // Reject if error happens during initial connect
                } else {
                    logger.error('Bridge Socket Error:', err);
                }
            });
        });
    }

    /**
     * Ensures the Bridge is running and connects to it.
     */
    async ensureBridgeAndConnect() {
        let connected = false;

        // 1. Try to connect to existing Bridge
        try {
            await this.connectToBridge();
            connected = true;
        } catch (e) {
            logger.info('Failed to connect to existing bridge:', e.message);
            logger.info('Assuming Bridge not running. Spawning new Bridge process...');
        }

        // 2. Spawn if missing
        if (!connected) {
            await this.spawnBridge();
            await this.connectToBridge();
        }
    }

    /**
     * @param {Object} params
     * @param {String} params.sessionId
     * @param {String} [params.filter]
     * @param {String} [params.type]
     */
    getConsoleLogs({sessionId, filter, type}) {
        // If no sessionId, pick the most recent one (Auto-Targeting)
        if (!sessionId) {
            if (this.sessionData.size > 0) {
                sessionId = Array.from(this.sessionData.keys()).pop();
                logger.warn(`No sessionId provided. Defaulting to ${sessionId}`);
            } else {
                throw new Error('No active App Worker sessions found.');
            }
        }

        const meta = this.sessionData.get(sessionId);
        if (!meta || !meta.logs) {
            return [];
        }

        let logs = meta.logs;

        if (type) {
            logs = logs.filter(log => log.type === type);
        }

        if (filter) {
            const lowerFilter = filter.toLowerCase();
            logs = logs.filter(log => log.message && log.message.toLowerCase().includes(lowerFilter));
        }

        return logs
    }

    /**
     * Returns the current status.
     * @returns {Object}
     */
    getStatus() {
        const
            sessions = [],
            windows  = [];

        for (const [id, meta] of this.sessionData.entries()) {
            sessions.push({
                id,
                connectedAt: meta.connectedAt,
                activeApps : meta.windows ? meta.windows.size : 0
            });

            if (meta.windows) {
                for (const win of meta.windows.values()) {
                    windows.push({
                        id     : win.windowId,
                        appName: win.appName,
                        width  : win.outerRect?.width,
                        height : win.outerRect?.height,
                        x      : win.outerRect?.x,
                        y      : win.outerRect?.y
                    })
                }
            }
        }

        return {
            sessions,
            windows,
            bridgeConnected: !!this.bridgeSocket,
            agentId        : this.agentId,
            agents         : Array.from(this.activeAgents)
        }
    }

    /**
     * @param {String} agentId
     */
    handleAgentConnected(agentId) {
        // Ignore self
        if (agentId !== this.agentId) {
            logger.info(`Agent connected: ${agentId}`);
            this.activeAgents.add(agentId);
        }
    }

    /**
     * @param {String} agentId
     */
    handleAgentDisconnected(agentId) {
        if (this.activeAgents.has(agentId)) {
            logger.info(`Agent disconnected: ${agentId}`);
            this.activeAgents.delete(agentId);
        }
    }

    /**
     * @param {String} appWorkerId
     */
    handleAppConnected(appWorkerId) {
        logger.info(`App Worker connected: ${appWorkerId}`);
        this.sessionData.set(appWorkerId, {
            connectedAt: Date.now(),
            logs       : [],
            sessionId  : appWorkerId
        });
    }

    /**
     * @param {String} appWorkerId
     */
    handleAppDisconnected(appWorkerId) {
        logger.info(`App Worker disconnected: ${appWorkerId}`);
        this.sessionData.delete(appWorkerId);
    }

    /**
     * Handles unwrapped message from an App.
     * @param {String} sessionId
     * @param {Object} message
     */
    handleAppMessage(sessionId, message) {
        // 1. Response to a pending request
        if (message.id && (message.result !== undefined || message.error !== undefined)) {
            logger.info(`[ConnectionService] Received response for ${message.id} from ${sessionId}`);
            this.resolveRequest(message);
            return;
        }

        // 2. Notification (e.g. window_connected)
        if (message.method) {
            this.handleNotification(sessionId, message);
        }
    }

    /**
     * Handles messages received from the Bridge.
     * @param {Buffer} data
     */
    handleBridgeMessage(data) {
        try {
            const payload = JSON.parse(data.toString());

            switch (payload.type) {
                case 'app_connected':
                    this.handleAppConnected(payload.appWorkerId);
                    break;
                case 'app_disconnected':
                    this.handleAppDisconnected(payload.appWorkerId);
                    break;
                case 'app_message':
                    this.handleAppMessage(payload.appWorkerId, payload.message);
                    break;
                case 'agent_connected':
                    this.handleAgentConnected(payload.agentId);
                    break;
                case 'agent_disconnected':
                    this.handleAgentDisconnected(payload.agentId);
                    break;
                default:
                    logger.debug('Unknown message type from Bridge:', payload.type);
            }
        } catch (err) {
            logger.error('Error parsing Bridge message:', err);
        }
    }

    /**
     * Handles notifications (updates metadata).
     * @param {String} sessionId
     * @param {Object} message
     */
    handleNotification(sessionId, message) {
        if (message.method === 'console_log') {
            const meta = this.sessionData.get(sessionId);
            if (meta) {
                meta.logs = meta.logs || [];
                meta.logs.push(message.params);
                // Keep last 1000 logs
                if (meta.logs.length > 1000) {
                    meta.logs.shift();
                }
            }
            return;
        }

        if (message.method === 'register') {
            const meta = this.sessionData.get(sessionId);
            if (meta) {
                Object.assign(meta, message.params);
                logger.info(`Registered App Worker: ${meta.appWorkerId}`);
            }
            return;
        }

        if (message.method === 'window_connected') {
            const meta = this.sessionData.get(sessionId);
            if (meta) {
                meta.windows = meta.windows || new Map();
                meta.windows.set(message.params.windowId, {
                    ...message.params,
                    connectedAt: Date.now()
                });
                logger.info(`Window connected: ${message.params.windowId}`);
            }
            return;
        }

        if (message.method === 'window_disconnected') {
            const meta = this.sessionData.get(sessionId);
            if (meta && meta.windows) {
                meta.windows.delete(message.params.windowId);
                logger.info(`Window disconnected: ${message.params.windowId}`);
            }
            return;
        }

        // Log other methods
        logger.debug(`Notification from ${sessionId}: ${message.method}`);
    }

    /**
     * Tool handler: Manages the WebSocket server connection.
     * @param {Object} opts
     * @param {String} opts.action 'start' | 'stop'
     * @returns {Promise<Object>}
     */
    async manageConnection({action}) {
        logger.info(`Tool: manage_connection called with action=${action}`);

        if (action === 'start') {
            await this.ensureBridgeAndConnect();
            const status = this.getStatus();

            if (status.bridgeConnected) {
                return {message: 'Neural Link Bridge started and connected successfully.'};
            } else {
                throw new Error('Failed to connect to Neural Link Bridge after spawn attempt.');
            }
        } else if (action === 'stop') {
            // 1. Disconnect Client
            if (this.bridgeSocket) {
                this.bridgeSocket.close();
                this.bridgeSocket = null;
            }

            // 2. Kill Process
            if (this.bridgeProcess) {
                this.bridgeProcess.kill();
                this.bridgeProcess = null;
                logger.info('Bridge process terminated.');
                return {message: 'Neural Link Bridge stopped.'};
            } else {
                logger.warn('No managed Bridge process found. Server might have been started externally.');
                return {message: 'Disconnected. Bridge process was not managed by this session (not killed).'};
            }
        }

        throw new Error(`Invalid action: ${action}`);
    }

    /**
     * Resolves a pending RPC request.
     * @param {Object} message
     */
    resolveRequest(message) {
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
     * Spawns the Bridge process.
     * @returns {Promise<void>}
     */
    async spawnBridge() {
        return new Promise((resolve, reject) => {
            const args    = ['run', 'ai:server-neural-link'];
            const logFile = fs.openSync('./bridge.log', 'a');

            this.bridgeProcess = spawn('npm', args, {
                cwd     : this.cwd || process.cwd(),
                detached: true,
                stdio   : ['ignore', logFile, logFile]
            });

            this.bridgeProcess.unref();

            // Give it a moment to start
            setTimeout(resolve, 2000);
        });
    }
}

export default Neo.setupClass(ConnectionService);
