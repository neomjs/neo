import {AsyncLocalStorage} from 'async_hooks';
import Base                from '../../../../../src/core/Base.mjs';

/**
 * @summary Request-scoped context propagation for MCP servers.
 *
 * Bridges the gap between the Express / MCP transport layer (where per-request auth claims
 * land on `req.auth`) and the service layer (which executes inside `callTool(name, args)` with
 * no access to the originating HTTP request). Wraps Node.js's built-in `AsyncLocalStorage` in
 * a Neo singleton so services can read request-scoped identity — `userId`, `username` — without
 * any of the primitive leaking into their method signatures.
 *
 * **Identity flow (Epic #9999, sub-epic #10016, ticket #10000):**
 *
 * 1. `AuthService.verifyAccessToken` validates the incoming Bearer token via OIDC introspection
 *    and returns `{userId, username, ...}` on the auth context, extracted from the introspection
 *    response's `preferred_username` / `sub` / `name` / `email` claims.
 * 2. `TransportService` wraps each `/mcp` request with `RequestContextService.run({userId,
 *    username}, () => transport.handleRequest(req, res, req.body))` — establishes the
 *    request-scoped context before the MCP transport dispatches the JSON-RPC call.
 * 3. Service methods (`MemoryService.addMemory`, `SummaryService.querySummaries`, etc.) call
 *    `RequestContextService.getUserId()` and either tag ChromaDB writes with `metadata.userId`
 *    or apply `where: {userId}` filters on reads — per the multi-tenant isolation contract.
 * 4. In **stdio transport mode** no middleware runs, so `getUserId()` returns `undefined`.
 *    Services treat this as **single-tenant mode** (backward-compatible) — no tag on writes,
 *    no filter on reads. This preserves the local-agent development experience unchanged.
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
     * @param {Object}   context            The request-scoped context to expose.
     * @param {String}   [context.userId]   The authenticated user's identifier (from OIDC
     *                                      `preferred_username` or `sub`). Undefined when
     *                                      no auth is active (stdio mode, localhost dev).
     * @param {String}   [context.username] Human-readable display name for logging.
     * @param {Function} callback           The async work to execute inside the context.
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
     * no request context is active (stdio transport, offline daemons) — call sites treat
     * `undefined` as **single-tenant mode** and skip userId-based tagging / filtering.
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
}

export default Neo.setupClass(RequestContextService);
