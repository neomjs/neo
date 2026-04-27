import {execSync}                                      from 'node:child_process';
import {McpServer}                                     from '@modelcontextprotocol/sdk/server/mcp.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import Base                                            from '../../../../src/core/Base.mjs';
import aiConfig                                        from './config.mjs';
import logger                                          from './logger.mjs';
import GraphService                                    from './services/GraphService.mjs';
import HealthService                                   from './services/HealthService.mjs';
import SessionService                                  from './services/SessionService.mjs';
import InferenceLifecycleService                       from './services/lifecycle/InferenceLifecycleService.mjs';
import {listTools, callTool}                           from './services/toolService.mjs';
import AuthMiddleware                                  from '../shared/services/AuthMiddleware.mjs';
import RequestContextService                           from '../shared/services/RequestContextService.mjs';
import StdioIdentityResolver                           from '../shared/services/StdioIdentityResolver.mjs';
import WakeSubscriptionService                         from './services/WakeSubscriptionService.mjs';
import CoalescingEngineService                         from './services/CoalescingEngineService.mjs';
/**
 * @summary The Memory Core MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Memory Core MCP server.
 * This server uses a dual-transport architecture, allowing it to communicate with local CLI clients
 * via `stdio` (the default) or with cloud-native/remote clients via `sse` (StreamableHTTPServerTransport).
 *
 * The transport mode and HTTP port can be configured using `aiConfig.transport` and `aiConfig.ssePort`.
 *
 * @class Neo.ai.mcp.server.memory-core.Server
 * @extends Neo.core.Base
 */
class Server extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Server'
    }

    /**
     * Path to a custom configuration file.
     * @member {String|null} configFile=null
     */
    configFile = null
    /**
     * The MCP Server instance.
     * @member {McpServer|null} mcpServer=null
     * @protected
     */
    mcpServer = null
    /**
     * Resolved agent identity for stdio transport sessions (ticket #10145). Populated at
     * `initAsync()` time via `StdioIdentityResolver` + AgentIdentity graph-node binding. Null
     * when running under SSE transport (identity flows per-request via `AuthService` /
     * `RequestContextService` instead) or when stdio resolution yielded no identity.
     * @member {Object|null} stdioIdentity=null
     * @protected
     */
    stdioIdentity = null

    /**
     * Async initialization sequence.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // 1. Load custom configuration if provided
        if (this.configFile) {
            try {
                await aiConfig.load(this.configFile);
            } catch (error) {
                logger.error('Failed to load configuration:', error);
                throw error; // Re-throw to trigger ready() catch block in runner
            }
        }

        // 2. Initialize MCP Server instance
        this.mcpServer = new McpServer({
            name   : 'neo-memory-core',
            version: process.env.npm_package_version || '1.0.0',
        }, {
            capabilities: {
                tools: {
                    listChanged: false
                },
                experimental: {
                    'neo-wake-substrate': {
                        version: '1.0',
                        supportedEvents: ['wake/sent_to_me', 'wake/task_state_changed', 'wake/permission_granted']
                    }
                }
            }
        });

        await WakeSubscriptionService.init();
        CoalescingEngineService.setMcpServer(this.mcpServer);

        // 3. Setup Request Handlers
        this.setupRequestHandlers();

        // 4. Wait for dependent services
        // SessionService is a singleton, so we wait for its global ready state
        await InferenceLifecycleService.ready();
        await SessionService.ready();

        // 5. Resolve stdio identity (if applicable) BEFORE the boot-time healthcheck snapshot
        // (#10249). Elevated out of the stdio transport-connect branch so the initial telemetry
        // logged by `logStartupStatus` reflects the bound identity state, not the pre-bind null.
        // Runtime MCP healthcheck tool-dispatch already reads `#stdioIdentityState` live per call,
        // so this reorder affects boot-log observability only — not runtime correctness.
        if (aiConfig.transport !== 'sse') {
            // Resolve stdio identity before connecting the transport (ticket #10145). The
            // resolved context is cached on this.stdioIdentity and wrapped around every
            // CallToolRequestSchema dispatch so downstream services (e.g. MemoryService) read
            // a consistent identity via RequestContextService.getUserId(). SSE mode skips
            // this path — TransportService performs the equivalent wrap per-request using
            // OIDC-derived identity.
            this.stdioIdentity = await this.resolveStdioIdentity();

            // Surface stdio identity state for healthcheck observability (#10176). The block
            // is informational-only — unbound identity does NOT flip healthcheck status to
            // unhealthy because mailbox is an optional feature and single-tenant fallthrough
            // is a valid operational mode (see MemoryCoreMcpAuth.md contract).
            HealthService.setStdioIdentityState(this.stdioIdentity);

            // Auto-invoke wake subscription bootstrap (per #10437; closes the missing AC from
            // #10402 Phase 1). Without this, every new session boots with zero active
            // WAKE_SUBSCRIPTION nodes for the bound identity until an agent manually calls
            // `manage_wake_subscription({action: 'bootstrap'})` — a discipline burden that
            // does not survive context-pruning. The substrate-level auto-invoke makes the
            // wake-substrate genuinely self-healing, mirroring the #10181/#10182 dispatch-time
            // identity-binding self-heal pattern.
            //
            // **Single-error-boundary design:** wrapping the entire `RequestContextService.run()`
            // call inside an async IIFE's try/catch unifies error handling across all failure
            // sources — synchronous throws during `RequestContextService.run()` setup, synchronous
            // throws inside `bootstrap()`'s setup before its first `await` (e.g., the
            // identity-binding guard at WakeSubscriptionService.mjs:209), and asynchronous
            // rejections from `bootstrap()`'s SQLite/GraphService awaits all converge on the same
            // catch. Fire-and-forget by not awaiting the IIFE — boot continues unconditionally
            // (per @neo-gemini-3-1-pro's PR #10438 cycle 1 challenge: tightens the dual-catch
            // pattern that the original implementation used; the IIFE's try/catch is the
            // canonical single error boundary for fire-and-forget async operations).
            //
            // **`RequestContextService.run()` rationale:** `bootstrap()` calls
            // `RequestContextService.getAgentIdentityNodeId()` (line 208 of WakeSubscriptionService),
            // which throws unless executed inside a `run()` scope — so the wrap is required, not
            // ceremonial. The identity context shape `{userId, username, agentIdentityNodeId, source}`
            // is the same one the per-tool dispatch wrap consumes downstream.
            //
            // **Idempotency:** safe to repeat across restarts per #10412's raw-SQL idempotency
            // check — already-existing subs return `status: 'existing'` rather than creating
            // duplicates. Missing-template throws are caught + logged at warn level (legitimate
            // single-tenant fallthrough; not a fatal boot error).
            if (this.stdioIdentity?.agentIdentityNodeId) {
                (async () => {
                    try {
                        const result = await RequestContextService.run(
                            this.stdioIdentity,
                            () => WakeSubscriptionService.bootstrap()
                        );
                        logger.info(`[neo-memory-core MCP] Wake subscription auto-bootstrap: ${result.status} (${result.subscriptionId})`);
                    } catch (err) {
                        logger.warn(`[neo-memory-core MCP] Wake subscription auto-bootstrap skipped (non-fatal): ${err.message}`);
                    }
                })();
            }
        }

        // 6. Perform Health Check & Log Status (sees populated stdioIdentityState post-reorder)
        const health = await HealthService.healthcheck();
        this.logStartupStatus(health);
        this.logSiblingConcurrency();

        // 7. Connect Transport
        if (aiConfig.transport === 'sse') {
            const {default: TransportService} = await import('../shared/services/TransportService.mjs');

            await TransportService.setup({
                server      : this,
                aiConfig,
                logger,
                resourceName: 'neo-memory-core MCP'
            });
        } else {
            const {StdioServerTransport} = await import('@modelcontextprotocol/sdk/server/stdio.js');
            const transport = new StdioServerTransport();
            
            if (!this.mcpServer) return; // Prevent crash if instance was destroyed during async boot
            
            await this.mcpServer.connect(transport);

            logger.info('[neo-memory-core MCP] Server started on stdio transport');
            logger.info('[neo-memory-core MCP] Available tools loaded from OpenAPI spec');
            this.logIdentityStatus();
        }
    }

    /**
     * Resolves the active stdio agent identity and binds it to its AgentIdentity graph node.
     *
     * Composes three steps: (1) `StdioIdentityResolver.resolve()` returns the GitHub identity
     * via the env-var → gh-CLI chain; (2) `GraphService.getNode({id: '@' + githubLogin})`
     * looks up the matching seeded AgentIdentity node (#10144 convention); (3) the composite
     * is shaped for `RequestContextService.run()` consumption.
     *
     * Missing graph node is non-fatal: the identity still flows as `userId` tag, but
     * `agentIdentityNodeId` is null. Unseeded agents can write memories — they just can't yet
     * terminate `AUTHORED_BY` edges on a graph node until someone adds them via
     * `seedAgentIdentities.mjs`.
     *
     * @returns {Promise<Object|null>} Context object for `RequestContextService.run()`, or
     *     `null` when resolution yielded no identity (single-tenant fallthrough).
     * @protected
     */
    async resolveStdioIdentity() {
        const resolved = await StdioIdentityResolver.resolve();

        if (!resolved.githubLogin) {
            return null;
        }

        const agentIdentityNodeId = await this.bindAgentIdentity(resolved.githubLogin);

        return {
            userId             : resolved.githubLogin,
            username           : resolved.username,
            agentIdentityNodeId,
            source             : resolved.source
        };
    }

    /**
     * Builds the RequestContext for an SSE-transport request. Invoked by `TransportService.setup`
     * via duck-typed hook — shared transport code checks `typeof server.buildRequestContext ===
     * 'function'` and calls it once the OIDC-introspected `req.auth` is available. Returning
     * `{}` when no identity is present preserves the single-tenant fallthrough semantics.
     *
     * This is the SSE analog of `resolveStdioIdentity()` — both paths end at a context shape
     * `RequestContextService.run()` accepts, both bind `agentIdentityNodeId` via the same
     * `bindAgentIdentity()` helper, and both tag the `source` provenance field.
     *
     * @param {Object|undefined} reqAuth The auth context populated by `AuthService.verifyAccessToken`.
     *     Keys: `{userId, username, source: 'oidc', ...}`. Undefined when the SSE request
     *     arrived with OIDC disabled (local dev).
     * @returns {Promise<Object>} RequestContext shape; `{}` when no identity is resolvable.
     * @protected
     */
    async buildRequestContext(reqAuth) {
        if (!reqAuth?.userId) {
            return {};
        }

        const agentIdentityNodeId = await this.bindAgentIdentity(reqAuth.userId);

        return {
            userId             : reqAuth.userId,
            username           : reqAuth.username,
            agentIdentityNodeId,
            source             : reqAuth.source || 'oidc'
        };
    }

    /**
     * Resolves a bare GitHub login to its seeded AgentIdentity graph node ID (per ticket
     * #10144's `@`-prefixed ID convention). Shared between `resolveStdioIdentity` (stdio boot)
     * and `buildRequestContext` (per-SSE-request) so both transports reach the same node
     * lookup behavior.
     *
     * Missing node is non-fatal: returns `null`. Downstream services that build `AUTHORED_BY`
     * graph edges treat `null` as "skip edge creation for this write" rather than failing
     * the write — unseeded agents can still accumulate memories.
     *
     * @param {String|undefined|null} userId The bare GitHub login (no `@` prefix).
     * @returns {Promise<String|null>} The AgentIdentity node ID or `null` if unresolvable.
     * @protected
     */
    async bindAgentIdentity(userId) {
        if (!userId) {
            return null;
        }

        const graphNodeId = '@' + userId;

        try {
            // Ensure the graph is fully loaded before the lookup. Without this await a
            // cold-boot race would silently miss seeded identity nodes.
            await GraphService.ready();
            
            // `GraphService.getNode` returns a Promise (Neo's singleton method wrapper);
            // awaiting it unpacks to the `{id, type, name, ...}` shape. Without `await`,
            // `node.id` on the Promise object is `undefined`, causing bind to silently
            // return `undefined` — the true root cause of the #10241 boot-time bind failure
            // that busy_timeout/retry/reorder patches only partially masked.
            let retries = 3;
            let node = null;
            
            while (retries > 0) {
                node = await GraphService.getNode({id: graphNodeId});
                if (node) {
                    return node.id;
                }
                
                // If not found, it might be due to a stuck vicinity cache from a concurrent boot lock.
                // Clear the specific node from the cache and try again.
                if (GraphService.db && GraphService.db.vicinityLoadedNodes) {
                    GraphService.db.vicinityLoadedNodes.delete(graphNodeId);
                }
                
                await new Promise(resolve => setTimeout(resolve, 50));
                retries--;
            }
            
            logger.warn(`[neo-memory-core MCP] AgentIdentity graph lookup failed for ${graphNodeId}: Node not found in database`);
            return null;
        } catch (error) {
            logger.warn(`[neo-memory-core MCP] AgentIdentity graph lookup failed for ${graphNodeId}: ${error.message}`);
            return null;
        }
    }

    /**
     * Logs the resolved stdio identity state during startup for operator visibility.
     * @protected
     */
    logIdentityStatus() {
        if (!this.stdioIdentity) {
            logger.info('[neo-memory-core MCP] Identity: unresolved (single-tenant fallthrough)');
            return;
        }

        const {userId, agentIdentityNodeId, source} = this.stdioIdentity;
        const bound                                 = agentIdentityNodeId ? `bound to ${agentIdentityNodeId}` : 'unbound (no matching AgentIdentity node)';

        logger.info(`[neo-memory-core MCP] Identity: ${userId} via ${source} — ${bound}`);
    }

    /**
     * Helper to log collection statistics.
     * @param {Object} health The health check result object.
     */
    logCollectionStats(health) {
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    }

    /**
     * Logs the health status of the server during startup.
     * @param {Object} health The health check result object.
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database.process.running) {
                logger.warn('    💡 Tip: Use the start_database tool after server starts, or run:');
                logger.warn(`       chroma run --path ${process.env.CHROMA_DATA_PATH || './data/chroma'} --port ${process.env.CHROMA_PORT || '8000'}`);
            }
            logger.warn('    The server will periodically retry and recover automatically once dependencies are met.');
        } else if (health.status === 'degraded') {
            logger.warn('⚠️  [Startup] Memory Core is degraded. Some features may be unavailable.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            logger.info('✅ [Startup] ChromaDB connectivity confirmed');
            this.logCollectionStats(health);
        } else {
            logger.info('✅ [Startup] Memory Core health check passed');
            this.logCollectionStats(health);
        }
    }

    /**
     * @summary Boot-time diagnostic that invokes `lsof` to detect SQLite file contention.
     * Checks for sibling MCP server processes holding the memory-core SQLite files
     * and logs them for visibility (ticket #10188).
     * 
     * Uses the same empirical `lsof` + PID walk pattern established in 
     * @see {file} ../../../scripts/diagnoseMcpConcurrency.mjs
     * 
     * @protected
     */
    logSiblingConcurrency() {
        const dbPath = aiConfig.storagePaths.graph;
        if (!dbPath) return;

        const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

        try {
            // lsof -F pcn will list PID, command name, and file path for holding processes.
            const raw = execSync(`lsof -F pcn -- ${files.map(f => `'${f}'`).join(' ')}`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });

            // Parse output:
            let current = null;
            const records = [];
            for (const line of raw.split('\n')) {
                if (!line) continue;
                if (line[0] === 'p') {
                    if (current && current.pid !== process.pid) records.push(current);
                    current = { pid: parseInt(line.slice(1), 10) };
                } else if (current && line[0] === 'c') {
                    current.command = line.slice(1);
                }
            }
            if (current && current.pid !== process.pid) records.push(current);

            // Deduplicate by PID
            const uniquePids = new Set();
            const siblings = records.filter(r => {
                if (uniquePids.has(r.pid)) return false;
                uniquePids.add(r.pid);
                return true;
            });

            if (siblings.length > 0) {
                logger.info(`ℹ️  [Startup] Sibling concurrency: ${siblings.length} peer process(es) holding SQLite files. PIDs: ${siblings.map(s => s.pid).join(', ')}`);
            }
        } catch (error) {
            // Ignore ENOENT (lsof missing on Windows) or status 1 (no matching processes)
            if (error.status !== 1 && error.code !== 'ENOENT') {
                logger.debug(`[Startup] Failed to check sibling concurrency: ${error.message}`);
            }
        }
    }

    /**
     * Wires up the MCP request handlers for listing and calling tools.
     */
    setupRequestHandlers() {
        // List Tools Handler
        this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
            try {
                const { cursor, limit } = request.params || {};
                const { tools, nextCursor } = listTools({ cursor, limit });

                const mcpTools = tools.map(tool => ({
                    name        : tool.name,
                    title       : tool.title,
                    description : tool.description,
                    inputSchema : tool.inputSchema,
                    outputSchema: tool.outputSchema,
                    annotations : tool.annotations
                }));

                const result = { tools: mcpTools };

                if (nextCursor) {
                    result.nextCursor = nextCursor;
                }
                return result;
            } catch (error) {
                return { tools: [], nextCursor: undefined, error: error.message };
            }
        });

        // Call Tool Handler
        this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                logger.debug(`[MCP] Calling tool: ${name} with args:`, JSON.stringify(args));

                // Anti-spoof guard (ticket #10145): reject any tool-call argument that would
                // let the client override server-stamped identity. No-op on existing tool
                // schemas; activates once Mailbox (#10139) adds `from` fields.
                AuthMiddleware.validateNoIdentitySpoof(args);

                const exemptFromHealthCheck = ['healthcheck', 'start_database', 'stop_database'];

                if (!exemptFromHealthCheck.includes(name)) {
                    try {
                        await HealthService.ensureHealthy();
                    } catch (healthError) {
                        logger.error(`[MCP] Health check failed for tool ${name}:`, healthError.message);
                        return {
                            content: [{
                                type: 'text',
                                text: `Cannot execute ${name}: ${healthError.message}`
                            }],
                            isError: true
                        };
                    }
                }

                // Wrap the tool dispatch in RequestContextService.run() when a stdio identity
                // was resolved (ticket #10145). This establishes the AsyncLocalStorage-scoped
                // context that MemoryService.addMemory, etc. read via getUserId() to tag
                // ChromaDB writes per tenant. SSE mode leaves stdioIdentity null because
                // TransportService has already wrapped the /mcp request with per-request OIDC
                // identity — re-wrapping here would clobber that context.
                const dispatch = () => callTool(name, args);
                const result   = this.stdioIdentity
                    ? await RequestContextService.run(this.stdioIdentity, dispatch)
                    : await dispatch();

                let contentBlock;
                let isError           = false;
                let structuredContent = null;

                if (Neo.isObject(result)) {
                    isError = 'error' in result;

                    if (isError) {
                        contentBlock = {
                            type: 'text',
                            text: `Tool Error: ${result.error || 'Unknown Error'}. Message: ${result.message || 'No message provided.'}`
                        };
                    } else {
                        contentBlock = {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        };
                        structuredContent = result;
                    }
                } else {
                    contentBlock = {
                        type: 'text',
                        text: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
                    };
                    structuredContent = { result };
                }

                const response = {
                    content: [contentBlock],
                    isError
                };

                if (structuredContent) {
                    response.structuredContent = structuredContent;
                }

                return response;
            } catch (error) {
                logger.error(`[MCP] Error executing tool ${name}:`, error);

                return {
                    content: [{
                        type: 'text',
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }
}

export default Neo.setupClass(Server);
