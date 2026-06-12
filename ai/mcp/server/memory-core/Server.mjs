import {execSync}                  from 'node:child_process';
import BaseServer                  from '../BaseServer.mjs';
import logger                      from './logger.mjs';
import {listTools, callTool}       from './toolService.mjs';
import AuthMiddleware              from '../shared/services/AuthMiddleware.mjs';
import RequestContextService       from '../shared/services/RequestContextService.mjs';
import StdioIdentityResolver       from '../shared/services/StdioIdentityResolver.mjs';
import BootEnvelopeResolver        from '../shared/services/BootEnvelopeResolver.mjs';
import {
    formatHarnessGroups,
    groupProcessesByHarness
} from '../../../services/memory-core/helpers/harnessClassifier.mjs';

import {
    Memory_Config                  as aiConfig,
    Memory_GraphService            as GraphService,
    Memory_HealthService           as HealthService,
    Memory_SessionService          as SessionService,
    Memory_InferenceLifecycleService as InferenceLifecycleService,
    Memory_StorageRouter           as StorageRouter,
    Memory_WakeSubscriptionService as WakeSubscriptionService,
    Memory_CoalescingEngineService as CoalescingEngineService
} from '../../../services.mjs';
import {startDrainLoop}   from '../../../daemons/embed/drainCycle.mjs';
import {acquireDrainLock} from '../../../daemons/embed/drainLock.mjs';

/**
 * @summary The Memory Core MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Memory Core MCP server.
 * This server uses a dual-transport architecture, allowing it to communicate with local CLI clients
 * via `stdio` (the default) or with cloud-native/remote clients via `sse` (StreamableHTTPServerTransport).
 *
 * The transport mode and HTTP port can be configured using `aiConfig.transport` and `aiConfig.mcpHttpPort`.
 *
 * @class Neo.ai.mcp.server.memory-core.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    /**
     * Resolved agent identity for stdio transport sessions. Populated by `boot()` via
     * `StdioIdentityResolver` + AgentIdentity graph-node binding. Null when
     * running under SSE transport (identity flows per-request via `AuthService` /
     * `RequestContextService` instead) or when stdio resolution yielded no identity.
     * @member {Object|null} stdioIdentity=null
     * @protected
     */
    stdioIdentity = null

    /**
     * @summary MCP server identity for `createMcpServer()`. Includes the experimental
     * `neo-wake-substrate` capability that surfaces wake events for connected clients.
     * @returns {{name: String, version: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-memory-core',
            version     : process.env.npm_package_version || '1.0.0',
            capabilities: {
                tools: {listChanged: false},
                experimental: {
                    'neo-wake-substrate': {
                        version: '1.0',
                        supportedEvents: ['wake/sent_to_me', 'wake/task_state_changed', 'wake/permission_granted']
                    }
                }
            }
        };
    }

    /**
     * @summary Per-server tool registry for ListTools / CallTool dispatch.
     * @returns {{listTools: Function, callTool: Function}}
     */
    getToolService() {
        return {listTools, callTool};
    }

    /**
     * @summary HealthService for the healthcheck gate + startup-status logging.
     * @returns {Object}
     */
    getHealthService() {
        return HealthService;
    }

    /**
     * @summary Tools allowed without the healthcheck gate. The A2A
     * mailbox/permission surface is graph/SQLite-scoped and must remain reachable during
     * summarization/vector-provider incidents so agents can coordinate the recovery — as is
     * add_memory, whose never-fail WAL write is local-disk-scoped with the embed deferred to the
     * drain, so memory capture never blocks on an embedder/vector-provider outage.
     *
     * The non-embedding reads are exempt for the same reason. The gate trips on the embedder canary
     * (a live `embedText` probe), but `get_session_memories` (a Chroma metadata `.get()` by
     * sessionId) and `query_recent_turns` (a SQLite recency read over the `AGENT_MEMORY` graph, with
     * a WAL-overlay fallback for its optional Chroma content join) call no embedder — they serve
     * fine while it is down, so gating them only denied a read the outage never touched. NOT exempt:
     * `query_raw_memories` / `query_summaries`, which embed the query and genuinely cannot serve
     * during an embedder outage — exempting them would trade a clean gate-reject for an embed-timeout.
     * @returns {Array<String>}
     */
    getHealthExemptTools() {
        return [
            'healthcheck',
            'add_memory',
            'add_message',
            'list_messages',
            'get_message',
            'mark_read',
            'archive_message',
            'delete_message',
            'transition_task',
            'grant_permission',
            'revoke_permission',
            'list_permissions',
            'manage_wake_subscription',
            'get_session_memories',
            'query_recent_turns'
        ];
    }

    /**
     * @summary Pre-dispatch identity-spoof guard. Rejects any tool-call argument
     * that would let the client override server-stamped identity. No-op on existing tool
     * schemas; activates when a tool exposes sender-owned identity fields. Throws bubble to the
     * outer CallTool try/catch and route to `formatToolError`.
     * @param {{toolName: String, args: Object}} context
     */
    async beforeToolDispatch({args}) {
        AuthMiddleware.validateNoIdentitySpoof(args);
    }

    /**
     * @summary Wraps tool dispatch in `RequestContextService.run()` when stdio identity is
     * resolved. Establishes the AsyncLocalStorage-scoped context that
     * `MemoryService.addMemory`, etc. read via `getUserId()` to tag ChromaDB writes per
     * tenant. SSE mode leaves `stdioIdentity` null because `TransportService` already wraps
     * the `/mcp` request with per-request OIDC identity — re-wrapping here would clobber
     * that context.
     * @param {Function} dispatch
     */
    async wrapDispatch(dispatch) {
        return this.stdioIdentity
            ? RequestContextService.run(this.stdioIdentity, dispatch)
            : dispatch();
    }

    /**
     * @summary Override of `BaseServer.createMcpServer` — chains super then registers the
     * mcpServer instance with `CoalescingEngineService` so it can broadcast wake events to
     * the SDK's `experimental.neo-wake-substrate` capability subscribers. Used both at boot
     * and per-request (SSE mode) to provision dedicated server objects per connection.
     * @returns {McpServer}
     */
    createMcpServer() {
        const mcpServer = super.createMcpServer();
        CoalescingEngineService.addMcpServer(mcpServer);
        return mcpServer;
    }

    /**
     * @summary Custom boot order (override of `BaseServer.boot`). Memory Core's bootstrap
     * has three constraints that the canonical sequence doesn't satisfy:
     *
     * 1. `WakeSubscriptionService.init()` must complete BEFORE `createMcpServer()` so the
     *    experimental wake-substrate capability has its substrate ready when clients connect.
     * 2. Stdio identity resolution must complete BEFORE healthcheck, so the boot-time
     *    healthcheck snapshot reflects the bound identity state.
     * 3. The wake-subscription auto-bootstrap is fire-and-forget within an async IIFE for
     *    single-error-boundary discipline; it must run AFTER stdio identity is bound.
     *
     * @returns {Promise<void>}
     */
    async boot() {
        await this.loadCustomConfig();

        // Pre-mcpServer init: WakeSubscriptionService substrate ready.
        await WakeSubscriptionService.init();

        this.mcpServer = this.createMcpServer();

        // Wait for dependent services.
        await InferenceLifecycleService.ready();
        await SessionService.ready();

        // In-process WAL drain (containerized / single-process deployments): hosts the embed
        // daemon's exact drain loop inside this server when no orchestrator-supervised daemon
        // exists. Mutual exclusion is now drain-lock enforced — a live embed daemon (or another
        // server) holding the per-directory lock makes this server REFUSE its loop and keep
        // serving, instead of silently double-draining and corrupting markers (sole-drainer
        // invariant; see the `memoryWal.inProcessDrain` leaf + `drainLock.mjs`). Absent-block
        // tolerance is deliberate: a stale overlay simply leaves the loop off; `addMemory`'s own
        // guard speaks for the missing config.
        if (aiConfig.memoryWal && aiConfig.memoryWal.inProcessDrain) {
            const drainLog = (level, message) => logger[level === 'ERROR' ? 'error' : 'info'](`[neo-memory-core MCP] ${message}`);

            try {
                this.walDrainLock = acquireDrainLock({dir: aiConfig.memoryWal.dir, owner: 'in-process', log: drainLog});
            } catch (err) {
                if (err.code !== 'DRAIN_LOCK_HELD') throw err;
                // Another host already drains this dir. The drain is secondary to this server's MCP
                // duties — log loud and continue serving rather than crash the whole server.
                logger.error(`[neo-memory-core MCP] In-process WAL drain NOT started: ${err.message}`);
            }

            if (this.walDrainLock) {
                this.walDrainLoop = startDrainLoop({
                    getCollection: () => StorageRouter.getMemoryCollection(),
                    getConfig    : () => aiConfig.memoryWal,
                    log          : drainLog
                });
                // Release on process exit (the realistic single-process clean-shutdown path); a
                // signal-kill leaves the lock for the next host to reclaim as stale.
                process.on('exit', () => this.walDrainLock?.release());
                logger.info('[neo-memory-core MCP] In-process WAL drain loop active (memoryWal.inProcessDrain)');
            }
        }

        // Stdio identity resolution BEFORE healthcheck snapshot.
        if (aiConfig.transport !== 'sse') {
            this.stdioIdentity = await this.resolveStdioIdentity();
            HealthService.setStdioIdentityState(this.stdioIdentity);

            // Auto-bootstrap wake subscription with a single-error-boundary IIFE.
            // Fire-and-forget: server boot continues unconditionally; wake-substrate self-heals
            // even if the bootstrap operation hits transient errors.
            if (this.stdioIdentity?.agentIdentityNodeId) {
                (async () => {
                    try {
                        // Per-instance wake address from the boot envelope (machine-specific). Null
                        // for the default instance; throws on a misconfigured envelope, which the
                        // boundary below logs and skips — fail-closed (no subscription beats a
                        // misrouted one).
                        const overrideMetadata = BootEnvelopeResolver.resolveOverrideMetadata();

                        const result = await RequestContextService.run(
                            this.stdioIdentity,
                            () => WakeSubscriptionService.bootstrap(overrideMetadata ? {overrideMetadata} : {})
                        );

                        // Log the address kind only, never the address value (no path leakage).
                        const addressNote = overrideMetadata ? ` [address: ${overrideMetadata.addressType}]` : '';
                        logger.info(`[neo-memory-core MCP] Wake subscription auto-bootstrap: ${result.status} (${result.subscriptionId})${addressNote}`);
                    } catch (err) {
                        logger.warn(`[neo-memory-core MCP] Wake subscription auto-bootstrap skipped (non-fatal): ${err.message}`);
                    }
                })();
            }
        }

        // Healthcheck (sees populated stdioIdentityState post-reorder).
        await this.runHealthcheckAndLogStatus();
        this.logSiblingConcurrency();

        await this.connectTransport();

        if (aiConfig.transport !== 'sse') {
            this.logIdentityStatus();
        }
    }

    /**
     * @summary SSE-only hook: builds RequestContext for a `/mcp` request from `req.auth`.
     * Invoked by `TransportService.setup` via duck-typed hook. Returns `{}` when no identity
     * is present to preserve single-tenant fallthrough.
     * @param {Object|undefined} reqAuth
     * @returns {Promise<Object>}
     */
    async buildRequestContext(reqAuth) {
        if (!reqAuth?.userId) return {};

        const agentIdentityNodeId = await this.bindAgentIdentity(reqAuth.userId);

        return {
            userId             : reqAuth.userId,
            username           : reqAuth.username,
            agentIdentityNodeId,
            source             : reqAuth.source || 'oidc'
        };
    }

    /**
     * @summary SSE-only hook fired by `TransportService` on session disconnect. Removes the
     * per-session McpServer from `CoalescingEngineService`'s broadcast set (counterpart to
     * `createMcpServer`'s `addMcpServer` registration) and writes a cheap idempotent
     * `SummarizationJobs.pending` marker. The orchestrator `summary` task drains that marker;
     * this hook never summarizes inline.
     * @param {String} sessionId
     * @param {Object} mcpServerInstance
     */
    onSessionClosed(sessionId, mcpServerInstance) {
        if (mcpServerInstance) {
            CoalescingEngineService.removeMcpServer(mcpServerInstance);
        }

        SessionService.queueSummarizationJob(sessionId);
    }

    /**
     * @summary Resolves the active stdio agent identity and binds it to its AgentIdentity
     * graph node. Composes three steps: (1) `StdioIdentityResolver.resolve()` returns the
     * GitHub identity via the env-var → gh-CLI chain; (2) `GraphService.getNode({id: '@' +
     * githubLogin})` looks up the matching seeded AgentIdentity node; (3)
     * the composite is shaped for `RequestContextService.run()` consumption.
     *
     * Missing graph node is non-fatal: the identity still flows as `userId` tag, but
     * `agentIdentityNodeId` is null. Unseeded agents can write memories — they just can't yet
     * terminate `AUTHORED_BY` edges on a graph node until someone adds them via
     * `seedAgentIdentities.mjs`.
     *
     * @returns {Promise<Object|null>}
     * @protected
     */
    async resolveStdioIdentity() {
        const resolved = await StdioIdentityResolver.resolve();

        if (!resolved.githubLogin) return null;

        const agentIdentityNodeId = await this.bindAgentIdentity(resolved.githubLogin);

        return {
            userId             : resolved.githubLogin,
            username           : resolved.username,
            agentIdentityNodeId,
            source             : resolved.source
        };
    }

    /**
     * @summary Resolves a bare GitHub login to its seeded AgentIdentity graph node ID
     * using the `@`-prefixed AgentIdentity convention. Shared between `resolveStdioIdentity`
     * (stdio boot) and `buildRequestContext` (per-SSE-request) so both transports reach the
     * same node lookup behavior.
     *
     * Missing node is non-fatal: returns `null`. Downstream services that build `AUTHORED_BY`
     * graph edges treat `null` as "skip edge creation for this write" rather than failing the
     * write.
     *
     * Retries up to 3 times with vicinity-cache eviction between attempts so concurrent boot
     * cache state cannot hide freshly seeded identity nodes.
     *
     * @param {String|undefined|null} userId
     * @returns {Promise<String|null>}
     * @protected
     */
    async bindAgentIdentity(userId) {
        if (!userId) return null;

        const graphNodeId = '@' + userId;

        try {
            await GraphService.ready();

            let retries = 3;
            let node = null;

            while (retries > 0) {
                node = await GraphService.getNode({id: graphNodeId});
                if (node) {
                    return node.id;
                }

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
     * @summary Logs the resolved stdio identity state during startup for operator visibility.
     * @protected
     */
    logIdentityStatus() {
        if (!this.stdioIdentity) {
            logger.info('[neo-memory-core MCP] Identity: unresolved (single-tenant fallthrough)');
            return;
        }

        const {userId, agentIdentityNodeId, source} = this.stdioIdentity;
        const bound = agentIdentityNodeId ? `bound to ${agentIdentityNodeId}` : 'unbound (no matching AgentIdentity node)';

        logger.info(`[neo-memory-core MCP] Identity: ${userId} via ${source} — ${bound}`);
    }

    /**
     * @summary Helper to log Memory Core collection statistics from healthcheck output.
     * @param {Object} health
     */
    logCollectionStats(health) {
        if (health.database.connection.collections) {
            logger.info(`   - Memories: ${health.database.connection.collections.memories.count}`);
            logger.info(`   - Summaries: ${health.database.connection.collections.summaries.count}`);
        }
    }

    /**
     * @summary Memory Core-specific startup status formatting with ChromaDB-tip on unhealthy
     * + collection-stats on degraded/healthy.
     * @param {Object} health
     */
    logStartupStatus(health) {
        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database?.process?.running) {
                logger.warn('    💡 Tip: Start ChromaDB manually, for example:');
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
     * @summary Boot-time diagnostic: invokes `lsof` to detect SQLite file contention from
     * sibling MCP server processes holding the memory-core SQLite files.
     * Uses the same empirical `lsof` + PID walk pattern established in
     * `ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs`.
     * @protected
     */
    logSiblingConcurrency() {
        const dbPath = aiConfig.storagePaths.graph;
        if (!dbPath) return;

        const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

        try {
            const raw = execSync(`lsof -F pcn -- ${files.map(f => `'${f}'`).join(' ')}`, {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let current = null;
            const records = [];
            for (const line of raw.split('\n')) {
                if (!line) continue;
                if (line[0] === 'p') {
                    if (current && current.pid !== process.pid) records.push(current);
                    current = {pid: parseInt(line.slice(1), 10)};
                } else if (current && line[0] === 'c') {
                    current.command = line.slice(1);
                }
            }
            if (current && current.pid !== process.pid) records.push(current);

            const uniquePids = new Set();
            const siblings = records.filter(r => {
                if (uniquePids.has(r.pid)) return false;
                uniquePids.add(r.pid);
                return true;
            });

            if (siblings.length > 0) {
                const groups  = groupProcessesByHarness(siblings);
                const summary = formatHarnessGroups(groups);
                const message = `ℹ️  [Startup] Sibling concurrency: ${siblings.length} peer process(es) holding SQLite files. Harnesses: ${summary}`;

                if (groups.some(group => group.harness === 'unknown')) {
                    logger.warn(message);
                } else {
                    logger.info(message);
                }
            }
        } catch (error) {
            // Ignore ENOENT (lsof missing on Windows) or status 1 (no matching processes)
            if (error.status !== 1 && error.code !== 'ENOENT') {
                logger.debug(`[Startup] Failed to check sibling concurrency: ${error.message}`);
            }
        }
    }
}

export default Neo.setupClass(Server);
