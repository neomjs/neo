import {redactReadFailure} from './redactReadFailure.mjs';

/**
 * @module ai/services/fleet/fleetSessionMemoriesSource
 * @summary Brain-side, viewer-bound source for the Fleet cockpit's memories DRILL-IN: the
 * turn-level records of ONE session, as the single injected `get_session_memories` operation
 * returns them, passed through as a typed, fail-honest envelope. The summaries sibling serves the
 * DERIVED reading (session summaries); this source serves the AUTHORED depth those summaries
 * point at — same trust posture (the memory corpus is the deployment's settled team-visible
 * read; the plane's own sharing policy governs what the operation answers), same discipline:
 * no Fleet synthesis, ranking, cache, durable state, or permission simulation, and a failure
 * surfaces as an honest capability state, never a fabricated empty history.
 */

const
    // MC session ids are UUID-shaped; the pane passes back exactly what a summary card carried.
    // The pattern admits UUIDs and close cousins while refusing anything wire-injection-shaped —
    // a mismatch is a caller bug worth surfacing, never something to coerce.
    SESSION_ID   = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/,
    MAX_LIMIT    = 50,
    DEFAULT_LIMIT = 20;

/**
 * @summary Coerce one supported time value to finite epoch milliseconds.
 * @param {Date|String|Number} value
 * @param {String} name
 * @returns {Number}
 * @private
 */
function toMs(value, name) {
    const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

    if (!Number.isFinite(ms)) {
        throw new TypeError(`fleet session memories: ${name} must be a finite timestamp`)
    }

    return ms
}

/**
 * @summary Validate the paging offset. Absent resolves to 0; anything but a non-negative integer
 * is rejected rather than coerced, so a caller bug stays visible.
 * @param {Number|undefined} offset
 * @returns {Number}
 * @private
 */
function validateOffset(offset) {
    if (offset === undefined) {
        return 0
    }

    if (!Number.isInteger(offset) || offset < 0) {
        throw new TypeError('fleet session memories: offset must be a non-negative integer')
    }

    return offset
}

/**
 * @summary Validate the page size. Absent resolves to the default; anything outside the closed
 * integer range is rejected rather than clamped.
 * @param {Number|undefined} limit
 * @returns {Number}
 * @private
 */
function validateLimit(limit) {
    if (limit === undefined) {
        return DEFAULT_LIMIT
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new TypeError(`fleet session memories: limit must be an integer between 1 and ${MAX_LIMIT}`)
    }

    return limit
}

/**
 * @summary Create the process-lifetime Fleet session-memories source.
 *
 * The transport-stamped viewer is resolved at EACH call. The session is an explicit id the caller
 * names (a summary card is the expected pointer); the operation call carries the session and page,
 * nothing else — no viewer claim, no target-agent axis (the session's own records name their
 * authors; the wire never re-asserts attribution the records already carry).
 *
 * @param {Object} options
 * @param {Function} options.getSessionMemories Injected `get_session_memories` operation returning
 *     the parsed payload (`{sessionId, count, total, memories}`).
 * @param {Function} options.resolveViewerIdentity Returns the transport-stamped canonical @identity.
 * @param {Function} [options.now] Clock returning a Date/epoch/ISO value.
 * @returns {{readSessionMemories: Function}}
 */
export function createFleetSessionMemoriesSource({
    getSessionMemories,
    resolveViewerIdentity,
    now = () => new Date()
} = {}) {
    if (typeof getSessionMemories !== 'function' || typeof resolveViewerIdentity !== 'function' ||
        typeof now !== 'function') {
        throw new TypeError('createFleetSessionMemoriesSource: getSessionMemories, resolveViewerIdentity, and now are required')
    }

    const resolveViewer = async () => {
        const viewer = await resolveViewerIdentity();

        if (typeof viewer !== 'string' || !/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(viewer)) {
            throw new Error('fleet session memories: authenticated ingress did not bind a canonical viewer identity')
        }

        return viewer
    };

    return {
        /**
         * @summary Read one page of a session's turn-level memories through the source-owned
         * operation. Success passes the operation's rows through untouched under a `wired`
         * capability with the honest corpus `total`; an operation failure or unrecognized payload
         * becomes an `unavailable` envelope carrying zero rows — a wired empty page is claimed
         * ONLY when the operation itself answered one. A failure envelope additionally carries a
         * sanitized `detail` (whitespace-collapsed, credential-redacted, THEN 240-bounded via the
         * shared reduction) so the surface can say WHY beside the constant reason.
         * @param {Object} params
         * @param {String} params.sessionId The session whose turns to read — a summary card's pointer.
         * @param {Number} [params.offset] Paging offset into the session's turns.
         * @param {Number} [params.limit] Page size, 1..50.
         * @returns {Promise<Object>}
         */
        async readSessionMemories(params = {}) {
            const
                viewer    = await resolveViewer(),
                sessionId = params?.sessionId;

            if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) {
                throw new TypeError('fleet session memories: sessionId must be a canonical session id')
            }

            const
                offset     = validateOffset(params?.offset),
                limit      = validateLimit(params?.limit),
                capturedAt = new Date(toMs(now(), 'now')).toISOString(),
                page       = {offset, limit},
                shared     = {viewer, sessionId, page};

            let result;

            try {
                result = await getSessionMemories({
                    sessionId,
                    limit,
                    ...(offset > 0 ? {offset} : {})
                })
            } catch (error) {
                const detail = redactReadFailure(error);

                // one fact, two consumers: the envelope carries it to the operator surface, the
                // warn is the fleet child's own server-side copy — the memories sibling's proven
                // diagnosability contract, applied from birth here
                console.warn(`[fleet] session memories read failed (${sessionId}): ${detail ?? 'no legible error'}`);

                return {
                    capability: {state: 'unavailable', reason: 'session-memories-read-failed', capturedAt, ...(detail ? {detail} : {})},
                    ...shared,
                    turns: [],
                    count: 0,
                    total: null
                }
            }

            if (!result || typeof result !== 'object' || !Array.isArray(result.memories)) {
                return {
                    capability: {state: 'unavailable', reason: 'session-memories-payload-unrecognized', capturedAt},
                    ...shared,
                    turns: [],
                    count: 0,
                    total: null
                }
            }

            return {
                capability: {state: 'wired', capturedAt},
                ...shared,
                turns: result.memories,
                count: Number.isFinite(result.count) ? result.count : result.memories.length,
                total: Number.isFinite(result.total) ? result.total : result.memories.length
            }
        }
    }
}

export default createFleetSessionMemoriesSource;
