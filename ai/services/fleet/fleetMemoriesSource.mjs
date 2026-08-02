/**
 * @module ai/services/fleet/fleetMemoriesSource
 * @summary Brain-side, viewer-bound source for the Fleet cockpit's memories view. It invokes the
 * single injected `query_recent_turns` operation for one explicit target agent and passes the
 * result through as a typed, fail-honest envelope. There is no Fleet synthesis, ranking, cache,
 * durable state, or permission simulation on this path: the plane (or in-process Memory Core)
 * remains the only read authority, and a denial or failure surfaces as an honest capability state,
 * never a fabricated empty success.
 */

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
 * @summary Validate the optional paging cursor. The cursor is the operation's own `nextCursor`
 * shape (`{timestamp, id}`) passed back verbatim; this guard only rejects shapes that could never
 * have come from a previous envelope.
 * @param {Object|undefined} before
 * @returns {Object|undefined}
 * @private
 */
function validateBefore(before) {
    if (before === undefined || before === null) {
        return undefined
    }

    if (typeof before !== 'object' || Array.isArray(before) ||
        (typeof before.timestamp !== 'string' && typeof before.id !== 'string')) {
        throw new TypeError('fleet memories: before must be a cursor object carrying timestamp and/or id strings')
    }

    return before
}

/**
 * @summary Validate the page size. Absent resolves to the default; anything outside the closed
 * integer range is rejected rather than clamped, so a caller bug is visible instead of silently
 * reshaped.
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
 * at a trust boundary — the wire carries concrete identities only. The projection is DERIVED, never
 * caller-chosen: `private` exactly when the target IS the viewer, `public` otherwise. The plane
 * enforces its own admission (`CAN_READ_MEMORIES_OF`, tenant sharing policy) regardless; this
 * source never pre-filters or predicts that decision.
 *
 * @param {Object} options
 * @param {Function} options.queryRecentTurns Injected `query_recent_turns` operation returning the
 *     parsed payload (`{count, turns, nextCursor}`).
 * @param {Function} options.resolveViewerIdentity Returns the transport-stamped canonical @identity.
 * @param {Function} [options.now] Clock returning a Date/epoch/ISO value.
 * @returns {{readMemories: Function}}
 */
export function createFleetMemoriesSource({
    queryRecentTurns,
    resolveViewerIdentity,
    now = () => new Date()
} = {}) {
    if (typeof queryRecentTurns !== 'function' || typeof resolveViewerIdentity !== 'function' ||
        typeof now !== 'function') {
        throw new TypeError('createFleetMemoriesSource: queryRecentTurns, resolveViewerIdentity, and now are required')
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
         * @summary Read one page of an agent's recent turn memories through the source-owned
         * operation. Success passes the operation's rows through untouched under a `wired`
         * capability; an operation failure or unrecognized payload becomes an honest
         * `unavailable` envelope carrying zero rows.
         * @param {Object} [params]
         * @param {String} [params.agentIdentity] Canonical `@identity` target; defaults to the viewer.
         * @param {Object} [params.before] The previous envelope's `nextCursor`, for paging back.
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
                before     = validateBefore(params?.before),
                limit      = validateLimit(params?.limit),
                projection = target === viewer ? 'private' : 'public',
                capturedAt = new Date(toMs(now(), 'now')).toISOString(),
                page       = {before: before ?? null, limit},
                shared     = {viewer, target, projection, page};

            let result;

            try {
                result = await queryRecentTurns({
                    agentIdentity: target,
                    detail       : 'summary',
                    limit,
                    projection,
                    ...(before ? {before} : {})
                })
            } catch (error) {
                return {
                    capability: {state: 'unavailable', reason: 'memories-read-failed', capturedAt},
                    ...shared,
                    turns     : [],
                    count     : 0,
                    nextCursor: null
                }
            }

            if (!result || typeof result !== 'object' || !Array.isArray(result.turns)) {
                return {
                    capability: {state: 'unavailable', reason: 'memories-payload-unrecognized', capturedAt},
                    ...shared,
                    turns     : [],
                    count     : 0,
                    nextCursor: null
                }
            }

            return {
                capability: {state: 'wired', capturedAt},
                ...shared,
                turns     : result.turns,
                count     : Number.isFinite(result.count) ? result.count : result.turns.length,
                nextCursor: result.nextCursor ?? null
            }
        }
    }
}

export default createFleetMemoriesSource;
