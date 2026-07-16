import {execSync} from 'child_process';
import Base       from '../../../../../src/core/Base.mjs';

/**
 * @summary Resolves the active agent identity for stdio MCP transport sessions.
 *
 * The stdio transport has no request-level authentication primitive (unlike the Streamable HTTP transport's
 * OIDC Bearer token flow handled by `AuthService`). Identity must be pinned at process-boot time
 * so that every subsequent `callTool` dispatch inherits a consistent tenant tag via
 * `RequestContextService`, bringing stdio to **parity with Streamable HTTP identity propagation**.
 *
 * **Resolution chain** (first match wins):
 *
 * 1. **`NEO_AGENT_IDENTITY` environment variable** — explicit pinning in the MCP subprocess
 *    environment. Claude and Antigravity clients set it in their native MCP server definitions;
 *    Antigravity 2.x can use either its global `~/.gemini/config/mcp_config.json` authority or a
 *    workspace `.agents/mcp_config.json` authority. This is the authoritative path for per-model
 *    GitHub account binding to seeded AgentIdentity node ids such as `@neo-opus-ada`.
 * 2. **`gh api user` via the GitHub CLI** — zero-friction fallback for local human developers
 *    who have `gh` installed and authenticated. Matches the `@me` shortcut semantics used
 *    across the Agent OS tooling surface.
 * 3. **`unresolved`** — neither path yielded an identity. Downstream services treat this as
 *    **single-tenant mode** (the unauthenticated local transport fallback). Not a startup
 *    failure — preserves the existing local-agent developer experience.
 *
 * **Intentionally NOT in scope:**
 * - OAuth2/OIDC token validation — that's `AuthService` (Streamable HTTP transport only)
 * - AgentIdentity graph-node binding — the consumer (`memory-core/Server.mjs`) calls
 *   the shared `normalizeAgentIdentityNodeId()` boundary before the graph lookup, then
 *   composes the full RequestContext. Keeping the graph lookup out of this service preserves
 *   the `shared/` ↔ `memory-core/` layering boundary.
 *
 * This class is a key example of the framework's **multi-tenant identity resolution** model
 * and demonstrates concepts like **agent identity**, **OAuth fallback patterns**, **zero-friction
 * developer experience**, and **stdio/Streamable-HTTP transport parity**.
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
     * GitHub API conventions (`gh api user .login` returns `neo-opus-ada`, not `@neo-opus-ada`).
     * Callers that need the `@`-prefixed graph-node-id form use the shared
     * `normalizeAgentIdentityNodeId()` boundary at lookup time.
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
                // 1.5s fail-fast budget. A healthy `gh api user` resolves in <200ms; a call
                // that takes longer is likely hanging on auth refresh or a degraded network.
                // The MCP client-side init-handshake budget is ~5s TOTAL — it includes this
                // call PLUS ChromaDB health checks, SystemLifecycleService.ready(),
                // GraphService.ready(), and transport connect. Matching the gh timeout to the
                // full budget would consume 100% on a hang, guaranteeing client timeout. Fail
                // fast to unresolved-fallthrough (single-tenant mode) instead; agent harnesses
                // that care about identity fidelity set `NEO_AGENT_IDENTITY` explicitly.
                timeout : 1500
            });

            return JSON.parse(output)
        } catch (e) {
            return null
        }
    }
}

export default Neo.setupClass(StdioIdentityResolver);
