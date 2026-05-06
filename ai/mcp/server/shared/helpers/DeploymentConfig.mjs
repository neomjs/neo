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

    const parsePort = (rawValue, envVarName) => {
        if (!hasValue(rawValue)) return null;
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num <= 0 || num > 65535) {
            warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be integer in 1..65535); falling back.`);
            return null;
        }
        return num;
    };

    const newPort    = parsePort(env.MCP_HTTP_PORT, 'MCP_HTTP_PORT');
    const legacyPort = parsePort(env.SSE_PORT,      'SSE_PORT');

    if (legacyPort !== null) {
        if (newPort !== null && newPort !== legacyPort) {
            warn(`[Config] SSE_PORT is deprecated and conflicts with MCP_HTTP_PORT; using ${newPort}.`);
        } else {
            warn('[Config] SSE_PORT is deprecated; use MCP_HTTP_PORT.');
        }
    }

    return newPort ?? legacyPort ?? defaultPort;
}

/**
 * @summary Resolves the ChromaDB host with optional fallback to a legacy server-prefixed env var.
 *
 * Per #10808 operator-facing env-var ergonomics: `NEO_CHROMA_HOST` is the canonical
 * operator-set env var (used by KB own Chroma config + MC `engines.kb.chroma`
 * unified-mode reference). `NEO_KB_CHROMA_HOST` is the legacy-prefixed form retained
 * for MC's existing `engines.kb.chroma` fallback chain during the deprecation window.
 *
 * Pure function: takes env + optional legacyEnvVar; returns resolved host string.
 *
 * @param {Object}   options
 * @param {Object}   [options.env=process.env]   Environment map (overridable for tests).
 * @param {String}   [options.defaultHost='localhost'] Default when no env var is set.
 * @param {String}   [options.legacyEnvVar]      Optional legacy env-var name to consult after `NEO_CHROMA_HOST`
 *     (e.g., `'NEO_KB_CHROMA_HOST'` for MC's `engines.kb.chroma` block; KB own config does not pass this).
 * @returns {String}
 */
export function resolveChromaHost({env = process.env, defaultHost = 'localhost', legacyEnvVar} = {}) {
    const hasValue = value => value !== undefined && value !== null && value !== '';

    if (hasValue(env.NEO_CHROMA_HOST))                  return env.NEO_CHROMA_HOST;
    if (legacyEnvVar && hasValue(env[legacyEnvVar]))    return env[legacyEnvVar];
    return defaultHost;
}

/**
 * @summary Resolves the ChromaDB port with optional fallback to a legacy server-prefixed env var.
 *
 * Sibling of {@link resolveChromaHost}. Same semantics; numeric port handling. Invalid values
 * (non-integer / out-of-range / negative) fall back to the next layer with a warning, mirroring
 * the {@link resolveMcpHttpPort} validity contract.
 *
 * @param {Object}   options
 * @param {Object}   [options.env=process.env]   Environment map (overridable for tests).
 * @param {Function} [options.warn=console.warn] Warning sink for invalid-value notices.
 * @param {Number}   [options.defaultPort=8000]  Default when no env var is set.
 * @param {String}   [options.legacyEnvVar]      Optional legacy env-var name to consult after `NEO_CHROMA_PORT`.
 * @returns {Number}
 */
export function resolveChromaPort({env = process.env, warn = console.warn, defaultPort = 8000, legacyEnvVar} = {}) {
    const hasValue = value => value !== undefined && value !== null && value !== '';

    const parsePort = (rawValue, envVarName) => {
        if (!hasValue(rawValue)) return null;
        const num = Number(rawValue);
        if (!Number.isInteger(num) || num <= 0 || num > 65535) {
            warn(`[Config] Invalid ${envVarName} value: "${rawValue}" (must be integer in 1..65535); falling back.`);
            return null;
        }
        return num;
    };

    const newPort    = parsePort(env.NEO_CHROMA_PORT, 'NEO_CHROMA_PORT');
    const legacyPort = legacyEnvVar ? parsePort(env[legacyEnvVar], legacyEnvVar) : null;

    return newPort ?? legacyPort ?? defaultPort;
}

/**
 * @summary Resolves the canonical public URL for the MCP server.
 *
 * Checks `NEO_PUBLIC_URL`. Validates parseability.
 * 
 * @param {Object}   options
 * @param {Object}   [options.env=process.env]   Environment map (overridable for tests).
 * @param {Function} [options.warn=console.warn] Warning sink for invalid-value notices.
 * @returns {String|null} The resolved URL or null if invalid/unset.
 */
export function resolvePublicUrl({env = process.env, warn = console.warn} = {}) {
    const rawValue = env.NEO_PUBLIC_URL;
    if (rawValue === undefined || rawValue === null || rawValue === '') return null;
    
    try {
        const url = new URL(rawValue);
        // Ensure trailing slash is removed for consistency
        return url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
    } catch (e) {
        warn(`[Config] Invalid NEO_PUBLIC_URL value: "${rawValue}" (must be a valid URL); falling back.`);
        return null;
    }
}
