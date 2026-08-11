import aiConfig  from '../../mcp/server/neural-link/config.mjs';
import {spawn}   from 'child_process';
import crypto    from 'crypto';
import fs        from 'fs';
import path      from 'path';
import WebSocket from 'ws';
import Base      from '../../../src/core/Base.mjs';
import logger    from '../../mcp/server/neural-link/logger.mjs';

/**
 * @summary Decides what `initAsync()` may do about the Bridge at construction time.
 *
 * Exported as a plain function so specs drive the production decision rather than a mirror of it:
 * the live branch sits behind `Neo.config.unitTestMode`, which is exactly false in every unit run,
 * so the interesting cases are otherwise unreachable without mutating the config singleton.
 *
 * `'defer'` is the answer whenever the working directory is still unknown. The singleton is
 * constructed by its own import inside the Neural Link entrypoint, several steps before that
 * entrypoint assigns `--cwd`, so an unresolved cwd at this moment is the ORDINARY boot path and
 * not a misconfiguration. Treating it as one is what made a correctly-launched server fail.
 *
 * @param {Object} options
 * @param {Boolean} options.unitTestMode Whether the hermetic unit harness is active.
 * @param {Boolean} options.autoConnect  The resolved `autoConnect` config leaf.
 * @param {String|null} options.cwd      The entrypoint-supplied working directory, if assigned yet.
 * @returns {'connect'|'defer'|'disabled'}
 */
export function resolveBridgeAutoConnect({unitTestMode, autoConnect, cwd}) {
    if (unitTestMode || !autoConnect) return 'disabled';

    return cwd ? 'connect' : 'defer'
}
import {
    BRIDGE_INFO_TYPE,
    STALE_BRIDGE_ERROR_CODE,
    createStaleBridgeError,
    isBridgeInfoPayloadFresh
} from '../../mcp/server/neural-link/BridgeProtocol.mjs';
import {resolveCallTarget} from './resolveCallTarget.mjs';

/**
 * @summary Validates the Neural Link bridge payload debug-log cap from AiConfig.
 * @param {Number} maxChars
 * @returns {Number}
 */
export const normalizeBridgePayloadDebugMaxChars = maxChars => {
    const value = Number(maxChars);

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Invalid aiConfig.bridgePayloadDebugMaxChars value')
    }

    return Math.floor(value)
};

/**
 * @summary Serializes a bridge payload for opt-in debug logging, capped for file safety.
 * @param {*} payload
 * @param {Number} maxChars
 * @returns {String}
 */
export const stringifyBridgePayloadForDebug = (payload, maxChars) => {
    let serialized;

    if (payload instanceof Error) {
        serialized = `${payload.name}: ${payload.message}\n${payload.stack || ''}`.trim()
    } else {
        try {
            serialized = JSON.stringify(payload)
        } catch {
            serialized = String(payload)
        }
    }

    serialized ??= String(payload);

    const limit = normalizeBridgePayloadDebugMaxChars(maxChars);

    if (serialized.length <= limit) {
        return serialized
    }

    return `${serialized.slice(0, limit)}... [truncated ${serialized.length - limit} chars]`
};

/**
 * @summary Measures a payload's serialized byte size without exposing its body.
 * @param {*} payload
 * @returns {Number|null}
 */
export const getBridgePayloadByteLength = payload => {
    try {
        return Buffer.byteLength(JSON.stringify(payload) ?? String(payload), 'utf8')
    } catch {
        return null
    }
};

/**
 * @summary Resolves the detached Bridge process stdout/stderr log file.
 * @param {Object} [options={}]
 * @param {String} [options.logPath=aiConfig.logPath]
 * @returns {String}
 */
export const getBridgeStdioLogPath = ({
    logPath = aiConfig.logPath
} = {}) => {
    if (typeof logPath !== 'string' || logPath.trim() === '') {
        throw new Error(
            'Missing aiConfig.logPath: Neural Link Bridge stdio requires an injected log directory'
        )
    }

    return path.join(logPath, 'neural-link-bridge-stdio.log')
};

/**
 * @summary Creates a bounded, payload-free bridge receive log line.
 * @param {Object} payload
 * @returns {String}
 */
export const formatBridgePayloadSummary = payload => {
    const message = payload?.message ?? {},
          error   = message?.error ?? payload?.error,
          fields  = [
              ['type',         payload?.type],
              ['appWorkerId',  payload?.appWorkerId],
              ['agentId',      payload?.agentId],
              ['messageId',    message?.id],
              ['method',       message?.method],
              ['errorCode',    error?.code],
              ['payloadBytes', getBridgePayloadByteLength(payload) ?? 'unknown']
          ];

    return `[ConnectionService] Bridge message ${fields
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${value}`)
        .join(' ')}`
};

/**
 * @summary Logs a bridge payload without dumping its full body unless debug is enabled.
 * @param {Object} payload
 * @param {Object} options
 * @param {Object} options.logger
 * @param {Boolean} options.debug
 * @param {Number} options.maxChars
 */
export const logBridgePayload = (payload, {logger, debug, maxChars}) => {
    logger.info(formatBridgePayloadSummary(payload));

    if (debug) {
        logger.debug(`[ConnectionService] Bridge payload ${stringifyBridgePayloadForDebug(payload, maxChars)}`);
    }
};

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
 * @class Neo.ai.services.neural-link.ConnectionService
 * @extends Neo.core.Base
 * @singleton
 */
class ConnectionService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.neural-link.ConnectionService'
         * @protected
         */
        className: 'Neo.ai.services.neural-link.ConnectionService',
        /**
         * @member {String|null} cwd=null @protected
         */
        cwd: null,
        /**
         * @member {String|null} lastSpawnFailure=null
         * Sanitized reason the most recent Bridge spawn failed (error `code`, or a short message
         * with no paths/argv), surfaced through `getStatus()` so healthcheck can attribute an
         * unconnected Bridge instead of only reporting that it is down.
         * @protected
         */
        lastSpawnFailure: null,
        /**
         * @member {Number} bridgeInfoTimeout=1000
         * @protected
         */
        bridgeInfoTimeout: 1000,
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
        // Skip the Bridge auto-connect under unitTestMode: unit specs that import this singleton (e.g. via
        // HealthService) must stay hermetic and must not reach or spawn the live Bridge. The e2e harness
        // connects explicitly via manageConnection(); production (non-unitTestMode) auto-connects as before.
        // Defer when `cwd` is still unresolved. This singleton is constructed by its own import
        // (`Server.mjs:4`), which runs BEFORE the entrypoint assigns `ConnectionService.cwd` from
        // `--cwd`. Spawning here therefore races the assignment and loses: a server launched
        // perfectly with `--cwd` would still spawn its Bridge from the wrong directory — or, once
        // the hidden `process.cwd()` default is gone, fail outright on the good path.
        //
        // The entrypoint owns connection startup because it is the only participant that knows the
        // real working directory. `spawnBridge()` keeps its loud refusal for the case where nothing
        // ever supplies one, which is a genuine misconfiguration rather than a boot ordering artifact.
        if (resolveBridgeAutoConnect({
            unitTestMode: Neo.config.unitTestMode,
            autoConnect : aiConfig.autoConnect,
            cwd         : this.cwd
        }) === 'connect') {
            await this.ensureBridgeAndConnect();
        } else if (!Neo.config.unitTestMode && aiConfig.autoConnect) {
            logger.fileDebug('[ConnectionService] Bridge auto-connect deferred: awaiting entrypoint-supplied cwd.');
        }
    }

    /**
     * @summary Builds the agent-side Bridge WebSocket URL from the resolved config leaf.
     * @param {Object} [options={}]
     * @param {String} [options.agentId=this.agentId]
     * @param {Number} [options.port=aiConfig.port]
     * @param {String} [options.token=process.env.NEO_FLEET_BRIDGE_TOKEN]
     * @returns {String}
     */
    createBridgeUrl({agentId = this.agentId, port = aiConfig.port, token = process.env.NEO_FLEET_BRIDGE_TOKEN} = {}) {
        const url = new URL(`ws://127.0.0.1:${port}`);

        url.searchParams.set('role', 'agent');
        url.searchParams.set('id', agentId);

        if (token) {
            url.searchParams.set('token', token)
        }

        return url.toString()
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

        // Resolve the target session (explicit target honored; silent multi-session auto-targeting denied).
        sessionId = resolveCallTarget(sessionId, Array.from(this.sessionData.keys()));

        const id         = ++this.msgId;
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
            // Present the FM-minted, asymmetrically-signed Bridge token (injected at spawn under
            // NEO_FLEET_BRIDGE_TOKEN) so the Bridge authenticates this agent from the signature, not
            // the `?id=` claim. Absent in no-FM dev → the Bridge's legacy unauthenticated path.
            const port = aiConfig.port,
                  url  = this.createBridgeUrl({port}),
                  ws   = new WebSocket(url);

            let settled = false;

            const rejectOnce = (error, closeSocket = true) => {
                if (settled) return;

                settled = true;
                clearTimeout(handshakeTimeout);

                if (closeSocket && ws.readyState === WebSocket.OPEN) {
                    ws.close()
                }

                reject(error);
            };

            const resolveOnce = () => {
                if (settled) return;

                settled = true;
                clearTimeout(handshakeTimeout);

                this.bridgeSocket = ws;
                resolve();
            };

            const handshakeTimeout = setTimeout(() => {
                rejectOnce(createStaleBridgeError(
                    `Stale Neural Link Bridge on port ${port}: missing ${BRIDGE_INFO_TYPE} freshness handshake. ` +
                    'Stop or refresh the existing bridge, or run against a dedicated fresh Bridge port.'
                ));
            }, this.bridgeInfoTimeout);

            ws.on('open', () => {
                logger.info(`Connected to Neural Link Bridge as ${this.agentId}; awaiting ${BRIDGE_INFO_TYPE}`);
            });

            ws.on('message', (data) => {
                if (!settled) {
                    let payload;

                    try {
                        payload = JSON.parse(data.toString())
                    } catch {
                        return
                    }

                    if (payload?.type !== BRIDGE_INFO_TYPE) {
                        return
                    }

                    if (!isBridgeInfoPayloadFresh(payload)) {
                        rejectOnce(createStaleBridgeError(
                            `Stale Neural Link Bridge on port ${port}: incompatible ${BRIDGE_INFO_TYPE} ` +
                            `payload ${JSON.stringify(payload)}.`
                        ));
                        return
                    }

                    logger.info(`Verified Neural Link Bridge freshness on port ${port}`);
                    resolveOnce();
                    return
                }

                this.handleBridgeMessage(data)
            });

            ws.on('close', () => {
                logger.warn('Disconnected from Neural Link Bridge');
                this.bridgeSocket = null;
                rejectOnce(new Error('Neural Link Bridge closed before freshness handshake completed.'), false);
                // Optional: Auto-reconnect logic could go here
            });

            ws.on('error', (err) => {
                if (!settled) {
                    rejectOnce(err, false); // Reject if error happens during initial connect
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
            if (e.code === STALE_BRIDGE_ERROR_CODE) {
                logger.error(e.message);
                throw e
            }

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
     * @returns {String|null}
     */
    getDefaultSessionId() {
        if (this.sessionData.size > 0) {
            return Array.from(this.sessionData.keys()).pop();
        }
        return null;
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
            agents         : Array.from(this.activeAgents),
            // Resolved at the use site from the SSOT, exactly like `createBridgeUrl()` and the spawn
            // path. Reporting a class-field default here is how healthcheck came to answer 8081 for
            // a server configured on another port — the operator then debugs the wrong socket.
            port           : aiConfig.port,
            // Sanitized on capture, not here: an operator needs to know the Bridge failed to spawn
            // and why, without the payload carrying host paths or argv.
            lastSpawnFailure: this.lastSpawnFailure
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
     * @param {String} [appName='Unknown']
     */
    handleAppConnected(appWorkerId, appName = 'Unknown') {
        logger.info(`App Worker connected: ${appWorkerId} (${appName})`);
        this.sessionData.set(appWorkerId, {
            appName,
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
            logBridgePayload(payload, {
                logger,
                debug   : aiConfig.debug,
                maxChars: aiConfig.bridgePayloadDebugMaxChars
            });

            switch (payload.type) {
                case 'app_connected':
                    this.handleAppConnected(payload.appWorkerId, payload.appName);
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
     * Opens the detached Bridge stdout/stderr log file.
     * @param {String} [filePath=getBridgeStdioLogPath()]
     * @returns {Number}
     */
    openBridgeLogFile(filePath = getBridgeStdioLogPath()) {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});

        return fs.openSync(filePath, 'a')
    }

    /**
     * Spawns a detached child process. Kept as a method so tests can verify spawn wiring without
     * launching the live Bridge.
     * @param {String} command
     * @param {String[]} args
     * @param {Object} options
     * @returns {Object}
     */
    spawnBridgeProcess(command, args, options) {
        return spawn(command, args, options)
    }

    /**
     * Spawns the Bridge process.
     * @param {Object} [options={}]
     * @param {String} [options.logPath=aiConfig.logPath] Directory for spawned Bridge stdout/stderr.
     * @param {Number} [options.startupDelayMs=2000] Delay before resolving after spawning.
     * @returns {Promise<void>}
     */
    async spawnBridge({logPath = aiConfig.logPath, startupDelayMs = 2000} = {}) {
        // `this.cwd || process.cwd()` was a hidden-default fallback, and it substituted the WRONG
        // value silently. A GUI-launched MCP server has `process.cwd() === '/'`, so `npm run` looked
        // for `/package.json`, the Bridge never started, and the resulting ECONNREFUSED took the whole
        // server down — the seat lost every Neural Link tool for the session.
        //
        // The cwd is assigned by the entrypoint (`--cwd` → `Server.mjs`), but this singleton is
        // constructed at module import, so an auto-connect can outrun that assignment. Failing loudly
        // here is what makes the race legible: a named error names the missing input, where `/` named
        // nothing and produced an ENOENT three layers away. A hidden default that substitutes a
        // wrong value is worse than no default: it converts a missing input into a distant symptom.
        return new Promise((resolve, reject) => {
            const args    = ['run', 'ai:server-neural-link'];
            const file    = getBridgeStdioLogPath({logPath});
            const logFile = this.openBridgeLogFile(file);
            const port    = aiConfig.port;

            // Checked AFTER argument validation and immediately before the spawn: a caller who passed
            // a bad `logPath` should hear about their argument, not about instance state they did not
            // supply. Both refusals still precede any process launch.
            if (!this.cwd) {
                throw new Error(
                    'ConnectionService.spawnBridge: `cwd` is unresolved. It is supplied by the Neural ' +
                    'Link MCP entrypoint (`--cwd`) and must be assigned before a spawn. Refusing to ' +
                    'substitute process.cwd() — on a GUI-launched server that is `/`, and the Bridge ' +
                    'cannot start there.'
                );
            }

            this.bridgeProcess = this.spawnBridgeProcess('npm', args, {
                cwd     : this.cwd,
                detached: true,
                env     : {...process.env, NEO_NL_PORT: String(port)},
                stdio   : ['ignore', logFile, logFile]
            });

            // A spawn failure arrives as an asynchronous 'error' EVENT, not a throw and not a
            // rejection — so `boot()`'s try/catch cannot see it, and an unhandled 'error' on an
            // EventEmitter is fatal to the process. Without this listener a Bridge that cannot be
            // spawned (missing cwd, npm not on PATH) takes the whole MCP server down with it —
            // the opposite of the survivability this boot path exists to provide. Rejecting instead
            // routes the failure back into the caller's existing non-fatal handling.
            this.bridgeProcess.once('error', error => {
                // Sanitized deliberately: `error.message` carries the spawn path and argv, and this
                // value travels to any healthcheck caller. The code (ENOENT, EACCES) is what an
                // operator acts on; the path is what leaks.
                this.lastSpawnFailure = error.code || 'BRIDGE_SPAWN_FAILED';
                logger.error(`[ConnectionService] Bridge spawn failed: ${error.message}`);
                reject(error)
            });

            this.bridgeProcess.unref();

            // Honors the PARAMETER it declares. The literal `2000` ignored `startupDelayMs` entirely,
            // so every caller's value was silently discarded — a spec could pass 0 and still wait two
            // seconds, which is how a contract stays untested. Measured bind is ~498ms; this is a
            // correctness fix, not a latency one.
            setTimeout(resolve, startupDelayMs);
        });
    }

    /**
     * Waits for a session matching the given ID or AppName to become active.
     * @param {String} target The appWorkerId or appName to wait for.
     * @param {Number} [timeout=10000] Ms to wait before rejecting.
     * @returns {Promise<String>} The matched appWorkerId.
     */
    async waitForSession(target, timeout = 10000) {
        const check = () => {
             // Tolerate a non-string target (e.g. an unresolved worker-id envelope): degrade to a clean
             // timeout rather than a TypeError. Callers should pass a string appWorkerId or appName.
             const targetLower = String(target ?? '').toLowerCase();
             for (const [id, meta] of this.sessionData.entries()) {
                 if (id === target || meta.appName?.toLowerCase() === targetLower) {
                     return id;
                 }
             }
             return null;
        };

        let found = check();
        if (found) return found;

        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval  = setInterval(() => {
                found = check();
                if (found) {
                    clearInterval(interval);
                    resolve(found);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    reject(new Error(`waitForSession timed out looking for: ${target}`));
                }
            }, 100);
        });
    }
}

export default Neo.setupClass(ConnectionService);
