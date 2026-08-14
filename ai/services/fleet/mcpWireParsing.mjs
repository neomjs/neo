/**
 * @module ai/services/fleet/mcpWireParsing
 * @summary The fleet subsystem's ONE MCP-wire parsing authority — the pure envelope/payload/identity
 * helpers shared by the tenant readiness probe (`FleetTenantService.initializeMcpResource`) and the
 * plane mailbox client (`planeMailboxClient.mjs`).
 *
 * Extracted standalone (no Neo, no config, no service imports) for two reasons: per-module security
 * copies are a known defect class (five redactors, three authors, zero complete copies), and a pure
 * module keeps unit suites hermetic — consumers can be spec'd without dragging the tenant service's
 * class-system import graph into the test process.
 */

/**
 * Hosts for which plain `http:` is accepted. Deliberately an exact set rather than a range or a
 * pattern: this is the one exception to the TLS rule that protects the bearer, so it stays small
 * enough to audit at a glance. `[::1]` keeps its brackets: compared against `URL#hostname`, which
 * returns the IPv6 literal bracketed.
 * @type {Set<String>}
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * @summary Canonical origin+path form (no trailing slash) so one endpoint maps to one identity.
 * @param {URL} url
 * @returns {String}
 * @private
 */
function canonicalize(url) {
    return (url.origin + url.pathname).replace(/\/+$/, '');
}

/**
 * @summary The shared endpoint-boundary policy for authenticated MCP consumption: http/https only,
 * no credentials-in-URL (a URL-embedded secret would bypass the credential store and land in logs),
 * and TLS required for anything remote — plain `http:` survives only for exact loopback hosts,
 * where there is no network hop to intercept. Returns the canonical endpoint or `null`.
 *
 * One deliberate widening exists, and it is caller-declared rather than ambient:
 * `allowPlainHttpHosts` names exact additional hostnames a DEPLOYMENT vouches for as
 * confidential internal hops (compose-network service DNS, where the "network hop" is a
 * container bridge the deployment itself owns). The default is empty, which keeps this function
 * byte-for-byte the strict policy; an unnamed internal host is a shadow topology and stays
 * refused. The hop still never substitutes for admission — the credential requirement is
 * unchanged on every path.
 *
 * One policy, two consumers: the tenant connect flow (`FleetTenantService.normalizeEndpoint`)
 * and the plane mailbox client validate through this single definition. The tenant flow passes
 * no allowance and is therefore unwidened by construction.
 * @param {*} candidateUrl
 * @param {Object} [options]
 * @param {String[]} [options.allowPlainHttpHosts=[]] Exact hostnames the deployment declares as
 *     confidential internal hops for plain `http:` dialing.
 * @returns {String|null}
 */
export function normalizeSecureMcpEndpoint(candidateUrl, {allowPlainHttpHosts = []} = {}) {
    if (typeof candidateUrl !== 'string' || candidateUrl.trim() === '') return null;

    let url;

    try {
        url = new URL(candidateUrl.trim());
    } catch {
        return null;
    }

    if (url.username || url.password) return null;

    if (url.protocol === 'https:') return canonicalize(url);

    if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return canonicalize(url);

    if (url.protocol === 'http:' && Array.isArray(allowPlainHttpHosts) && allowPlainHttpHosts.includes(url.hostname)) {
        return canonicalize(url)
    }

    return null
}

/**
 * @summary Normalize a provider login / AgentIdentity node id to the canonical `@login` shape.
 * The provider response is remote-authored, so malformed values fail closed instead of crossing
 * into diagnostics.
 * @param {*} value
 * @returns {String|null}
 */
export function normalizeAgentIdentity(value) {
    if (typeof value !== 'string') return null;

    const login = value.trim().replace(/^AGENT_IDENTITY:/, '').replace(/^@/, '');

    return login && /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/.test(login) ? `@${login}` : null
}

/**
 * @summary Parse one JSON or SSE MCP response envelope without forwarding remote prose.
 * @param {String} text
 * @returns {Object|null}
 */
export function parseMcpEnvelope(text) {
    try {
        return JSON.parse(text)
    } catch {}

    for (const line of String(text).split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;

        try {
            return JSON.parse(line.slice(5).trim())
        } catch {}
    }

    return null
}

/**
 * @summary Read the JSON payload of one MCP tool result. Only structured JSON or a JSON text item
 * is accepted; arbitrary remote text never becomes a diagnostic.
 * @param {Object|null} envelope A JSON-RPC response envelope (`{result}`).
 * @returns {Object|null}
 */
export function readMcpToolPayload(envelope) {
    return readMcpToolResultPayload(envelope?.result)
}

/**
 * @summary The bare-result sibling of {@link readMcpToolPayload} for SDK-client callers, which
 * receive the CallToolResult directly rather than a JSON-RPC envelope. Same acceptance rule.
 * @param {Object|null} result
 * @returns {Object|null}
 */
export function readMcpToolResultPayload(result) {
    if (!result || result.isError) return null;
    if (result.structuredContent && typeof result.structuredContent === 'object') {
        return result.structuredContent
    }

    const text = result.content?.find?.(item => item?.type === 'text')?.text;

    if (typeof text !== 'string') return null;

    try {
        return JSON.parse(text)
    } catch {
        return null
    }
}
