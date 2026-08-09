import BaseServer            from '../BaseServer.mjs';
import logger                from './logger.mjs';
import {listTools, callTool} from './toolService.mjs';
import AuthMiddleware        from '../shared/services/AuthMiddleware.mjs';
import RequestContextService from '../shared/services/RequestContextService.mjs';
import StdioIdentityResolver from '../shared/services/StdioIdentityResolver.mjs';
import BootEnvelopeResolver  from '../shared/services/BootEnvelopeResolver.mjs';
import {formatHostEndpoint}  from '../shared/helpers/hostEndpoint.mjs';
import {
    buildSqliteHolderDiagnostics,
    formatHarnessGroups
} from '../../../services/memory-core/helpers/harnessClassifier.mjs';

import {
    Memory_Config                  as aiConfig,
    Memory_GraphService            as GraphService,
    Memory_HealthService           as HealthService,
    Memory_SessionService          as SessionService,
    Memory_InferenceLifecycleService  as InferenceLifecycleService,
    Memory_RecorderService            as RecorderService,
    Memory_StorageRouter              as StorageRouter,
    Memory_MailboxService             as MailboxService,
    Memory_WakeSubscriptionService    as WakeSubscriptionService,
    Memory_CoalescingEngineService    as CoalescingEngineService,
    Memory_WebhookDeliveryService     as WebhookDeliveryService
} from '../../../services.mjs';
import {startDrainLoop}   from '../../../daemons/embed/drainCycle.mjs';
import {acquireDrainLock} from '../../../daemons/embed/drainLock.mjs';
import {
    createMessageGraphProjectionProcessor,
    startMessageDrainLoop
} from '../../../daemons/message/drainCycle.mjs';
import {acquireMessageDrainLock}        from '../../../daemons/message/drainLock.mjs';
import {getMissingMessageWalLeaves}     from '../../../services/memory-core/helpers/messageWalStore.mjs';
import {LOOPBACK_PROBE_HEALTH_KEY}      from '../../../services/memory-core/helpers/loopbackFamilyProbe.mjs';
import {TRUST_TIERS}                    from '../../../graph/identityRoots.mjs';
import {normalizeAgentIdentityNodeId}   from '../../../graph/normalizeAgentIdentityNodeId.mjs';
import ConfigBase, {PLANE_MEMBER_PATHS} from './configBase.mjs';

// Security invariant, not deployment policy: graph ids must remain namespace/path/control safe.
const AUTH_IDENTITY_USER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

function compactDefinedProperties(properties) {
    return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}

/**
 * @summary The Memory Core MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Memory Core MCP server.
 * This server uses a dual-transport architecture, allowing it to communicate with local CLI clients
 * via `stdio` (the default) or with cloud-native/remote clients via `streamable-http`.
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
     * running under Streamable HTTP transport (identity flows per-request via `AuthService` /
     * `RequestContextService` instead) or when stdio resolution yielded no identity.
     * @member {Object|null} stdioIdentity=null
     * @protected
     */
    stdioIdentity = null

    /**
     * @summary Memory Core opens durable plane storage (memory/message WAL, the shared
     * SQLite graph, Chroma collections) — a declared plane MEMBER: the boot-time
     * plane-identity assertion fails loud rather than ever silently skipping.
     * @returns {Boolean}
     * @protected
     */
    isPlaneMember() {
        return true;
    }

    /**
     * @summary The COMPLETE plane this server opens: its local claimed member paths PLUS the
     * inherited Tier-1 claims, composed by `BaseServer.collectMemberEntries` — the boot-time
     * input for the F-invariant's member-coherence clause.
     * @returns {Object[]}
     * @protected
     */
    getPlaneMembers() {
        return this.collectMemberEntries({
            localPaths         : PLANE_MEMBER_PATHS,
            localDescriptorData: ConfigBase.config.data
        });
    }

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
                tools       : {listChanged: false},
                experimental: {
                    'neo-wake-substrate': {
                        version        : '1.0',
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
     * @summary Publishes this server's heap observation as the `mc-server` Compose service.
     *
     * The label matches this server's own `logger.filePrefix` and the orchestrator bridge's
     * `allowedServices` entry — the same string the bridge resolves `mc-server.json` from, so the
     * record's identity check passes for the right reason rather than by coincidence.
     *
     * This server overrides `boot()` without chaining `super.boot()`; the reporter is started from
     * `BaseServer.initAsync()` for exactly that reason, so no start call belongs in the override.
     * @returns {String}
     */
    getHeapObservationServiceKey() { return 'mc-server' }

    /**
     * @summary Tools allowed without the healthcheck gate. The A2A
     * mailbox/permission surface is graph/SQLite-scoped and must remain reachable during
     * summarization/vector-provider incidents so agents can coordinate the recovery — as is
     * add_memory, whose never-fail WAL write is local-disk-scoped with the embed deferred to the
     * drain, so memory capture never blocks on an embedder/vector-provider outage.
     *
     * The non-embedding reads are exempt for the same reason. The gate trips on the embedder canary
     * (a live `embedText` probe), but `get_session_memories` (a Chroma metadata `.get()` by
     * sessionId), `query_recent_turns` (a SQLite recency read over the `AGENT_MEMORY` graph, with a
     * WAL-overlay fallback for its optional Chroma content join), and `who_is_online` (a SQLite
     * `AgentIdentity`-roster liveness projection — graph-backed, survives an embed-drain) call no
     * embedder — they serve fine while it is down, so gating them only denied a read the outage
     * never touched. NOT exempt:
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
            'record_turn_presence',
            'get_session_memories',
            'query_recent_turns',
            'who_is_online',
            // Read-only diagnostics that never embed — exempt so a slow/down embedder cannot block the
            // very tools an agent needs to SEE the degradation (the embed-canary catch-22). They read
            // state/files/metrics only; none embed a query (unlike `query_raw_memories`/`query_summaries`).
            'get_rem_pipeline_state',
            'get_sqlite_holder_diagnostics',
            'get_deployment_state_snapshot',
            'inspect_deployment',
            'get_sandman_handoff',
            'get_memory_core_tool_metrics'
        ];
    }

    /**
     * @summary Pre-dispatch identity-spoof guard. Rejects any tool-call argument
     * that would let the client override server-stamped identity. No-op on existing tool
     * schemas; activates when a tool exposes sender-owned identity fields. Throws bubble to the
     * outer CallTool try/catch and route to `formatToolError`.
     * @param {{toolName: String, args: Object}} context
     */
    async beforeToolDispatch({toolName, args, t0}) {
        try {
            AuthMiddleware.validateNoIdentitySpoof(args);
        } catch (error) {
            RecorderService.logToolCall({
                toolName,
                args,
                success     : false,
                error,
                failureStage: 'policy',
                t0
            });
            throw error;
        }
    }

    /**
     * @summary Records health-gate rejects in the redacted MCP tool-call telemetry table.
     * @param {{toolName: String, args: Object, error: Error, t0: Number}} context
     */
    async onHealthGateFailure({toolName, args, error, t0}) {
        RecorderService.logToolCall({
            toolName,
            args,
            success     : false,
            error,
            failureStage: 'health_gate',
            t0
        });
    }

    /**
     * @summary Wraps tool dispatch in `RequestContextService.run()` when stdio identity is
     * resolved. Establishes the AsyncLocalStorage-scoped context that
     * `MemoryService.addMemory`, etc. read via `getUserId()` to tag ChromaDB writes per
     * tenant. Streamable HTTP mode leaves `stdioIdentity` null because `TransportService` already wraps
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
     * and per-request (Streamable HTTP mode) to provision dedicated server objects per connection.
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
     * 1. The MCP server/tool registry must come up before graph/vector startup tiers are awaited,
     *    so WAL-local tools (`add_memory`) remain callable during graph SQLite or Chroma startup
     *    faults.
     * 2. Stdio identity resolution must complete BEFORE healthcheck, so the boot-time
     *    healthcheck snapshot reflects the bound identity state.
     * 3. The wake-subscription auto-bootstrap is fire-and-forget within an async IIFE for
     *    single-error-boundary discipline; it must run AFTER stdio identity is bound.
     *
     * @returns {Promise<void>}
     */
    async boot() {
        await this.loadCustomConfig();

        const wakeDispatch = aiConfig.orchestrator.wakeDispatch;

        CoalescingEngineService.configure(wakeDispatch);
        WebhookDeliveryService.configure(wakeDispatch);

        this.mcpServer = this.createMcpServer();

        await this.prepareStartupDependency({
            name      : 'wake-subscription',
            dependency: WakeSubscriptionService,
            start     : () => WakeSubscriptionService.init(),
            degraded  : 'wake subscriptions are degraded; WAL-local tools remain available'
        });

        await this.prepareStartupDependency({
            name      : 'inference-lifecycle',
            dependency: InferenceLifecycleService,
            start     : () => InferenceLifecycleService.ready(),
            degraded  : 'inference readiness is degraded; WAL-local tools remain available'
        });

        await this.prepareStartupDependency({
            name      : 'session-service',
            dependency: SessionService,
            start     : () => SessionService.ready(),
            degraded  : 'session/vector reads are degraded; add_memory remains WAL-available'
        });

        await this.prepareStartupDependency({
            name      : 'tool-telemetry',
            dependency: RecorderService,
            start     : () => RecorderService.ready(),
            degraded  : 'Memory Core tool telemetry is disabled; tool dispatch remains available'
        });

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
                    getCollection    : () => StorageRouter.getMemoryCollection(),
                    getConfig        : () => aiConfig.memoryWal,
                    expectedDimension: aiConfig.vectorDimension,
                    log              : drainLog
                });
                // Release on process exit (the realistic single-process clean-shutdown path); a
                // signal-kill leaves the lock for the next host to reclaim as stale.
                process.on('exit', () => this.walDrainLock?.release());
                logger.info('[neo-memory-core MCP] In-process WAL drain loop active (memoryWal.inProcessDrain)');
            }
        }

        // In-process message WAL drain (containerized / single-process deployments): mirrors the
        // memory WAL host-mode split, but deliberately keeps replay semantics injectable; graph
        // projection is a separate completion concern.
        if (aiConfig.messageWal && aiConfig.messageWal.inProcessDrain) {
            const messageDrainLog = (level, message) => logger[level === 'ERROR' ? 'error' : 'info'](`[neo-memory-core MCP] ${message}`);
            const missingLeaves   = getMissingMessageWalLeaves(aiConfig.messageWal,
                ['dir', 'pollIntervalMs', 'batchSize', 'maxRetries', 'backoffBaseMs']);

            if (missingLeaves.length > 0) {
                logger.error(`[neo-memory-core MCP] In-process message WAL drain NOT started: messageWal config leaves missing: ${missingLeaves.join(', ')} — sync the messageWal block from config.template.mjs into the local config.mjs (node ai/scripts/setup/initServerConfigs.mjs --migrate-config) and restart memory-core.`);
            } else {
                try {
                    this.messageWalDrainLock = acquireMessageDrainLock({dir: aiConfig.messageWal.dir, owner: 'in-process', log: messageDrainLog});
                } catch (err) {
                    if (err.code !== 'DRAIN_LOCK_HELD') throw err;
                    logger.error(`[neo-memory-core MCP] In-process message WAL drain NOT started: ${err.message}`);
                }

                if (this.messageWalDrainLock) {
                    this.messageWalDrainLoop = startMessageDrainLoop({
                        getConfig   : () => aiConfig.messageWal,
                        getProcessor: () => createMessageGraphProjectionProcessor(MailboxService),
                        log         : messageDrainLog
                    });
                    process.on('exit', () => this.messageWalDrainLock?.release());
                    logger.info('[neo-memory-core MCP] In-process message WAL drain loop active (messageWal.inProcessDrain)');
                }
            }
        }

        // Stdio identity resolution BEFORE healthcheck snapshot.
        if (this.aiConfig.transport === 'stdio') {
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

        // Start the lifecycle-owned embedding write-canary producer BEFORE the first healthcheck:
        // liveness probes are pure readers, so the server boot owns scheduling.
        // Process exit disarms the scheduler; an in-flight attempt drains and a later start joins
        // it through the same gate — never an overlap.
        HealthService.startEmbeddingWriteCanary();
        process.on('exit', () => HealthService.stopEmbeddingWriteCanary());

        // Healthcheck (sees populated stdioIdentityState post-reorder).
        await this.runHealthcheckAndLogStatus();
        this.logSiblingConcurrency();

        await this.connectTransport();

        if (this.aiConfig.transport === 'stdio') {
            this.logIdentityStatus();
        }
    }

    /**
     * @summary Initializes a non-WAL startup dependency as best-effort readiness.
     *
     * Memory Core's minimum availability tier is the local `memoryWal` append surface. Graph,
     * wake-subscription, inference, and vector/session readiness must be observable but must not
     * veto MCP server startup; otherwise the mandatory `add_memory` final-turn save disappears
     * exactly when a degraded deployment most needs lossless WAL capture.
     *
     * @param {Object} options
     * @param {String} options.name Stable healthcheck key.
     * @param {Object} options.dependency Dependency object for diagnostic naming.
     * @param {Function} options.start Async startup callback.
     * @param {String} options.degraded Operator-facing degraded-mode summary.
     * @returns {Promise<void>}
     * @protected
     */
    async prepareStartupDependency({name, dependency, start, degraded}) {
        try {
            await start();
            HealthService.recordStartupDependency(name, 'ready', {
                className: dependency?.className || dependency?.constructor?.name || name
            });
        } catch (error) {
            logger.warn(`[neo-memory-core MCP] ${name} startup degraded: ${error.message}. ${degraded}.`);
            HealthService.recordStartupDependency(name, 'degraded', {
                className: dependency?.className || dependency?.constructor?.name || name,
                error    : error.message
            });
        }
    }

    /**
     * @summary Streamable-HTTP-only hook: builds RequestContext for a `/mcp` request from `req.auth`.
     * Invoked by `TransportService.setup` via duck-typed hook. Returns `{}` when no identity
     * is present to preserve single-tenant fallthrough.
     * @param {Object|undefined} reqAuth
     * @returns {Promise<Object>}
     */
    async buildRequestContext(reqAuth) {
        if (!reqAuth?.userId) return {};

        const agentIdentityNodeId = this.shouldAutoProvisionAgentIdentity(reqAuth)
            ? await this.ensureAgentIdentityForAuthContext(reqAuth)
            : await this.bindAgentIdentity(reqAuth.userId);

        return {
            userId  : reqAuth.userId,
            username: reqAuth.username,
            agentIdentityNodeId,
            source  : reqAuth.source || reqAuth.authSource || 'oidc'
        };
    }

    /**
     * @summary Returns true when a validated HTTP auth source is allowed to create a missing
     * durable AgentIdentity at request-context build time.
     * @param {Object|undefined} reqAuth Server-stamped auth context from the bearer verifier.
     * @returns {Boolean}
     * @protected
     */
    shouldAutoProvisionAgentIdentity(reqAuth) {
        return this.aiConfig.auth.autoProvisionIdentitySources.includes(reqAuth?.source) ||
               this.aiConfig.auth.autoProvisionIdentitySources.includes(reqAuth?.authSource);
    }

    /**
     * @summary Builds a fatal identity-provisioning error with a stable diagnostic code.
     * @param {String} message Operator-facing error detail.
     * @param {String} code Stable error code.
     * @returns {Error}
     * @protected
     */
    createIdentityProvisioningError(message, code) {
        const error = new Error(`[neo-memory-core MCP] ${message}`);
        error.code  = code;
        return error;
    }

    /**
     * @summary Validates the authenticated provider username before deriving the `@` graph id.
     *
     * Only server-stamped auth fields reach this helper. The conservative username contract rejects
     * empty, `@`-prefixed, path-like, control-character, whitespace, and namespace-bearing values
     * before a graph write can occur.
     * @param {String} userId Authenticated provider username.
     * @returns {String} Canonical bare username.
     * @protected
     */
    validateAuthProvisionUserId(userId) {
        const normalized = typeof userId === 'string' ? userId.trim() : '';

        if (!normalized || !AUTH_IDENTITY_USER_ID_RE.test(normalized)) {
            throw this.createIdentityProvisioningError(
                `Cannot auto-provision AgentIdentity: authenticated userId '${String(userId)}' is not a valid provider username.`,
                'NEO_AGENT_IDENTITY_INVALID'
            );
        }

        return normalized;
    }

    /**
     * @summary Reads the exact SQLite graph node row without RLS filtering.
     *
     * Provisioning must fail closed on an id collision even when the colliding row is not visible
     * through the requester's RLS view. This read is used only for collision/provisioning policy;
     * public graph reads still route through GraphService's RLS-aware APIs.
     * @param {String} id Canonical graph node id.
     * @returns {Object|null} Raw graph node projection.
     * @protected
     */
    readRawGraphNode(id) {
        const db = GraphService.db?.storage?.db;

        if (!db?.open) {
            throw GraphService.createUnavailableError('AgentIdentity provisioning');
        }

        const row = db.prepare('SELECT data FROM Nodes WHERE id = ?').get(id);
        if (!row?.data) return null;

        let data;
        try {
            data = JSON.parse(row.data);
        } catch (error) {
            throw this.createIdentityProvisioningError(
                `Cannot auto-provision AgentIdentity ${id}: graph row JSON is unreadable (${error.message}).`,
                'NEO_AGENT_IDENTITY_CORRUPT'
            );
        }

        return {
            id        : data.id,
            type      : data.label,
            properties: data.properties || {}
        };
    }

    /**
     * @summary Creates or refreshes a provider-PAT authenticated AgentIdentity from server-stamped
     * auth context before graph-gated tools need `agentIdentityNodeId`.
     *
     * Missing identities are written as globally visible SQLite graph nodes (`userId: null`) so a
     * separate orchestrator process can observe them through GraphLog invalidation and lazy-load.
     * Existing AgentIdentity nodes are preserved; seeded nodes receive only `lastAuthenticatedAt`,
     * while already-auto-provisioned nodes can refresh provider-neutral metadata. Non-identity
     * collisions and malformed ids fail closed.
     * @param {Object} reqAuth Server-stamped auth context from the validated bearer request.
     * @returns {Promise<String|null>} Bound AgentIdentity node id, or null when graph startup is degraded.
     * @protected
     */
    async ensureAgentIdentityForAuthContext(reqAuth) {
        const userId      = this.validateAuthProvisionUserId(reqAuth?.userId),
              graphNodeId = normalizeAgentIdentityNodeId(userId);

        try {
            await GraphService.ready();

            let existing = this.readRawGraphNode(graphNodeId);

            if (existing && existing.type !== 'AgentIdentity') {
                throw this.createIdentityProvisioningError(
                    `Cannot auto-provision AgentIdentity ${graphNodeId}: id collides with existing ${existing.type || 'unknown'} node.`,
                    'NEO_AGENT_IDENTITY_COLLISION'
                );
            }

            const now             = new Date().toISOString(),
                  existingProps   = existing?.properties || {},
                  providerDisplay = reqAuth.providerDisplayName || reqAuth.username || reqAuth.providerUsername || userId,
                  fullProperties  = compactDefinedProperties({
                      accountType        : 'agent',
                      participationStatus: 'active',
                      trustTier          : TRUST_TIERS.INTERNAL_AUTHORED,
                      authProvider       : reqAuth.authProvider || 'gitlab',
                      authSource         : reqAuth.authSource || reqAuth.source || 'gitlab-pat',
                      providerBaseUrl    : reqAuth.providerBaseUrl,
                      providerUserId     : reqAuth.providerUserId == null ? undefined : String(reqAuth.providerUserId),
                      providerUsername   : reqAuth.providerUsername || userId,
                      providerDisplayName: providerDisplay,
                      autoProvisioned    : true,
                      createdAt          : existingProps.createdAt || now,
                      lastAuthenticatedAt: now
                  });

            const properties = existing
                ? existingProps.autoProvisioned === true
                    ? {...fullProperties, createdAt: existingProps.createdAt || now}
                    : {lastAuthenticatedAt: now}
                : fullProperties;

            GraphService.upsertGlobalNode({
                id         : graphNodeId,
                type       : 'AgentIdentity',
                name       : existing ? undefined : providerDisplay,
                description: existing ? undefined : 'Auto-provisioned Agent OS identity for an authenticated Memory Core principal.',
                properties
            });

            existing = this.readRawGraphNode(graphNodeId);
            if (!existing || existing.type !== 'AgentIdentity') {
                throw this.createIdentityProvisioningError(
                    `Cannot auto-provision AgentIdentity ${graphNodeId}: durable graph write did not yield an AgentIdentity node.`,
                    'NEO_AGENT_IDENTITY_WRITE_FAILED'
                );
            }

            return graphNodeId;
        } catch (error) {
            if (error.code?.startsWith?.('NEO_AGENT_IDENTITY_')) {
                throw error;
            }

            logger.warn(`[neo-memory-core MCP] AgentIdentity auto-provision failed for ${graphNodeId}: ${error.message}`);
            return this.bindAgentIdentity(userId);
        }
    }

    /**
     * @summary Streamable-HTTP-only hook fired by `TransportService` on session disconnect. Removes the
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
     * GitHub identity via the env-var → gh-CLI chain; (2) the shared AgentIdentity node-id
     * canonicalizer resolves the matching seeded graph node; (3)
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
            userId  : resolved.githubLogin,
            username: resolved.username,
            agentIdentityNodeId,
            source  : resolved.source
        };
    }

    /**
     * @summary Resolves a bare GitHub login to its seeded AgentIdentity graph node ID
     * using the `@`-prefixed AgentIdentity convention. Shared between `resolveStdioIdentity`
     * (stdio boot) and `buildRequestContext` (per-Streamable-HTTP request) so both transports reach the
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

        const graphNodeId = normalizeAgentIdentityNodeId(userId);
        if (
            typeof graphNodeId !== 'string' ||
            !graphNodeId.startsWith('@') ||
            !AUTH_IDENTITY_USER_ID_RE.test(graphNodeId.slice(1))
        ) {
            return null;
        }

        try {
            await GraphService.ready();

            let retries = 3;
            let node    = null;

            while (retries > 0) {
                node = await GraphService.getNode({id: graphNodeId});
                if (node?.type === 'AgentIdentity') {
                    return node.id;
                }
                if (node) {
                    logger.warn(`[neo-memory-core MCP] AgentIdentity graph lookup refused ${graphNodeId}: found ${node.type || 'unknown'} node`);
                    return null;
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
        const bound                                 = agentIdentityNodeId ? `bound to ${agentIdentityNodeId}` : 'unbound (no matching AgentIdentity node)';

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
        // `BaseServer.runHealthcheckAndLogStatus` passes null when the health service exposes no
        // healthcheck method — there is no health status to report in that case. Without this guard
        // the override dereferences null on a degraded/health-serviceless boot and crashes initAsync.
        if (!health) return;

        if (health.status === 'unhealthy') {
            logger.warn('⚠️  [Startup] Memory Core is unhealthy. Server will start but tools will fail until resolved.');
            health.details.forEach(detail => logger.warn(`    ${detail}`));

            if (!health.database?.process?.running) {
                // Print the RESOLVED target this server actually dials, never invented env fallbacks:
                // a tip that guesses can send an operator to the wrong path while the real endpoint is
                // one line away.
                //
                // The bind-family line is an INDEPENDENT diagnostic, not an explanation of any
                // particular outage: a listener bound to `[::1]` refuses an IPv4 client (and vice
                // versa), so the service looks dead to every `127.0.0.1` probe while `localhost`
                // answers fine. That asymmetry is cheap to hit and expensive to guess at — but it
                // fails FAST (a refused connection, ~1ms), so it explains a "service is down" misread,
                // never a hang or a timeout.
                //
                // `formatHostEndpoint` is required rather than a `${host}:${port}` template because an
                // IPv6 host is exactly what this branch tends to be printing, and the naive form
                // renders `::1:8000` — not a valid authority.
                const {dataDir, host, port} = aiConfig.engines.chroma;

                logger.warn(`    💡 Tip: this server expects ChromaDB at ${formatHostEndpoint(host, port)} (persist dir: ${dataDir}).`);
                logger.warn(`       Start it with: chroma run --path ${dataDir} --port ${port}`);

                // The `lsof` fallback is printed ONLY when the probe did not answer the question it
                // asks. When the probe IS conclusive the command is redundant: the requirement is that
                // a bind-family mismatch be readable from the output alone, which a manual command the
                // operator still has to run does not satisfy.
                if (!this.logLoopbackDiagnosis(health.database?.connection?.[LOOPBACK_PROBE_HEALTH_KEY], port)) {
                    logger.warn(`       Already running? Check the bind family — an IPv6-only listener refuses`);
                    logger.warn(`       an IPv4 client: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
                }
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
     * @summary Renders the loopback bind-family observation carried on the health payload, and reports
     * whether it made the `lsof` fallback redundant.
     *
     * Purely presentational and synchronous — the observation is taken in
     * `HealthService.healthcheck()`, whose caller (`BaseServer.runHealthcheckAndLogStatus`) already
     * awaits. `logStartupStatus` is a hook **six servers override**, so it performs no I/O: making it
     * async to serve one server's diagnostic would mutate a shared contract for every one of them, and
     * would silently leave each existing override running sync-in-async-context.
     * @param {Object|undefined} probe `classifyLoopbackObservation` result, absent on older payloads.
     * @param {Number|String}    port  Resolved Chroma port, for the no-listener wording.
     * @returns {Boolean} `true` when the printed result replaces the `lsof` fallback.
     * @protected
     */
    logLoopbackDiagnosis(probe, port) {
        if (!probe?.conclusive) return false;

        const answering = (probe.answering || []).join(' and ');

        switch (probe.verdict) {
            case 'mismatch':
                // OBSERVATIONAL, deliberately. A successful TCP connect proves "a listener accepted a
                // connection", NOT "ChromaDB is running" — nothing here speaks Chroma's protocol. The
                // earlier wording asserted the identity of the process that answered, which is the same
                // overclaim this whole diagnostic exists to retire. The inference is offered to the
                // operator as conditional, and the observation is stated as fact.
                logger.warn(`       ⚠️  Bind-family mismatch OBSERVED: this server dials ${probe.dialed}, which refused,`);
                logger.warn(`       but a TCP listener answered at ${answering} — unidentified; this probe does not`);
                logger.warn(`       speak Chroma's protocol. If that listener is ChromaDB, rebind it or point this`);
                logger.warn(`       server at ${answering}.`);
                return true;

            case 'no-listener':
                // Equally load-bearing: it rules the mismatch OUT, so the operator stops looking here.
                // The addresses come from the OBSERVATION, never a literal: a hardcoded `127.0.0.1`
                // reported an address a `127.0.0.5`-configured server never dials — the same
                // substitution defect the probe half already fixed, surviving in the rendering half.
                logger.warn(`       Probed both loopback families: nothing answered on port ${port} at`);
                logger.warn(`       ${(probe.empty || []).join(' or ')}, so this is not a bind-family mismatch — nothing`);
                logger.warn(`       is accepting local connections on either family.`);
                return true;

            case 'listener-reachable':
                logger.warn(`       A listener answered at ${probe.dialed}, so the port is reachable and this is`);
                logger.warn(`       not a bind-family mismatch — the fault is above TCP (HTTP, auth, or collections).`);
                return true;

            case 'ambiguous-host':
                // `localhost` resolution order is not observable from here, so the families that
                // answered are reported as facts without asserting which one gets dialed.
                logger.warn(`       A listener answered at ${answering}. This server dials '${probe.dialed}', whose`);
                logger.warn(`       address family is chosen by the resolver — so a mismatch is possible but not`);
                logger.warn(`       proven. Dial the literal above to confirm.`);
                return true;

            default:
                return false;
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

        const diagnostics = buildSqliteHolderDiagnostics({
            dbPath,
            currentPid: process.pid
        });

        if (diagnostics.status === 'degraded') {
            logger.debug(`[Startup] Failed to check sibling concurrency: ${diagnostics.error}`);
            return;
        }

        if (diagnostics.totalProcesses > 0) {
            const summary = formatHarnessGroups(diagnostics.groups);
            const message = `ℹ️  [Startup] Sibling concurrency: ${diagnostics.totalProcesses} peer process(es) holding SQLite files. Harnesses: ${summary}`;

            if (diagnostics.warnings.length > 0) {
                logger.warn(message);
            } else {
                logger.info(message);
            }
        }
    }
}

export default Neo.setupClass(Server);
