import Base from '../../../../../src/core/Base.mjs';

/**
 * Set of argument keys that an MCP tool caller MUST NOT supply — the server always derives
 * these from the active `RequestContextService` (OIDC Bearer token for Streamable HTTP, stdio env-var /
 * gh-CLI resolution). Client-supplied values would let a Gemini-harness
 * session forge a write attributed to `@neo-opus-ada`, etc.
 *
 * **Scope note:** `recipient` / `to` fields are legitimate (destination address, not claim-of-
 * authorship). Only claim-of-authorship fields belong here.
 * @private
 */
const IDENTITY_OVERRIDE_KEYS = new Set([
    'userId',
    'agentId',
    'agentIdentityNodeId',
    'githubLogin',
    'from',
    'sender',
    'authorLogin'
]);

/**
 * @summary Thin argument-level anti-spoof middleware for MCP tool calls.
 *
 * Lives at the `callTool` dispatch choke-point. Rejects any tool-call whose arguments include
 * a key that would let the client override server-stamped identity. Complements
 * `AuthService` (OIDC transport-level authentication) and `RequestContextService` (identity
 * propagation) — the three services together close the **multi-tenant anti-spoof** invariant:
 *
 * - `AuthService` / `StdioIdentityResolver` establish WHO the caller is.
 * - `RequestContextService` propagates that identity into the service-method call chain.
 * - `AuthMiddleware` blocks any tool-argument path that could contradict the propagated identity.
 *
 * **Present-day behavior:** no current MCP tool schema exposes any of the forbidden keys, so
 * this middleware is a no-op on every live tool call. It exists as **defense-in-depth** for
 * upcoming additions — particularly Mailbox tooling, which adds `from` fields where the spoof
 * surface becomes real. Shipping the guard before the surface is the inverse of "patch after
 * incident" hygiene.
 *
 * **Not in scope:**
 * - OIDC token verification — that's `AuthService`
 * - Identity propagation — that's `RequestContextService`
 * - Per-tenant read-filter enforcement — that's the service layer (e.g. `MemoryService.listMemories`
 *   applies `where: {userId}` via `RequestContextService.getUserId()`)
 *
 * This class is a key example of the framework's **multi-tenant anti-spoof** model and
 * demonstrates concepts like **agent identity**, **write-path integrity**, and
 * **defense-in-depth**.
 *
 * @class Neo.ai.mcp.server.shared.services.AuthMiddleware
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.AuthService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 * @see Neo.ai.mcp.server.shared.services.StdioIdentityResolver
 */
class AuthMiddleware extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.AuthMiddleware'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.AuthMiddleware',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Inspects the tool-call `args` for any forbidden identity-override key. Throws on a hit;
     * returns normally on clean args.
     *
     * **Why throw instead of return an error payload:** the caller is `CallToolRequestSchema`'s
     * handler in each MCP server's `Server.mjs`, which already has a uniform `try`/`catch` that
     * converts thrown errors into MCP error responses. Throwing keeps the middleware stateless
     * and preserves the existing error-shape contract.
     *
     * @param {Object|null|undefined} args Raw tool-call arguments.
     * @throws {Error} When `args` contains a key listed in {@link IDENTITY_OVERRIDE_KEYS}.
     */
    validateNoIdentitySpoof(args) {
        if (!args || typeof args !== 'object') {
            return;
        }

        for (const key of Object.keys(args)) {
            if (IDENTITY_OVERRIDE_KEYS.has(key)) {
                throw new Error(
                    `Identity-override spoof rejected: '${key}' is a server-stamped field. ` +
                    `Remove it from tool arguments; the caller identity is derived from the ` +
                    `active RequestContext (OIDC Bearer token for Streamable HTTP, NEO_AGENT_IDENTITY or ` +
                    `gh-CLI resolution for stdio). See learn/agentos/tooling/MemoryCoreMcpAuth.md.`
                );
            }
        }
    }

    /**
     * Returns a copy of the forbidden identity-override key set for testability and for
     * documentation tooling. Do not mutate the returned collection.
     * @returns {Set<String>}
     */
    getIdentityOverrideKeys() {
        return new Set(IDENTITY_OVERRIDE_KEYS);
    }
}

export default Neo.setupClass(AuthMiddleware);
