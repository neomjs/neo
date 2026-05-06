/**
 * @summary Resolves the MCP server HTTP listening port with backwards-compat for the legacy
 * `SSE_PORT` env var.
 *
 * `SSE_PORT` was the original env var introduced when the SSE transport was the only
 * non-stdio path (#10145 / PR #10166 era). Per #10808 operator-facing env-var ergonomics,
 * we rename to `MCP_HTTP_PORT` (transport-mechanism-agnostic, intent-clear for operators
 * provisioning containers). Soft rename: `MCP_HTTP_PORT` is preferred; `SSE_PORT` remains
 * readable during the deprecation window with a warning when both are set with different
 * values.
 *
 * Pattern mirrors {@link Neo.ai.mcp.server.memory-core.helpers.EmbeddingProviderConfig#resolveEmbeddingProvider}
 * from PR #10810 — pure, testable, dependency-free; consumers (`Server.mjs` config templates)
 * call it once at config-load time.
 *
 * @param {Object}   options
 * @param {Object}   [options.env=process.env]   Environment map (overridable for tests).
 * @param {Function} [options.warn=console.warn] Warning sink for deprecation/conflict notices.
 * @param {Number}   options.defaultPort         Default port if neither env var is set
 *     (KB defaults to 3000, MC defaults to 3001 — caller passes its own default).
 * @returns {Number} The resolved port.
 */
export function resolveMcpHttpPort({env = process.env, warn = console.warn, defaultPort} = {}) {
    const hasValue = value => value !== undefined && value !== null && value !== '';

    const newPort    = hasValue(env.MCP_HTTP_PORT) ? Number(env.MCP_HTTP_PORT) : null;
    const legacyPort = hasValue(env.SSE_PORT)      ? Number(env.SSE_PORT)      : null;

    if (legacyPort !== null) {
        if (newPort !== null && newPort !== legacyPort) {
            warn(`[Config] SSE_PORT is deprecated and conflicts with MCP_HTTP_PORT; using ${newPort}.`);
        } else {
            warn('[Config] SSE_PORT is deprecated; use MCP_HTTP_PORT.');
        }
    }

    return newPort ?? legacyPort ?? defaultPort;
}
