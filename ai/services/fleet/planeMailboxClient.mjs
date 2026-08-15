import {Client}                        from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
    normalizeAgentIdentity,
    normalizeSecureMcpEndpoint,
    readMcpToolResultPayload
} from './mcpWireParsing.mjs';

/**
 * @module ai/services/fleet/planeMailboxClient
 * @summary The containerized-plane MCP client the Fleet server binds its mailbox, compose, and
 * catch-up seams to — the post-hard-cut split-brain fix, riding the OFFICIAL MCP SDK client and
 * Streamable-HTTP transport rather than a hand-rolled protocol state machine: the SDK owns request
 * ids (unique across in-flight calls), response correlation, protocol negotiation, and the
 * initialized handshake, so concurrent consumers (the catch-up source issues two tool calls via
 * `Promise.allSettled`) correlate safely by construction.
 *
 * **Endpoint boundary before any request.** Construction validates through the shared
 * `normalizeSecureMcpEndpoint` policy (http/https only, no URL-embedded credentials, TLS required
 * off-loopback) — the same single definition the tenant connect flow enforces. A rejected endpoint
 * never emits a request.
 *
 * **One living session, proven every time it is (re)established.** `init({expectedIdentity})`
 * connects and proves the bearer's plane-side subject via `list_permissions` ("returns the
 * canonical identity it actually used"). The Fleet server is single-viewer by design (viewer
 * resolved at boot, stamped per request), so plane mode is only honest when that subject IS the
 * boot viewer — any other subject refuses fail-closed. The SAME proof gates every recovery: a
 * transport-level failure mid-call triggers exactly one reconnect, which must re-prove the SAME
 * identity before the original call is replayed; a changed or unprovable identity throws WITHOUT
 * replaying (a session replacement is a new trust decision, not a retry detail).
 *
 * **Error shape mirrors the in-process services.** The wire modules and adapters map a THROWN read
 * into their honest degraded/denied snapshots — so `callTool` throws on failure exactly like the
 * singletons do. Transport failures throw with bounded diagnostics; a tool-level `isError` result
 * throws the tool's own text — that text is OUR plane's service message (e.g. the admission denial
 * the mirror adapter classifies by contract), not arbitrary remote prose. Request timeout is the
 * SDK protocol default (60s), which matches the measured local plane under embed/WAL load
 * (initialize ~17s, list_messages ~25s observed 2026-08-02) while still bounding every call —
 * an unbounded hang is the sender-eating failure mode the wake fabric taught the same night.
 *
 * Zero config reads: `baseUrl` + `credential` are injected by the boot entry, which resolves the
 * `AiConfig.fleet.planeBase` / `planeBearer` leaves at its use site per the AiConfig SSOT
 * discipline.
 *
 * @see ai/services/fleet/devFleetServer.mjs — the consuming entry (binding decision + fallback)
 * @see ai/services/fleet/mcpWireParsing.mjs — the shared wire-parsing + endpoint-boundary authority
 * @see test/playwright/integration/fixtures/mcpClient.mjs — the SDK client/transport precedent
 */

/**
 * @summary Create one plane mailbox client. Construction validates the endpoint and is otherwise
 * passive — no request leaves before `init()`.
 * @param {Object} options
 * @param {String} options.baseUrl Full MCP resource URL (`<planeBase>/mc/mcp`), derived by the
 *     entry per the connected-tenant resource contract.
 * @param {String} [options.credential] Plane bearer; empty omits the Authorization header
 *     (tokenless planes decide admission themselves, fail-closed).
 * @param {Function} [options.fetchImpl] Injection seam for tests — forwarded to the SDK transport's
 *     custom-fetch option; defaults to global `fetch`.
 * @param {Function} [options.createSession] Full session-factory override for tests:
 *     `() => {client, transport}` with SDK-compatible shapes. Defaults to the real SDK pair.
 * @param {String[]} [options.allowPlainHttpHosts=[]] Deployment-declared confidential internal
 *     hostnames forwarded to the shared endpoint policy (compose-internal service DNS); empty
 *     keeps the strict loopback-or-TLS rule unchanged.
 * @returns {Object} `{init, callTool, listMessages, addMessage, close}`
 * @throws {Error} When the endpoint fails the shared secure-endpoint policy.
 */
/**
 * The typed binding-class blocker code this client stamps on refusals it KNOWS are viewer-binding
 * failures — the identity-oracle refusals in `connectProven` (no canonical identity / identity
 * mismatch), the one class whose leak would re-attribute the whole surface. Transport failures,
 * timeouts, and 5xx stay UNSTAMPED: they are ambiguous, and an ambiguous stamp would misclassify
 * exactly the way the mirror adapter's bare-`Unauthorized` warning names. Consumers (the presence
 * adapter's `reasonCode` passthrough) bind to this string BY CONTRACT and guard with their own
 * closed set — never by message-matching.
 * @type {String}
 */
export const VIEWER_BINDING_UNAVAILABLE = 'viewer-binding-unavailable'

export function createPlaneMailboxClient({baseUrl, credential = '', fetchImpl = null, createSession = null, allowPlainHttpHosts = []}) {
    const endpoint = normalizeSecureMcpEndpoint(baseUrl, {allowPlainHttpHosts});

    if (!endpoint) {
        throw new Error(
            'planeMailboxClient refused the endpoint: http/https only, no URL-embedded ' +
            'credentials, and TLS is required for non-loopback hosts.'
        )
    }

    const buildSession = createSession || (() => {
        const headers = credential ? {Authorization: `Bearer ${credential}`} : {};

        return {
            transport: new StreamableHTTPClientTransport(new URL(endpoint), {
                requestInit: {headers},
                ...(fetchImpl ? {fetch: fetchImpl} : {})
            }),
            client: new Client({name: 'neo-fleet-plane-mailbox', version: '1'}, {capabilities: {}})
        }
    });

    let session = null, // {client, transport, identity} once proven
        expected     = null,
        establishing = null, // the single-flight proof attempt every concurrent acquirer shares
        closing      = null; // the shared terminal close barrier every closer awaits

    /**
     * Every teardown in flight, OBSERVABLE to the close barrier: a failing caller's candidate-local
     * teardown runs outside the barrier's own awaits, and an unobservable one would let `close()`
     * resolve — and a signal handler exit — while a stale-session DELETE is still pending.
     * @type {Set<Promise>}
     */
    const pendingTeardowns = new Set();

    /**
     * @summary Tear one session down, awaited and tolerant: the plane-side session DELETE
     * (`terminateSession`) then the transport close, each best-effort so a refusal exit can never
     * leak a half-open session or mask the refusal itself. Enrolled in {@link pendingTeardowns} so
     * the close barrier drains EVERY in-flight teardown before it resolves, whoever started it.
     * @param {Object|null} candidate `{client, transport}`
     * @returns {Promise<void>}
     * @private
     */
    function teardown(candidate) {
        if (!candidate) return Promise.resolve();

        const work = (async () => {
            try { await candidate.transport?.terminateSession?.() } catch { /* reaped or unreachable */ }
            try { await candidate.client?.close?.() }               catch { /* already closed */ }
        })().finally(() => pendingTeardowns.delete(work));

        pendingTeardowns.add(work);

        return work
    }

    /**
     * @summary Establish + PROVE one session: SDK connect (initialize handshake included), then the
     * `list_permissions` identity oracle against the held expectation. Any failure tears the
     * candidate down and reports a bounded refusal — a session is only ever stored proven.
     * @returns {Promise<Object>} Bounded `{ok, identity?, reason?}`.
     * @private
     */
    async function connectProven() {
        const candidate = buildSession();

        try {
            await candidate.client.connect(candidate.transport)
        } catch (error) {
            await teardown(candidate);

            return {ok: false, reason: `plane unreachable (${error?.name ?? 'connect failure'})`}
        }

        let result;

        try {
            result = await candidate.client.callTool({name: 'list_permissions', arguments: {}})
        } catch (error) {
            await teardown(candidate);

            return {ok: false, reason: `plane identity probe unreachable (${error?.name ?? 'call failure'})`}
        }

        const identity = normalizeAgentIdentity(readMcpToolResultPayload(result)?.identity);

        if (!identity) {
            await teardown(candidate);

            return {ok: false, reason: 'plane identity probe returned no canonical identity', blockerCode: VIEWER_BINDING_UNAVAILABLE}
        }

        if (identity !== expected) {
            // The one refusal that protects every admission decision downstream: a bearer resolving
            // to a different subject would silently re-attribute the whole surface.
            await teardown(candidate);

            return {ok: false, reason: 'plane identity mismatch', blockerCode: VIEWER_BINDING_UNAVAILABLE}
        }

        session = {...candidate, identity};

        return {ok: true, identity}
    }

    /**
     * @summary SINGLE-FLIGHT, GENERATION-SAFE proven-session acquisition: every concurrent acquirer
     * (recovering callers, lazy re-establishment, init) shares ONE `connectProven` attempt — and an
     * acquirer arriving while a proven session ALREADY exists rides it instead of starting a later
     * proof. The two guards together kill both windows of the overwrite/orphan race: overlapping
     * acquisitions share the latch, and post-completion acquisitions see the stored session — no
     * generation-3 proof can ever overwrite and orphan generation 2. A closed client (no held
     * expectation) refuses instead of reacquiring.
     * @returns {Promise<Object>} Bounded `{ok, identity?, reason?}`.
     * @private
     */
    function acquireProven() {
        if (!expected) return Promise.resolve({ok: false, reason: 'client closed'});
        if (session)   return Promise.resolve({ok: true, identity: session.identity});

        establishing ||= connectProven().finally(() => { establishing = null });

        return establishing
    }

    /**
     * @summary Positively identified session-invalid failure — the SDK's proven 404 class (the
     * streamable-HTTP server answers 404 for a stale/unknown `mcp-session-id`). ONLY this class is
     * replay-eligible: a timeout, network error, or 5xx is AMBIGUOUS — the server may have already
     * committed the call — and an ambiguous mutating replay double-sends (MC assigns a fresh
     * message id per `add_message` invocation, so a replay is a second durable message, never a
     * dedupe).
     * @param {*} error
     * @returns {Boolean}
     * @private
     */
    /**
     * @summary Build the session-lost throw, carrying the readmission's typed blocker code
     * verbatim when the refusal site stamped one — the refusal site already classified; the
     * throw only CARRIES the type, never derives it.
     * @param {String} name
     * @param {Object} readmission
     * @returns {Error}
     * @private
     */
    function sessionLostError(name, readmission) {
        const failure = new Error(`plane ${name} failed: session lost and ${readmission.reason}`);

        if (readmission.blockerCode) {
            failure.planeBlockerCode = readmission.blockerCode
        }

        return failure
    }

    function isSessionInvalid(error) {
        return error?.code === 404 || /\bHTTP 404\b/.test(error?.message ?? '')
    }

    /**
     * @summary Map one SDK CallToolResult into the in-process contract: tool errors throw their own
     * text, malformed payloads throw bounded, valid payloads return parsed.
     * @param {String} name
     * @param {Object} result
     * @returns {Object}
     * @private
     */
    function mapToolResult(name, result) {
        if (result?.isError) {
            const text = result.content?.find?.(item => item?.type === 'text')?.text;

            throw new Error(typeof text === 'string' && text ? text : `plane ${name} failed: tool error`)
        }

        const payload = readMcpToolResultPayload(result);

        if (payload === null) {
            throw new Error(`plane ${name} failed: malformed tool payload`)
        }

        return payload
    }

    return {
        /**
         * @summary Connect + prove the single-viewer invariant. REQUIRED before any tool call.
         * @param {Object} options
         * @param {String} options.expectedIdentity Boot-resolved viewer the bearer's plane-side
         *     subject must equal (canonical `@login` form).
         * @returns {Promise<Object>} Bounded `{ok, identity?, reason?}`.
         */
        async init({expectedIdentity}) {
            const next = normalizeAgentIdentity(expectedIdentity);

            if (!next) {
                return {ok: false, reason: 'plane init requires a canonical expectedIdentity'}
            }

            // Terminal-close any prior life FIRST — close() clears the expectation, so the new one
            // is installed after it, never nulled by it. Re-arming opens a NEW close epoch: the
            // spent barrier is reset so a later close() tears THIS life down too.
            await this.close();

            closing  = null;
            expected = next;

            return acquireProven()
        },

        /**
         * @summary Call one plane tool and return its parsed JSON payload. Throws like the
         * in-process services so the adapters' degraded/denied mapping applies unchanged.
         *
         * Recovery contract, three rules with teeth:
         * 1. **Replay only the proven session-invalid class** (the SDK's 404 on a stale
         *    `mcp-session-id`), at most once per invocation. A timeout, network error, or 5xx is
         *    AMBIGUOUS — the server may have committed the call — so it throws instead of
         *    replaying: for `add_message` a replay would be a SECOND durable message, and the
         *    honest answer for reads is the adapters' degraded state, not a maybe-doubled read.
         * 2. **Acquisition is single-flight** ({@link acquireProven}): concurrent recovering
         *    callers share one re-proof; a lazy re-establishment after an earlier failed recovery
         *    rides the same gate, so the client never bricks and never races handshakes.
         * 3. **Clearing is candidate-local**: a failing caller only clears/tears the session IT
         *    rode, and only while that session is still current — a caller failing on an
         *    already-replaced session must not destroy its successor.
         * @param {String} name Registered MC tool name (e.g. `list_messages`).
         * @param {Object} [args]
         * @returns {Promise<Object>}
         */
        async callTool(name, args = {}) {
            if (!expected) throw new Error(`plane ${name} failed: client not initialized`);

            let recovered = false;

            if (!session) {
                const readmission = await acquireProven();

                if (!readmission.ok) {
                    throw sessionLostError(name, readmission)
                }

                recovered = true
            }

            const mine = session;

            let result;

            try {
                result = await mine.client.callTool({name, arguments: args})
            } catch (error) {
                // Candidate-local clear: only the still-current failed session is cleared and torn
                // down; when a concurrent caller already replaced it, the successor stays untouched
                // (the replacer's own failure path tore the shared predecessor exactly once).
                if (session === mine) {
                    session = null;
                    await teardown(mine)
                }

                if (!isSessionInvalid(error)) {
                    throw new Error(`plane ${name} failed: ${error?.name ?? 'call failure'} (ambiguous — not replayed)`)
                }

                if (recovered) {
                    // This invocation already spent its one reconnect — a second failure on a
                    // freshly proven session is the plane failing NOW, not a stale-session artifact.
                    throw new Error(`plane ${name} failed: ${error?.name ?? 'call failure'} on a freshly established session`)
                }

                // Generation-safe: a concurrent caller may already have proven the replacement —
                // ride it. Only acquire when no current session exists (and acquireProven itself
                // re-checks, so a still-later arrival cannot start an overwriting proof either).
                let fresh = session;

                if (!fresh) {
                    const readmission = await acquireProven();

                    if (!readmission.ok) {
                        throw sessionLostError(name, readmission)
                    }

                    fresh = session
                }

                if (!fresh) {
                    // A terminal close raced the acquisition — closed beats replay.
                    throw new Error(`plane ${name} failed: client closed during recovery`)
                }

                result = await fresh.client.callTool({name, arguments: args})
            }

            return mapToolResult(name, result)
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
         * @summary The SHARED TERMINAL close barrier. Every closer — explicit close, concurrent
         * signal handlers, refusal exits — awaits the SAME promise, and that promise resolves only
         * after (1) any in-flight establishment is fenced (awaited; with the expectation already
         * cleared it lands on its own mismatch path and tears its candidate down — and a proof that
         * beat the clear is captured late and torn here), and (2) the held session's teardown
         * completed. Post-close reacquisition is refused at {@link acquireProven} (`client closed`),
         * and later calls answer "client not initialized". `init` opens a new epoch by resetting
         * the spent barrier after awaiting it.
         * @returns {Promise<void>}
         */
        close() {
            closing ||= (async () => {
                const held = session;

                session  = null;
                expected = null;

                if (establishing) {
                    try { await establishing } catch { /* refusal paths tear their own candidate */ }
                }

                // A proof that completed between the clear above and its own mismatch check may
                // have stored — capture and tear it so no candidate survives the barrier.
                const late = session;

                session = null;

                teardown(held);
                teardown(late);

                // Drain EVERY in-flight teardown — the barrier's own two above AND any
                // candidate-local teardown a concurrently failing caller started before or during
                // this close. A signal handler awaiting close() therefore never exits while a
                // stale-session DELETE is still pending.
                while (pendingTeardowns.size) {
                    await Promise.allSettled([...pendingTeardowns])
                }
            })();

            return closing
        }
    }
}
