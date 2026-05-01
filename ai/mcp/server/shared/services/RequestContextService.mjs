import {AsyncLocalStorage} from 'async_hooks';
import Base                from '../../../../../src/core/Base.mjs';

/**
 * @summary Sentinel `userId` value tagging records that belong to the historical commons —
 * accessible to all tenants via the additive read filter.
 *
 * Reads in tenant-aware mode use `where: {$or: [{userId: <current>}, {userId: SHARED_USER_ID}]}`,
 * granting every authenticated tenant access to their own data PLUS the shared baseline.
 * The migration runner (`ai/scripts/backfillChromaSharedUserId.mjs`, #10556) tags any
 * pre-#10145 ChromaDB records lacking a `userId` key with this sentinel so the additive
 * read filter can return them. New writes always tag with the resolved per-tenant userId,
 * never with `SHARED_USER_ID`.
 *
 * @member {String}
 * @see #10556 — chromadb metadata backfill that introduces this sentinel
 * @see #10017 — adjacent SQLite Native Edge Graph migration (different storage layer, gradual)
 */
export const SHARED_USER_ID = 'shared';

/**
 * @summary Strips the `@`-prefix from AgentIdentity-style identifiers so userId comparisons
 * are always canonical-form.
 *
 * AgentIdentity graph node IDs use the form `@neo-opus-4-7` (per #10144 seed convention),
 * but ChromaDB metadata `userId` values are stored without the prefix (`neo-opus-4-7`).
 * Without a normalization boundary, code paths that mix the two forms produce silent
 * self-filtering — a write tags `userId: 'neo-opus-4-7'` but a read filter that uses
 * `userId: '@neo-opus-4-7'` returns zero rows even for the writer's own data.
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
 * @summary Request-scoped context propagation for MCP servers.
 *
 * Bridges the gap between the Express / MCP transport layer (where per-request auth claims
 * land on `req.auth`) and the service layer (which executes inside `callTool(name, args)` with
 * no access to the originating HTTP request). Wraps Node.js's built-in `AsyncLocalStorage` in
 * a Neo singleton so services can read request-scoped identity — `userId`, `username` — without
 * any of the primitive leaking into their method signatures.
 *
 * **Module-level exports:**
 * - {@link SHARED_USER_ID} — sentinel value for legacy/commons records (#10556)
 * - {@link normalizeUserId} — `@`-prefix stripping boundary helper (#10556)
 *
 * **Identity flow (Epic #9999, sub-epic #10016, tickets #10000 + #10145):**
 *
 * 1. **SSE transport (#10000):** `AuthService.verifyAccessToken` validates the incoming Bearer
 *    token via OIDC introspection and returns `{userId, username, ...}` on the auth context,
 *    extracted from the introspection response's `preferred_username` / `sub` / `name` /
 *    `email` claims. `TransportService` wraps each `/mcp` request with
 *    `RequestContextService.run({userId, username, agentIdentityNodeId, source: 'oidc'}, ...)`.
 * 2. **Stdio transport (#10145):** `StdioIdentityResolver` resolves identity at server boot
 *    via `NEO_AGENT_IDENTITY` env-var or `gh api user` CLI fallback. The memory-core `Server`
 *    looks up the matching AgentIdentity graph node (per ticket #10144), then wraps every
 *    `CallToolRequestSchema` dispatch with `RequestContextService.run({userId, username,
 *    agentIdentityNodeId, source: 'env-var' | 'gh-cli'}, ...)`. Stdio now reaches parity with
 *    SSE — per-agent GitHub account pinning tags writes with the correct tenant regardless of
 *    transport.
 * 3. **Service-layer consumption:** `MemoryService.addMemory`, `SummaryService.querySummaries`,
 *    etc. call `RequestContextService.getUserId()` and either tag ChromaDB writes with
 *    `metadata.userId` or apply `where: {userId}` filters on reads. Graph-edge-writing services
 *    additionally call `getAgentIdentityNodeId()` to terminate `AUTHORED_BY` / `OWNED_BY` edges
 *    on the correct identity node.
 * 4. **Unresolved-identity fallthrough:** when neither transport resolves a userId (stdio with
 *    neither env-var nor authenticated `gh` CLI, offline daemon contexts), `getUserId()` returns
 *    `undefined` and services fall back to **single-tenant mode** — no tag on writes, no filter
 *    on reads. Backward-compatible with pre-#10145 behavior.
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
     * @param {String}   [context.userId]             The authenticated user's identifier (from
     *                                                OIDC `preferred_username` / `sub`, or the
     *                                                `StdioIdentityResolver` env-var / gh-CLI
     *                                                chain in stdio mode). Undefined when no
     *                                                identity is resolvable — services treat
     *                                                that as single-tenant fallthrough.
     * @param {String}   [context.username]           Human-readable display name for logging.
     * @param {String}   [context.agentIdentityNodeId] ID of the bound AgentIdentity graph node
     *                                                (per ticket #10144's seed convention:
     *                                                `@`-prefixed GitHub login). Populated when
     *                                                the resolved identity matches a seeded
     *                                                node in the Native Edge Graph. Null when
     *                                                the identity is unbound (e.g. unseeded
     *                                                agent or stdio `unresolved` source).
     * @param {String}   [context.source]             Provenance tag indicating where this
     *                                                identity originated: `'oidc'` (SSE bearer
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
     * Convenience accessor for the bound AgentIdentity graph-node ID (per ticket #10144).
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
}

export default Neo.setupClass(RequestContextService);
