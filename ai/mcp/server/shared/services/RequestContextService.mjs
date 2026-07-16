import { AsyncLocalStorage }          from 'async_hooks';
import Base                           from '../../../../../src/core/Base.mjs';
import {normalizeAgentIdentityNodeId} from '../../../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @summary Sentinel `userId` value tagging records that belong to the shared baseline —
 * accessible to all tenants via the additive read filter.
 *
 * Reads in tenant-aware mode use `where: {$or: [{userId: <current>}, {userId: SHARED_USER_ID}]}`,
 * granting every authenticated tenant access to their own data PLUS the shared baseline.
 * The migration runner (`ai/scripts/migrations/backfillChromaSharedUserId.mjs`) tags unscoped
 * ChromaDB records lacking a `userId` key with this sentinel so the additive
 * read filter can return them. New raw-memory writes tag with the resolved per-tenant userId;
 * session summaries involving named core swarm maintainers intentionally use `SHARED_USER_ID`
 * so the compressed navigation artifact remains visible to every named peer.
 *
 * @member {String}
 */
export const SHARED_USER_ID = 'shared';

/**
 * @summary Canonical userIds for Neo's named core swarm maintainers.
 *
 * Session summaries that involve any of these agents are part of the shared
 * swarm memory substrate, even when a single harness performed the summarization
 * write. Without this list, restored summaries can be tagged to only one peer
 * (`neo-gemini-pro`, etc.) and silently disappear for the other named peers'
 * tenant-aware summary reads.
 *
 * @member {String[]}
 */
export const CORE_SWARM_USER_IDS = Object.freeze([
    'neo-opus-ada',
    'neo-opus-grace',
    'neo-opus-vega',
    'neo-gemini-pro',
    'neo-gpt'
]);

/**
 * @summary AgentIdentity node-id form for {@link CORE_SWARM_USER_IDS}.
 * @member {String[]}
 */
export const CORE_SWARM_AGENT_IDS = Object.freeze(
    CORE_SWARM_USER_IDS.map(normalizeAgentIdentityNodeId)
);

/**
 * @summary Strips the `@`-prefix from AgentIdentity-style identifiers so userId comparisons
 * are always canonical-form.
 *
 * AgentIdentity graph node IDs use the form `@neo-opus-ada`,
 * but ChromaDB metadata `userId` values are stored without the prefix (`neo-opus-ada`).
 * Without a normalization boundary, code paths that mix the two forms produce silent
 * self-filtering — a write tags `userId: 'neo-opus-ada'` but a read filter that uses
 * `userId: '@neo-opus-ada'` returns zero rows even for the writer's own data.
 *
 * Use this helper at every read/write boundary that compares identifiers across the
 * AgentIdentity ↔ userId namespaces.
 *
 * @param {String|null|undefined} input The identifier to normalize.
 * @returns {String|undefined} The normalized identifier (no `@` prefix), or `undefined` for
 *     null/undefined input. Empty string is preserved as empty string.
 */
export function normalizeUserId(input) {
    if (input == null) return undefined;
    const str = String(input);
    return str.startsWith('@') ? str.slice(1) : str;
}

/**
 * @summary Parses comma-separated or array-form agent identifiers into canonical userIds.
 *
 * Summary metadata stores `participatingAgents` as a comma-separated string. Tool-call and
 * restore paths may hand us arrays or prefixed AgentIdentity node ids. This helper is the
 * normalization boundary for all of those shapes.
 *
 * @param {String|String[]|null|undefined} input Agent list to normalize.
 * @returns {String[]} Canonical userIds with empty entries removed.
 */
export function parseAgentList(input) {
    if (input == null) return [];

    const values = Array.isArray(input) ? input : String(input).split(',');
    return values
        .map(value => {
            let str = String(value).trim();
            // Remove agent wrappers like " (Antigravity)"
            str = str.replace(/\s*\(.*?\)\s*/g, '');
            // Lowercase to normalize e.g. "Neo-Gemini-Pro" to "neo-gemini-pro"
            str = str.toLowerCase();
            return normalizeUserId(str);
        })
        .filter(Boolean);
}

/**
 * @summary Returns true when a participating-agent list includes a named core swarm peer.
 *
 * @param {String|String[]|null|undefined} participatingAgents Summary metadata participant list.
 * @returns {Boolean}
 */
export function hasCoreSwarmParticipant(participatingAgents) {
    const participants = new Set(parseAgentList(participatingAgents));
    return CORE_SWARM_USER_IDS.some(userId => participants.has(userId));
}

/**
 * @summary Resolves the Chroma `userId` tag for session-summary writes.
 *
 * Raw memories remain owned by the active tenant. Session summaries are different: they are
 * compressed cross-turn navigation artifacts. If a summary involves any named core swarm
 * maintainer, tagging it to the single summarizing harness hides the artifact from the other
 * peers after tenant-aware reads. Core-swarm summaries therefore use the shared sentinel;
 * all other summaries retain the active request userId.
 *
 * @param {Object} input
 * @param {String|null|undefined} input.userId Active request userId.
 * @param {String|String[]|null|undefined} input.participatingAgents Summary participant metadata.
 * @returns {String|undefined} `shared`, a normalized userId, or undefined for single-tenant fallthrough.
 */
export function resolveSummaryVisibilityUserId({userId, participatingAgents} = {}) {
    if (hasCoreSwarmParticipant(participatingAgents)) {
        return SHARED_USER_ID;
    }

    return normalizeUserId(userId);
}

/**
 * @summary Request-scoped context propagation for MCP servers.
 *
 * Bridges the gap between the Express / MCP transport layer (where per-request auth claims
 * land on `req.auth`) and the service layer (which executes inside `callTool(name, args)` with
 * no access to the originating HTTP request). Wraps Node.js's built-in `AsyncLocalStorage` in
 * a Neo singleton so services can read request-scoped identity — `userId`, `username` — without
 * any of the primitive leaking into their method signatures.
 *
 * **Module-level exports:**
 * - {@link SHARED_USER_ID} — sentinel value for shared-baseline records
 * - {@link normalizeUserId} — `@`-prefix stripping boundary helper
 * - {@link resolveSummaryVisibilityUserId} — summary visibility resolver for core-swarm artifacts
 *
 * **Identity flow:**
 *
 * 1. **Streamable HTTP transport:** `AuthService.verifyAccessToken` validates the incoming Bearer
 *    token via OIDC introspection and returns `{userId, username, ...}` on the auth context,
 *    extracted from the introspection response's `preferred_username` / `sub` / `name` /
 *    `email` claims. `TransportService` wraps each `/mcp` request with
 *    `RequestContextService.run({userId, username, agentIdentityNodeId, source: 'oidc'}, ...)`.
 * 2. **Stdio transport:** `StdioIdentityResolver` resolves identity at server boot
 *    via `NEO_AGENT_IDENTITY` env-var or `gh api user` CLI fallback. The memory-core `Server`
 *    looks up the matching AgentIdentity graph node, then wraps every
 *    `CallToolRequestSchema` dispatch with `RequestContextService.run({userId, username,
 *    agentIdentityNodeId, source: 'env-var' | 'gh-cli'}, ...)`. Stdio now reaches parity with
 *    Streamable HTTP — per-agent GitHub account pinning tags writes with the correct tenant regardless of
 *    transport.
 * 3. **Service-layer consumption:** `MemoryService.addMemory`, `SummaryService.querySummaries`,
 *    etc. call `RequestContextService.getUserId()` and either tag ChromaDB writes with
 *    `metadata.userId` or apply `where: {userId}` filters on reads. Summary writes additionally
 *    route through {@link resolveSummaryVisibilityUserId} so core-swarm summaries become shared
 *    artifacts instead of single-peer private rows. Graph-edge-writing services additionally call
 *    `getAgentIdentityNodeId()` to terminate `AUTHORED_BY` / `OWNED_BY` edges on the correct
 *    identity node.
 * 4. **Unresolved-identity fallthrough:** when neither transport resolves a userId (stdio with
 *    neither env-var nor authenticated `gh` CLI, offline daemon contexts), `getUserId()` returns
 *    `undefined` and services fall back to **single-tenant mode** — no tag on writes, no filter
 *    on reads. This preserves compatibility with unauthenticated local tool sessions.
 *
 * **Why AsyncLocalStorage and not explicit parameter threading:** userId is a cross-cutting
 * concern that every ChromaDB touch point cares about. Threading it as a parameter through
 * every service method would pollute dozens of signatures. AsyncLocalStorage isolates the
 * concern cleanly — only the two boundaries (TransportService sets, services read) know about it.
 *
 * **Why not trust a reverse-proxy forwarded header instead:** the OIDC-introspection-derived
 * identity is self-contained defense-in-depth — the Memory Core validates the Bearer token's
 * claims from the provider, rather than trusting that upstream infrastructure correctly
 * populated a forwarded header. Both paths can coexist in deployments that run behind
 * oauth2-proxy, but the authoritative identity source is the OIDC claim.
 *
 * @class Neo.ai.mcp.server.shared.services.RequestContextService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.AuthService
 * @see Neo.ai.mcp.server.shared.services.TransportService
 */
class RequestContextService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.RequestContextService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.RequestContextService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The underlying Node.js AsyncLocalStorage instance. Request-scoped context flows through
     * the async boundary from Express middleware → MCP transport → service methods without
     * any parameter threading.
     * @member {AsyncLocalStorage}
     * @protected
     */
    storage = new AsyncLocalStorage()

    /**
     * Runs `callback` with the supplied context scoped to the active async call stack.
     *
     * @param {Object}   context                      The request-scoped context to expose.
     * @param {String}   [context.sessionId]          The MCP session ID (e.g. from the Mcp-Session-Id header).
     * @param {String}   [context.userId]             The authenticated user's identifier (from
     *                                                OIDC `preferred_username` / `sub`, or the
     *                                                `StdioIdentityResolver` env-var / gh-CLI
     *                                                chain in stdio mode). Undefined when no
     *                                                identity is resolvable — services treat
     *                                                that as single-tenant fallthrough.
     * @param {String}   [context.username]           Human-readable display name for logging.
     * @param {String}   [context.agentIdentityNodeId] ID of the bound AgentIdentity graph node
     *                                                (`@`-prefixed GitHub login). Populated when
     *                                                the resolved identity matches a seeded
     *                                                node in the Native Edge Graph. Null when
     *                                                the identity is unbound (e.g. unseeded
     *                                                agent or stdio `unresolved` source).
     * @param {String}   [context.source]             Provenance tag indicating where this
     *                                                identity originated: `'oidc'` (Streamable HTTP bearer
     *                                                token), `'env-var'` (stdio
     *                                                `NEO_AGENT_IDENTITY`), `'gh-cli'` (stdio
     *                                                `gh api user` fallback), or `'unresolved'`.
     *                                                Useful for auditability and debugging; not
     *                                                used for isolation decisions.
     * @param {Function} callback                     The async work to execute inside the context.
     * @returns {*} Whatever `callback` returns.
     */
    run(context, callback) {
        return this.storage.run(context, callback)
    }

    /**
     * Returns the active request-scoped context, or `undefined` if none is set.
     * @returns {Object|undefined}
     */
    get() {
        return this.storage.getStore()
    }

    /**
     * Convenience accessor for the authenticated user's identifier. Returns `undefined` when
     * no request context is active (stdio transport without identity resolution, offline
     * daemons) — call sites treat `undefined` as **single-tenant mode** and skip userId-based
     * tagging / filtering.
     * @returns {String|undefined}
     */
    getUserId() {
        return this.storage.getStore()?.userId
    }

    /**
     * Convenience accessor for the authenticated user's human-readable display name. Useful
     * for log lines; not a tenant-isolation key — use {@link RequestContextService#getUserId}
     * for isolation.
     * @returns {String|undefined}
     */
    getUsername() {
        return this.storage.getStore()?.username
    }

    /**
     * Convenience accessor for the bound AgentIdentity graph-node ID.
     * Services building `AUTHORED_BY` / `OWNED_BY` edges at write time use this to terminate
     * edges on the correct identity node. Returns `undefined` when no context is active, and
     * `null` when context is active but the resolved identity has no matching AgentIdentity
     * node in the graph (unseeded agent, new human user, etc.).
     * @returns {String|null|undefined}
     */
    getAgentIdentityNodeId() {
        return this.storage.getStore()?.agentIdentityNodeId
    }

    /**
     * Convenience accessor for the identity-resolution provenance tag. One of `'oidc'`,
     * `'env-var'`, `'gh-cli'`, `'unresolved'`, or `undefined` (no context). Used for
     * auditability and debug logging — NOT for isolation decisions (use `getUserId()`).
     * @returns {String|undefined}
     */
    getSource() {
        return this.storage.getStore()?.source
    }

    /**
     * @summary Builds a structured, actionable error for the identity-unbound fail-closed path.
     *
     * Identity-gated services (MailboxService, PermissionService, WakeSubscriptionService, …)
     * reject calls when {@link RequestContextService#getAgentIdentityNodeId} is null. Instead of
     * throwing a bare `"no agent identity context bound"` — which names neither the offending
     * value nor a remediation, and once cost a full session to diagnose (a stale
     * `NEO_AGENT_IDENTITY` handle that no longer mapped to a seeded AgentIdentity node) — call
     * sites throw this.
     *
     * `getUserId()` / `getSource()` stay populated even when the graph-node binding is null (the
     * present-but-unresolvable case), so the message names the attempted handle and distinguishes
     * it from the truly-unresolved (single-tenant) case. Does NOT relax the fail-closed posture —
     * it only enriches the message.
     *
     * @param {String} operation Short verb phrase for the attempted op, e.g. `'list messages'`.
     * @returns {Error} A fail-closed error with a remediation-bearing message.
     */
    unboundIdentityError(operation) {
        const userId = this.getUserId();
        const source = this.getSource();

        if (userId) {
            return new Error(
                `Cannot ${operation}: no agent identity context bound. Resolved handle ` +
                `'${userId}' (source: ${source || 'unknown'}) has no matching AgentIdentity ` +
                `node @${userId} — the handle is stale, renamed, or unseeded. Fix: correct ` +
                `NEO_AGENT_IDENTITY to a seeded handle, or seed it via seedAgentIdentities.mjs.`
            );
        }

        return new Error(
            `Cannot ${operation}: no agent identity context bound. No identity resolved — set ` +
            `NEO_AGENT_IDENTITY (stdio) or provide a valid Bearer token (Streamable HTTP multi-user mode).`
        );
    }

    /**
     * @summary Convenience accessor for the client-scoped MCP session ID.
     *
     * Extracted from the `Mcp-Session-Id` header by `TransportService`.
     * This is the primary driver for multi-tenant isolation in the Memory Core.
     * When present, it completely overrides the process-global fallback
     * in `SessionService`.
     *
     * @returns {String|undefined}
     */
    getSessionId() {
        return this.storage.getStore()?.sessionId
    }
}

export default Neo.setupClass(RequestContextService);
