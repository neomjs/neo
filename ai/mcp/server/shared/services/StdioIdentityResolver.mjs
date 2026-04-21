import {execSync} from 'child_process';
import Base       from '../../../../../src/core/Base.mjs';

/**
 * @summary Resolves the active agent identity for stdio MCP transport sessions.
 *
 * The stdio transport has no request-level authentication primitive (unlike the SSE transport's
 * OIDC Bearer token flow handled by `AuthService`). Identity must be pinned at process-boot time
 * so that every subsequent `callTool` dispatch inherits a consistent tenant tag via
 * `RequestContextService`, bringing stdio to **parity with the SSE identity propagation** shipped
 * by ticket #10000.
 *
 * **Resolution chain** (first match wins):
 *
 * 1. **`NEO_AGENT_IDENTITY` environment variable** — explicit pinning for agent harnesses.
 *    Claude Code sets this via `.claude/settings.json`; Gemini via `.gemini/settings.json`; other
 *    harnesses via their native config surface. This is the authoritative path for per-model
 *    GitHub account binding (precedent: #10144 seed identities `@neo-opus-4-7`, `@neo-gemini-3-1-pro`).
 * 2. **`gh api user` via the GitHub CLI** — zero-friction fallback for local human developers
 *    who have `gh` installed and authenticated. Matches the `@me` shortcut semantics used
 *    across the Agent OS tooling surface.
 * 3. **`unresolved`** — neither path yielded an identity. Downstream services treat this as
 *    **single-tenant mode** (backward-compatible with pre-#10145 behavior). Not a startup
 *    failure — preserves the existing local-agent developer experience.
 *
 * **Intentionally NOT in scope:**
 * - OAuth2/OIDC token validation — that's `AuthService` (SSE transport only)
 * - AgentIdentity graph-node binding — the consumer (`memory-core/Server.mjs`) calls
 *   `Memory_GraphService.getNode({id: '@' + githubLogin})` after resolution, then composes
 *   the full RequestContext. Keeping the graph lookup out of this service preserves the
 *   `shared/` ↔ `memory-core/` layering boundary.
 *
 * This class is a key example of the framework's **multi-tenant identity resolution** model
 * and demonstrates concepts like **agent identity**, **OAuth fallback patterns**, **zero-friction
 * developer experience**, and **stdio-SSE transport parity**.
 *
 * @class Neo.ai.mcp.server.shared.services.StdioIdentityResolver
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.AuthService
 * @see Neo.ai.mcp.server.shared.services.RequestContextService
 */
class StdioIdentityResolver extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.StdioIdentityResolver'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.StdioIdentityResolver',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the active agent identity via the configured chain (env-var → gh CLI → unresolved).
     * Returns a plain object suitable for spreading into `RequestContextService.run()` context.
     *
     * **Normalization:** GitHub login strings are stored WITHOUT the leading `@` to match
     * GitHub API conventions (`gh api user .login` returns `neo-opus-4-7`, not `@neo-opus-4-7`).
     * Callers that need the `@`-prefixed graph-node-id form (per #10144 seed convention) prepend
     * the `@` at lookup time.
     *
     * @returns {Promise<{githubLogin: String|null, username: String|null, source: String}>}
     *     An identity descriptor. `source` is one of `'env-var'`, `'gh-cli'`, or `'unresolved'`.
     */
    async resolve() {
        let envIdentity = process.env.NEO_AGENT_IDENTITY?.trim();

        if (envIdentity) {
            let login = envIdentity.startsWith('@') ? envIdentity.slice(1) : envIdentity;

            return {
                githubLogin: login,
                username   : login,
                source     : 'env-var'
            }
        }

        let ghUser = this.resolveFromGhCli();

        if (ghUser) {
            return {
                githubLogin: ghUser.login,
                username   : ghUser.name || ghUser.login,
                source     : 'gh-cli'
            }
        }

        return {
            githubLogin: null,
            username   : null,
            source     : 'unresolved'
        }
    }

    /**
     * Synchronously invokes `gh api user` to resolve the locally authenticated GitHub user.
     * Returns `null` if the CLI is absent, the user is not authenticated, the call exceeds the
     * timeout budget, or the JSON payload fails to parse. Silent-fail semantics are deliberate:
     * an unauthenticated `gh` is an expected state that must NOT block server startup.
     *
     * @returns {Object|null} The parsed GitHub user payload (`{login, name, ...}`) or `null`.
     * @protected
     */
    resolveFromGhCli() {
        try {
            let output = execSync('gh api user', {
                encoding: 'utf8',
                stdio   : ['ignore', 'pipe', 'ignore'],
                // 5s matches the MCP client-side init-handshake budget. A shorter budget (3s)
                // risks consuming so much of the handshake that the client times out before the
                // server finishes `initAsync` — particularly on stale auth tokens or proxied
                // networks. A `gh` that can't answer in 5s is effectively broken — the
                // unresolved-fallthrough path is the right destination.
                timeout : 5000
            });

            return JSON.parse(output)
        } catch (e) {
            return null
        }
    }
}

export default Neo.setupClass(StdioIdentityResolver);
