import {WebSocketServer}  from 'ws';
import crypto             from 'crypto';
import Base               from '../../../../src/core/Base.mjs';
import logger             from './logger.mjs';
import {createBridgeInfoPayload} from './BridgeProtocol.mjs';
import {verifyBridgeToken} from './verifyBridgeToken.mjs';

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
     * @summary Completes class initialization without claiming a network listener.
     * Network binding belongs to the standalone entrypoint so it can
     * finish config freshness checks and optional overlay loading before starting the Bridge.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync()
    }

    /**
     * @summary Starts the WebSocket server on the entrypoint-supplied loopback host and port.
     * @param {Object} options
     * @param {String} options.host Entrypoint-supplied literal loopback host.
     * @param {Number} options.port Entrypoint-supplied Bridge listener port.
     * @returns {Promise<void>}
     */
    async startServer({host, port} = {}) {
        if (host !== '127.0.0.1' && host !== '::1') {
            throw new TypeError('Bridge.startServer() requires a literal loopback host.')
        }

        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new TypeError('Bridge.startServer() requires an integer TCP port in the range 1..65535.')
        }

        if (this.wss) {
            logger.warn('Bridge: WebSocket Server is already running.');
            return;
        }

        return new Promise((resolve, reject) => {
            const wss = new WebSocketServer({host, port});

            wss.on('listening', () => {
                logger.info(`Bridge: Listening on ${host}:${port}`);
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
     * Lazily-resolved Ed25519 **public** verify key from `NEO_FLEET_BRIDGE_PUBLIC_KEY` (a trusted,
     * harness/operator-set SPKI PEM — never agent-supplied). `undefined` = not yet resolved, `null` =
     * no key configured (legacy unauthenticated dev mode), else the `crypto.KeyObject`.
     * @member {Object|null} bridgePublicKey
     * @protected
     */
    bridgePublicKey = undefined

    /**
     * @summary Resolve (once, cached) the Bridge's token-verify public key, or null when unset.
     * @returns {Object|null}
     * @protected
     */
    getBridgePublicKey() {
        if (this.bridgePublicKey === undefined) {
            const pem = process.env.NEO_FLEET_BRIDGE_PUBLIC_KEY;
            this.bridgePublicKey = pem ? crypto.createPublicKey(pem) : null;
        }
        return this.bridgePublicKey;
    }

    /**
     * @summary Verify a presented signed Bridge token; return the **signed** agentId or null.
     *
     * Thin wrapper over the pure {@link verifyBridgeToken} (kept Bridge-free so the security gate is
     * unit-testable without the WebSocket singleton — mirrors `src/ai/parseAgentEnvelope.mjs`). The
     * returned identity is the FM-signed `agentId`, trusted from the signature, never the `?id=` claim.
     * @param {String} token `<base64url(payload)>.<base64url(signature)>`.
     * @returns {String|null}
     * @protected
     */
    verifyAgentToken(token) {
        return verifyBridgeToken(token, this.getBridgePublicKey());
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
            const token   = url.searchParams.get('token');

            if (!id) {
                logger.warn('Bridge: Connection rejected. No ID provided.');
                ws.close(1008, 'ID required');
                return;
            }

            if (role === 'agent') {
                // Authenticate the agent when a verify key is provisioned (fleet mode): the identity
                // is the agentId SIGNED into the token, never the untrusted `?id=` query claim (the
                // spoofing hole this closes). With no key configured (no-FM dev), fall back to the
                // legacy unauthenticated path — auth and multi-writer enforcement are a matched pair.
                if (this.getBridgePublicKey()) {
                    const verifiedId = this.verifyAgentToken(token);
                    if (!verifiedId) {
                        logger.warn('Bridge: Agent connection rejected — invalid or missing token.');
                        ws.close(1008, 'Authentication required');
                        return;
                    }
                    this.registerAgent(verifiedId, ws);
                } else {
                    this.registerAgent(id, ws);
                }
            } else if (role === 'test') {
                logger.info(`Bridge: Test client connected [${id}]`);
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

        // A stable, Bridge-authoritative per-connection id (minted here, lives for the connection's
        // lifetime) stamped into the agent_message sidecar + the disconnect notice, so the app-side
        // write-guard can key locks on the (agentId, sessionId) pair.
        ws.sessionId = crypto.randomUUID();

        ws.on('message', (data) => this.handleAgentMessage(id, data));
        ws.on('close',   ()     => {
            logger.info(`Bridge: Agent disconnected [${id}]`);
            this.agents.delete(id);
            this.broadcastToAgents({
                type   : 'agent_disconnected',
                agentId: id
            });
            // Lets the app-side write-guard release locks held by the now-dead writer; idempotent so a
            // blanket app broadcast is safe.
            this.broadcastToApps({
                type     : 'agent_disconnected',
                agentId  : id,
                sessionId: ws.sessionId
            });
        });
        ws.on('error', (err) => logger.error(`Bridge: Agent error [${id}]`, err));

        this.sendBridgeInfo(ws);

        // Notify other agents
        this.broadcastToAgents({
            type   : 'agent_connected',
            agentId: id
        });

        // Notify the new Agent of all already-connected apps
        for (const [appWorkerId, appWs] of this.apps.entries()) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type       : 'app_connected',
                    appWorkerId,
                    appName    : appWs.appName || 'Unknown'
                }));
            }
        }
    }

    /**
     * @summary Sends the freshness/protocol stamp expected by current agent clients.
     * @param {WebSocket} ws
     */
    sendBridgeInfo(ws) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(createBridgeInfoPayload()))
        }
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

        ws.appName = appName;
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

            const agentWs = this.agents.get(agentId);
            const appWs   = this.apps.get(payload.target);

            if (appWs) {
                // Forward, wrapping the message in the Bridge-stamped sidecar (the app-side Client unwraps it)
                appWs.send(JSON.stringify({
                    type     : 'agent_message',
                    agentId,
                    sessionId: agentWs?.sessionId,
                    message  : payload.message
                }));
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

    /**
     * Sends a message to all connected Apps.
     * @param {Object} payload
     */
    broadcastToApps(payload) {
        const data = JSON.stringify(payload);
        for (const ws of this.apps.values()) {
            ws.send(data);
        }
    }
}

export default Neo.setupClass(Bridge);
