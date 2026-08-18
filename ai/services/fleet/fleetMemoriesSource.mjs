/**
 * @module ai/services/fleet/fleetMemoriesSource
 * @summary Brain-side, viewer-bound source for the Fleet cockpit's memories view. It invokes the
 * single injected `get_all_summaries` operation for one explicit target agent and passes the
 * result through as a typed, fail-honest envelope of session summaries. There is no Fleet
 * synthesis, ranking, cache, durable state, or permission simulation on this path: the summary
 * corpus is the deployment's settled team-visible cross-author read, and a failure surfaces as an
 * honest capability state, never a fabricated empty history.
 */

import {redactReadFailure} from './redactReadFailure.mjs';

const
    CANONICAL_IDENTITY = /^@[A-Za-z0-9][A-Za-z0-9._-]*$/,
    MAX_LIMIT          = 50,
    DEFAULT_LIMIT      = 20;

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
        throw new TypeError(`fleet memories: ${name} must be a finite timestamp`)
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
        throw new TypeError('fleet memories: offset must be a non-negative integer')
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
        throw new TypeError(`fleet memories: limit must be an integer between 1 and ${MAX_LIMIT}`)
    }

    return limit
}

/**
 * @summary Create the process-lifetime Fleet memories source.
 *
 * The transport-stamped viewer is resolved at EACH call. The target agent is an explicit canonical
 * `@identity` (defaulting to the viewer); the `@me` alias is rejected because aliases have no place
 * at a trust boundary — the wire carries concrete identities only. The operation call carries the
 * target, page, and nothing else: no viewer claim, no projection axis (session summaries have no
 * private half — the corpus is the deployment's team-visible read per its own sharing policy).
 *
 * @param {Object} options
 * @param {Function} options.getAllSummaries Injected `get_all_summaries` operation returning the
 *     parsed payload (`{count, total, summaries}`).
 * @param {Function} options.resolveViewerIdentity Returns the transport-stamped canonical @identity.
 * @param {Function} [options.now] Clock returning a Date/epoch/ISO value.
 * @returns {{readMemories: Function}}
 */
export function createFleetMemoriesSource({
    getAllSummaries,
    resolveViewerIdentity,
    now = () => new Date()
} = {}) {
    if (typeof getAllSummaries !== 'function' || typeof resolveViewerIdentity !== 'function' ||
        typeof now !== 'function') {
        throw new TypeError('createFleetMemoriesSource: getAllSummaries, resolveViewerIdentity, and now are required')
    }

    const resolveViewer = async () => {
        const viewer = await resolveViewerIdentity();

        if (typeof viewer !== 'string' || !CANONICAL_IDENTITY.test(viewer)) {
            throw new Error('fleet memories: authenticated ingress did not bind a canonical viewer identity')
        }

        return viewer
    };

    return {
        /**
         * @summary Read one page of an agent's session summaries through the source-owned
         * operation. Success passes the operation's rows through untouched under a `wired`
         * capability with the honest corpus `total`; an operation failure or unrecognized payload
         * becomes an `unavailable` envelope carrying zero rows — a wired empty page is claimed
         * ONLY when the operation itself answered one. A failure envelope additionally carries a
         * sanitized `detail` (whitespace-collapsed, 240-bounded, credential-redacted) so the
         * surface can say WHY beside the constant reason — absence of the field means the error
         * had no legible message, never that nothing failed.
         * @param {Object} [params]
         * @param {String} [params.agentIdentity] Canonical `@identity` target; defaults to the viewer.
         * @param {Number} [params.offset] Paging offset into the target's summaries, newest-first.
         * @param {Number} [params.limit] Page size, 1..50.
         * @returns {Promise<Object>}
         */
        async readMemories(params = {}) {
            const viewer = await resolveViewer();

            let target = params?.agentIdentity === undefined || params?.agentIdentity === null
                ? viewer
                : params.agentIdentity;

            if (target === '@me') {
                throw new TypeError('fleet memories: the @me alias is not admitted on this wire — name the concrete identity')
            }

            if (typeof target !== 'string' || !CANONICAL_IDENTITY.test(target)) {
                throw new TypeError('fleet memories: agentIdentity must be a canonical @identity')
            }

            const
                offset     = validateOffset(params?.offset),
                limit      = validateLimit(params?.limit),
                capturedAt = new Date(toMs(now(), 'now')).toISOString(),
                page       = {offset, limit},
                shared     = {viewer, target, page};

            let result;

            try {
                result = await getAllSummaries({
                    agentIdentity: target,
                    limit,
                    ...(offset > 0 ? {offset} : {})
                })
            } catch (error) {
                const detail = redactReadFailure(error);

                // one fact, two consumers: the envelope carries it to the operator surface, the
                // warn is the fleet child's own copy — the log line whose absence made this
                // failure class silently undiagnosable server-side
                console.warn(`[fleet] memories read failed (${target}): ${detail ?? 'no legible error'}`);

                return {
                    capability: {state: 'unavailable', reason: 'memories-read-failed', capturedAt, ...(detail ? {detail} : {})},
                    ...shared,
                    sessions: [],
                    count   : 0,
                    total   : null
                }
            }

            if (!result || typeof result !== 'object' || !Array.isArray(result.summaries)) {
                return {
                    capability: {state: 'unavailable', reason: 'memories-payload-unrecognized', capturedAt},
                    ...shared,
                    sessions: [],
                    count   : 0,
                    total   : null
                }
            }

            return {
                capability: {state: 'wired', capturedAt},
                ...shared,
                sessions: result.summaries,
                count   : Number.isFinite(result.count) ? result.count : result.summaries.length,
                total   : Number.isFinite(result.total) ? result.total : result.summaries.length
            }
        }
    }
}

export default createFleetMemoriesSource;
