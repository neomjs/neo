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
 * @param {Object|null} envelope
 * @returns {Object|null}
 */
export function readMcpToolPayload(envelope) {
    const result = envelope?.result;

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
