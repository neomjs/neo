import {
    InitializeResultSchema,
    SUPPORTED_PROTOCOL_VERSIONS
} from '@modelcontextprotocol/sdk/types.js';
import {
    normalizeAgentIdentity,
    parseMcpEnvelope,
    readMcpToolPayload
} from './mcpWireParsing.mjs';

/**
 * @module ai/services/fleet/planeMailboxClient
 * @summary Streamable-HTTP MCP client for the containerized Agent OS plane — the seam that lets the
 * Fleet server's mailbox, compose, and catch-up bindings ride `<base>/mc/mcp` instead of in-process
 * memory-core singletons (the post-hard-cut split-brain fix).
 *
 * **One living session, verified once.** Unlike the tenant readiness probe
 * (`FleetTenantService.initializeMcpResource`, which deliberately closes its session), this client
 * exists to SERVE: `init({expectedIdentity})` performs the authenticated handshake (`initialize` →
 * negotiated `protocolVersion` → `notifications/initialized`), proves the bearer's plane-side
 * subject via `list_permissions` (the same oracle `probeMcpIdentity` rides — "returns the canonical
 * identity it actually used"), and keeps the session open for the process lifetime. A session the
 * plane expires mid-life is re-established ONCE per call, transparently.
 *
 * **The single-viewer invariant is init's job, not the caller's.** The Fleet server is
 * single-viewer by design (viewer resolved at boot, stamped per request).
 * Via a plane bearer, every call runs as the bearer's server-resolved subject, so plane mode is
 * only honest when that subject IS the boot-resolved viewer. `init` therefore REQUIRES
 * `expectedIdentity` and reports `{ok: false, reason: 'plane identity mismatch'}` on any other
 * subject — the entry refuses plane mode rather than silently re-attributing every admission
 * decision.
 *
 * **Error shape mirrors the in-process services.** The wire modules and adapters
 * (`fleetA2AActivityAdapter`, `fleetMailboxMirrorAdapter`, `wireFleetCatchUpSource`) already map a
 * THROWN read into their honest degraded/denied snapshots — so `callTool` throws on failure exactly
 * like the singletons do. Two bounded flavors, per the tenant service's no-remote-prose rule:
 * transport/protocol failures throw with status-only diagnostics; a tool-level `isError` result
 * throws the tool's own text — that text is OUR plane's service message (e.g. the
 * `CAN_READ_INBOX_OF` denial the mirror adapter classifies by contract), not arbitrary remote
 * prose, and suppressing it would break the admission-classification contract.
 *
 * Zero config reads: `baseUrl` + `credential` are injected by the boot entry, which resolves the
 * `AiConfig.fleet.planeBase` / `planeBearer` leaves at its use site per the AiConfig SSOT discipline.
 *
 * @see ai/services/fleet/devFleetServer.mjs — the consuming entry (binding decision + fallback)
 * @see ai/services/fleet/mcpWireParsing.mjs — the shared MCP-wire parsing authority
 * @see ai/services/fleet/FleetTenantService.mjs — the readiness-probe precedent this lifecycle mirrors
 */

const REQUESTED_PROTOCOL_VERSION = '2024-11-05';

/**
 * Per-request abort bound. Generous by design: the local plane legitimately answers in the
 * 15-25s range under embed/WAL load (measured 2026-08-02), and the in-process bindings this
 * client replaces had no bound at all — but a bound must exist, because an unbounded hang is
 * the sender-eating failure mode the wake fabric just taught us about. 60s matches the MCP
 * client norm this seat itself runs under.
 * @type {Number}
 */
const CALL_TIMEOUT_MS = 60_000;

/**
 * @summary Build the fixed header set for one plane request.
 * @param {Object} options
 * @param {String} options.credential
 * @param {String|null} [options.sessionId]
 * @param {String|null} [options.protocolVersion]
 * @returns {Object}
 * @private
 */
function planeHeaders({credential, sessionId = null, protocolVersion = null}) {
    const headers = {
        Accept        : 'application/json, text/event-stream',
        'Content-Type': 'application/json'
    };

    if (credential)      headers.Authorization          = `Bearer ${credential}`;
    if (protocolVersion) headers['mcp-protocol-version'] = protocolVersion;
    if (sessionId)       headers['mcp-session-id']       = sessionId;

    return headers
}

/**
 * @summary Create one plane mailbox client. Construction is passive — no request leaves before
 * `init()`.
 * @param {Object} options
 * @param {String} options.baseUrl Full MCP resource URL (`<planeBase>/mc/mcp`), derived by the
 *     entry per the connected-tenant resource contract.
 * @param {String} [options.credential] Plane bearer; empty is forwarded as-is (tokenless planes
 *     decide admission themselves, fail-closed).
 * @param {Function} [options.fetchImpl] Injection seam for tests; defaults to global `fetch`.
 * @returns {Object} `{init, callTool, listMessages, addMessage, close}`
 */
export function createPlaneMailboxClient({baseUrl, credential = '', fetchImpl = fetch}) {
    if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
        throw new Error('planeMailboxClient requires a non-empty baseUrl')
    }

    const url = baseUrl.trim();

    let session = null; // {sessionId, protocolVersion} once initialized

    /**
     * @summary Run the full handshake and hold the resulting session.
     * @returns {Promise<Object>} Bounded `{ok, status, reason?}` — never remote prose.
     * @private
     */
    async function establishSession() {
        const response = await fetchImpl(url, {
            method : 'POST',
            headers: planeHeaders({credential}),
            body   : JSON.stringify({
                jsonrpc: '2.0',
                id     : 1,
                method : 'initialize',
                params : {
                    protocolVersion: REQUESTED_PROTOCOL_VERSION,
                    capabilities   : {},
                    clientInfo     : {name: 'neo-fleet-plane-mailbox', version: '1'}
                }
            }),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        });

        const
            sessionId       = response.headers.get('mcp-session-id'),
            envelope        = parseMcpEnvelope(await response.text()),
            parsedResult    = InitializeResultSchema.safeParse(envelope?.result),
            result          = parsedResult.success ? parsedResult.data : null,
            protocolVersion = result?.protocolVersion;

        const initialized = response.ok &&
            envelope?.jsonrpc === '2.0' &&
            envelope?.id === 1 &&
            result &&
            SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion);

        if (!initialized) {
            return {ok: false, status: response.status, reason: `plane MCP initialize failed (${response.status})`}
        }

        const notifyResponse = await fetchImpl(url, {
            method : 'POST',
            headers: planeHeaders({credential, sessionId, protocolVersion}),
            body   : JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'}),
            signal : AbortSignal.timeout(CALL_TIMEOUT_MS)
        });

        await notifyResponse.text();

        if (!notifyResponse.ok) {
            return {ok: false, status: notifyResponse.status, reason: `plane MCP initialized-notification failed (${notifyResponse.status})`}
        }

        session = {sessionId, protocolVersion};

        return {ok: true, status: response.status}
    }

    /**
     * @summary One raw `tools/call` round-trip on the held session. No re-establishment here —
     * `callTool` owns the one-retry policy.
     * @param {String} name
     * @param {Object} args
     * @returns {Promise<Object>} `{response, envelope}`
     * @private
     */
    async function rawToolCall(name, args) {
        const response = await fetchImpl(url, {
            method : 'POST',
            headers: planeHeaders({credential, ...session}),
            body   : JSON.stringify({
                jsonrpc: '2.0',
                id     : 2,
                method : 'tools/call',
                params : {name, arguments: args ?? {}}
            }),
            signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
        });

        return {response, envelope: parseMcpEnvelope(await response.text())}
    }

    return {
        /**
         * @summary Handshake + single-viewer verification. REQUIRED before any tool call.
         * @param {Object} options
         * @param {String} options.expectedIdentity Boot-resolved viewer the bearer's plane-side
         *     subject must equal (canonical `@login` form).
         * @returns {Promise<Object>} Bounded `{ok, status, identity?, reason?}`.
         */
        async init({expectedIdentity}) {
            const expected = normalizeAgentIdentity(expectedIdentity);

            if (!expected) {
                return {ok: false, status: 0, reason: 'plane init requires a canonical expectedIdentity'}
            }

            let handshake;

            try {
                handshake = await establishSession()
            } catch (error) {
                return {ok: false, status: 0, reason: `plane unreachable (${error?.name ?? 'fetch failure'})`}
            }

            if (!handshake.ok) return handshake;

            try {
                const {response, envelope} = await rawToolCall('list_permissions', {});
                const payload              = readMcpToolPayload(envelope);
                const identity             = normalizeAgentIdentity(payload?.identity);

                if (!response.ok || !identity) {
                    return {ok: false, status: response.status, reason: `plane identity probe failed (${response.status})`}
                }

                if (identity !== expected) {
                    // The one refusal that protects every admission decision downstream: a bearer
                    // resolving to a different subject would silently re-attribute the whole surface.
                    return {ok: false, status: response.status, reason: 'plane identity mismatch'}
                }

                return {ok: true, status: response.status, identity}
            } catch (error) {
                return {ok: false, status: 0, reason: `plane identity probe unreachable (${error?.name ?? 'fetch failure'})`}
            }
        },

        /**
         * @summary Call one plane tool and return its parsed JSON payload. Throws like the
         * in-process services so the adapters' degraded/denied mapping applies unchanged.
         * @param {String} name Registered MC tool name (e.g. `list_messages`).
         * @param {Object} [args]
         * @returns {Promise<Object>}
         */
        async callTool(name, args = {}) {
            if (!session) throw new Error(`plane ${name} failed: client not initialized`);

            let {response, envelope} = await rawToolCall(name, args);

            // A plane restart invalidates the held session (404 per streamable-HTTP). One
            // transparent re-handshake per call keeps a long-lived Fleet process honest without
            // masking a genuinely down plane (the retry itself throws through on failure).
            if (response.status === 404) {
                const reestablished = await establishSession();

                if (!reestablished.ok) {
                    throw new Error(`plane ${name} failed: session lost and ${reestablished.reason}`)
                }

                ({response, envelope} = await rawToolCall(name, args))
            }

            if (!response.ok) {
                throw new Error(`plane ${name} failed: HTTP ${response.status}`)
            }

            const result = envelope?.result;

            if (result?.isError) {
                // The tool's own text is OUR plane service's message (admission denials included) —
                // the mirror adapter's ADMISSION_SCOPE classification contract depends on it.
                const text = result.content?.find?.(item => item?.type === 'text')?.text;

                throw new Error(typeof text === 'string' && text ? text : `plane ${name} failed: tool error`)
            }

            const payload = readMcpToolPayload(envelope);

            if (payload === null) {
                throw new Error(`plane ${name} failed: malformed tool payload`)
            }

            return payload
        },

        /**
         * @summary MailboxService-compatible `listMessages(args)`.
         * @param {Object} [args]
         * @returns {Promise<Object>}
         */
        listMessages(args = {}) {
            return this.callTool('list_messages', args)
        },

        /**
         * @summary MailboxService-compatible `addMessage(args)`.
         * @param {Object} [args]
         * @returns {Promise<Object>}
         */
        addMessage(args = {}) {
            return this.callTool('add_message', args)
        },

        /**
         * @summary Best-effort session teardown for clean shutdown paths.
         * @returns {Promise<void>}
         */
        async close() {
            if (!session) return;

            const held = session;

            session = null;

            try {
                const response = await fetchImpl(url, {
                    method : 'DELETE',
                    headers: planeHeaders({credential, ...held}),
                    signal : AbortSignal.timeout(2_000)
                });

                await response.text()
            } catch {
                // Shutdown cleanup stays bounded best effort — the plane reaps expired sessions.
            }
        }
    }
}
