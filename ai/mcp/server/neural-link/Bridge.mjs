import {WebSocketServer} from 'ws';
import Base              from '../../../../src/core/Base.mjs';
import logger            from './logger.mjs';

/**
 * @summary The central WebSocket Hub (Bridge) for Neural Link.
 *
 * This standalone service runs as a background process and acts as a message broker between:
 * 1.  **Apps (Browsers):** Running Neo.mjs applications (App Workers).
 * 2.  **Agents (MCP Servers):** AI Agents that want to inspect/control the apps.
 *
 * It listens on a single WebSocket port (default 8081). Clients identify their role via the
 * `role` query parameter ('app' or 'agent').
 *
 * **Routing Logic:**
 * - **App -> Agents:** Messages from an App are broadcast to ALL connected Agents.
 * - **Agent -> App:** Agents must wrap their message in a routing envelope:
 *   `{ target: 'appWorkerId', message: { ...jsonrpc... } }`
 *
 * @class Neo.ai.mcp.server.neural-link.Bridge
 * @extends Neo.core.Base
 * @singleton
 */
class Bridge extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.neural-link.Bridge'
         * @protected
         */
        className: 'Neo.ai.mcp.server.neural-link.Bridge',
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
     * Active Agent sessions (MCP Servers).
     * Map<agentId, WebSocket>
     */
    agents = new Map()
    /**
     * Active App sessions (Browsers).
     * Map<appWorkerId, WebSocket>
     */
    apps = new Map()
    /**
     * WebSocket Server instance.
     */
    wss = null

    /**
     * Async initialization.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await this.startServer();
    }

    /**
     * Starts the WebSocket server.
     * @returns {Promise<void>}
     */
    async startServer() {
        if (this.wss) {
            logger.warn('Bridge: WebSocket Server is already running.');
            return;
        }

        return new Promise((resolve, reject) => {
            const wss = new WebSocketServer({port: this.port});

            wss.on('listening', () => {
                logger.info(`Bridge: Listening on port ${this.port}`);
                this.wss = wss;

                wss.on('connection', (ws, req) => this.handleConnection(ws, req));
                wss.on('error',      (err)     => logger.error('Bridge: Server Error:', err));

                resolve();
            });

            wss.on('error', (err) => {
                logger.error('Bridge: Startup Error:', err);
                reject(err);
            });
        });
    }

    /**
     * Stops the server.
     */
    async stopServer() {
        if (!this.wss) return;

        logger.info('Bridge: Stopping server...');

        this.agents.forEach(ws => ws.terminate());
        this.apps.forEach(ws => ws.terminate());

        this.agents.clear();
        this.apps.clear();

        return new Promise((resolve) => {
            this.wss.close(() => {
                logger.info('Bridge: Stopped.');
                this.wss = null;
                resolve();
            });
        });
    }

    /**
     * Handles new connections.
     * @param {WebSocket} ws
     * @param {IncomingMessage} req
     */
    handleConnection(ws, req) {
        try {
            const url  = new URL(req.url, `http://${req.headers.host}`);
            const role    = url.searchParams.get('role'); // 'app' or 'agent'
            const id      = url.searchParams.get('id') || url.searchParams.get('appWorkerId'); // Support legacy param
            const appName = url.searchParams.get('appName');

            if (!id) {
                logger.warn('Bridge: Connection rejected. No ID provided.');
                ws.close(1008, 'ID required');
                return;
            }

            if (role === 'agent') {
                this.registerAgent(id, ws);
            } else {
                // Default to app if no role specified (backward compatibility)
                this.registerApp(id, ws, appName);
            }

        } catch (err) {
            logger.error('Bridge: Connection error:', err);
            ws.close(1011, 'Internal Error');
        }
    }

    /**
     * @param {String} id
     * @param {WebSocket} ws
     */
    registerAgent(id, ws) {
        logger.info(`Bridge: Agent connected [${id}]`);
        this.agents.set(id, ws);

        ws.on('message', (data) => this.handleAgentMessage(id, data));
        ws.on('close',   ()     => {
            logger.info(`Bridge: Agent disconnected [${id}]`);
            this.agents.delete(id);
            this.broadcastToAgents({
                type   : 'agent_disconnected',
                agentId: id
            });
        });
        ws.on('error', (err) => logger.error(`Bridge: Agent error [${id}]`, err));

        // Notify other agents
        this.broadcastToAgents({
            type   : 'agent_connected',
            agentId: id
        });
    }

    /**
     * @param {String} id
     * @param {WebSocket} ws
     * @param {String} [appName='Unknown']
     */
    registerApp(id, ws, appName='Unknown') {
        logger.info(`Bridge: App connected [${id}] (${appName})`);

        // Handle reconnects: Close old socket if exists
        if (this.apps.has(id)) {
            logger.warn(`Bridge: Closing stale connection for App [${id}]`);
            this.apps.get(id).terminate();
        }

        this.apps.set(id, ws);

        ws.on('message', (data) => this.handleAppMessage(id, data));
        ws.on('close',   ()     => {
            logger.info(`Bridge: App disconnected [${id}] (${appName})`);
            this.apps.delete(id);
            this.broadcastToAgents({
                type: 'app_disconnected',
                appWorkerId: id
            });
        });
        ws.on('error', (err) => logger.error(`Bridge: App error [${id}]`, err));

        // Notify agents of new app
        this.broadcastToAgents({
            type       : 'app_connected',
            appWorkerId: id,
            appName
        });
    }

    /**
     * Handles message from an Agent.
     * Expects: { target: 'appWorkerId', message: { ... } }
     * @param {String} agentId
     * @param {Buffer} data
     */
    handleAgentMessage(agentId, data) {
        try {
            const payload = JSON.parse(data.toString());

            if (!payload.target || !payload.message) {
                logger.warn(`Bridge: Invalid message format from Agent [${agentId}]`);
                return;
            }

            const appWs = this.apps.get(payload.target);

            if (appWs) {
                // Forward transparently
                appWs.send(JSON.stringify(payload.message));
            } else {
                logger.warn(`Bridge: Target App [${payload.target}] not found for Agent [${agentId}]`);

                // If the message is a request (has an id), send an immediate error response
                if (agentWs && payload.message?.id) {
                    agentWs.send(JSON.stringify({
                        type       : 'app_message',
                        appWorkerId: payload.target,
                        message    : {
                            id   : payload.message.id,
                            error: {
                                code   : -32000,
                                message: `Target App [${payload.target}] not found`
                            }
                        }
                    }));
                }
            }

        } catch (err) {
            logger.error(`Bridge: Error handling Agent message [${agentId}]`, err);
        }
    }

    /**
     * Handles message from an App.
     * Broadcasts to all Agents wrapped in an envelope.
     * @param {String} appId
     * @param {Buffer} data
     */
    handleAppMessage(appId, data) {
        try {
            // Validate it's JSON (App always sends JSON)
            const message = JSON.parse(data.toString());

            this.broadcastToAgents({
                type: 'app_message',
                appWorkerId: appId,
                message: message
            });

        } catch (err) {
            logger.error(`Bridge: Error handling App message [${appId}]`, err);
        }
    }

    /**
     * Sends a message to all connected Agents.
     * @param {Object} payload
     */
    broadcastToAgents(payload) {
        const data = JSON.stringify(payload);
        for (const ws of this.agents.values()) {
            ws.send(data);
        }
    }
}

export default Neo.setupClass(Bridge);
