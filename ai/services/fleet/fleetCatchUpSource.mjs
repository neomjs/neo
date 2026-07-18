/**
 * @module ai/services/fleet/fleetCatchUpSource
 * @summary Brain-side, viewer-bound source for the Fleet cockpit's invoked catch-up view. It owns
 * only the process-lifetime `{lastSeen,lastVisitAt}` anchor and invokes the two source-owned history
 * operations independently; their `notAuthority` envelopes pass through unchanged. There is no
 * Fleet synthesis, ranking, digest, graph/browser write, or result cache on this path.
 */

const FIRST_USE_PRESET_MS = Object.freeze({
    daily  : 24 * 60 * 60 * 1000,
    '3-day': 3 * 24 * 60 * 60 * 1000,
    weekly : 7 * 24 * 60 * 60 * 1000
});

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
        throw new TypeError(`fleet catch-up: ${name} must be a finite timestamp`)
    }

    return ms
}

/**
 * @summary Resolve one explicit half-open window and reject reversed or future bounds.
 * @param {Object} options
 * @returns {{windowStart: String, windowEnd: String}}
 * @private
 */
function validateWindow({windowStart, windowEnd, nowMs}) {
    const startMs = toMs(windowStart, 'windowStart'),
          endMs   = toMs(windowEnd,   'windowEnd');

    if (startMs >= endMs) {
        throw new RangeError('fleet catch-up: windowStart must be before windowEnd')
    }

    if (endMs > nowMs) {
        throw new RangeError('fleet catch-up: windowEnd cannot be in the future')
    }

    return {windowStart: new Date(startMs).toISOString(), windowEnd: new Date(endMs).toISOString()}
}

/**
 * @summary Resolve the Memory partition. Fleet is the default; an agent drill must be canonical
 * `@<identity>`. The PR operation never receives this partition.
 * @param {String} partition
 * @returns {String}
 * @private
 */
function validatePartition(partition='unified') {
    if (partition === 'unified' || /^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(partition)) {
        return partition
    }

    throw new TypeError('fleet catch-up: partition must be "unified" or a canonical @identity')
}

/**
 * @summary Turn one source operation settlement into a typed source slot while preserving every
 * byte of a recognized Bird View envelope under `envelope`.
 * @param {String} source
 * @param {PromiseSettledResult} settlement
 * @returns {Object}
 * @private
 */
function projectSource(source, settlement) {
    const envelope = settlement.status === 'fulfilled' ? settlement.value : null;

    if (!envelope || typeof envelope !== 'object' || envelope.notAuthority !== true) {
        return {
            source,
            state            : 'unavailable',
            unavailableReason: `${source}-history-unavailable`,
            envelope         : null
        }
    }

    return {
        source,
        state            : envelope.coverage?.degraded === true ? 'degraded' : 'available',
        unavailableReason: null,
        envelope
    }
}

/**
 * @summary Create the process-lifetime Fleet catch-up source.
 *
 * The transport-stamped viewer is resolved at EACH call and is the only state key. Caller-carried
 * identity fields are ignored by construction. `readHistory` keeps the two source calls independent;
 * `markCaughtUp` is a separate runtime-only write capability and can advance only through the exact
 * latest rendered `windowEnd` for that viewer.
 *
 * @param {Object} options
 * @param {Function} options.exploreMemoryHistory Injected `explore_memory_history` operation.
 * @param {Function} options.explorePullRequestHistory Injected `explore_pull_request_history` operation.
 * @param {Function} options.resolveViewerIdentity Returns the transport-stamped canonical @identity.
 * @param {Function} [options.now] Clock returning a Date/epoch/ISO value.
 * @returns {{readHistory: Function, markCaughtUp: Function}}
 */
export function createFleetCatchUpSource({
    exploreMemoryHistory,
    explorePullRequestHistory,
    resolveViewerIdentity,
    now = () => new Date()
} = {}) {
    if (typeof exploreMemoryHistory !== 'function' || typeof explorePullRequestHistory !== 'function' ||
        typeof resolveViewerIdentity !== 'function' || typeof now !== 'function') {
        throw new TypeError('createFleetCatchUpSource: both history operations, resolveViewerIdentity, and now are required')
    }

    // Runtime anchors only. A new source instance (Fleet-service restart) starts empty by design.
    const viewerState = new Map();

    const resolveViewer = async () => {
        const viewer = await resolveViewerIdentity();

        if (typeof viewer !== 'string' || !/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(viewer)) {
            throw new Error('fleet catch-up: authenticated ingress did not bind a canonical viewer identity')
        }

        return viewer
    };

    const getState = viewer => {
        let state = viewerState.get(viewer);

        if (!state) {
            state = {lastSeen: null, lastVisitAt: null, lastRenderedWindowEnd: null, readGeneration: 0};
            viewerState.set(viewer, state)
        }

        return state
    };

    return {
        /**
         * @summary Read one Fleet or per-agent catch-up window through both source-owned operations.
         * @param {Object} [params]
         * @returns {Promise<Object>}
         */
        async readHistory(params = {}) {
            const viewer     = await resolveViewer(),
                  state      = getState(viewer),
                  generation = ++state.readGeneration,
                  nowMs      = toMs(now(), 'now'),
                  partition  = validatePartition(params?.partition),
                  hasStart   = params?.windowStart !== undefined,
                  hasEnd     = params?.windowEnd !== undefined;

            if (hasStart !== hasEnd) {
                throw new TypeError('fleet catch-up: windowStart and windowEnd must be supplied together')
            }

            let requestedWindow;

            if (hasStart) {
                requestedWindow = validateWindow({windowStart: params.windowStart, windowEnd: params.windowEnd, nowMs})
            } else if (params?.firstUsePreset !== undefined) {
                const duration = FIRST_USE_PRESET_MS[params.firstUsePreset];

                if (!duration) {
                    throw new TypeError('fleet catch-up: firstUsePreset must be daily, 3-day, or weekly')
                }

                requestedWindow = validateWindow({windowStart: nowMs - duration, windowEnd: nowMs, nowMs})
            } else {
                const start = state.lastSeen ?? state.lastVisitAt;

                if (!start) {
                    return {
                        capability         : {state: 'wired', capturedAt: new Date(nowMs).toISOString()},
                        needsFirstUseWindow: true,
                        partition,
                        viewerState        : {lastSeen: null, lastVisitAt: null},
                        window             : null,
                        sources            : null
                    }
                }

                requestedWindow = validateWindow({windowStart: start, windowEnd: nowMs, nowMs})
            }

            const memoryArgs                         = {...requestedWindow, partition},
                  pullArgs                           = {...requestedWindow, resolution: 'all_resolved'},
                  [memorySettlement, pullSettlement] = await Promise.allSettled([
                      exploreMemoryHistory(memoryArgs),
                      explorePullRequestHistory(pullArgs)
                  ]),
                  memory       = projectSource('memory', memorySettlement),
                  pullRequests = projectSource('pull-requests', pullSettlement),
                  slots        = [memory, pullRequests],
                  allUnavailable = slots.every(slot => slot.state === 'unavailable'),
                  anyImperfect   = slots.some(slot => slot.state !== 'available');

            // This is visit state, not a read receipt: the rendered window advances the soft fallback;
            // only the explicit write below advances `lastSeen`.
            if (generation === state.readGeneration) {
                state.lastVisitAt           = requestedWindow.windowEnd;
                state.lastRenderedWindowEnd = requestedWindow.windowEnd
            }

            return {
                capability: {
                    state     : allUnavailable ? 'unavailable' : anyImperfect ? 'degraded' : 'wired',
                    capturedAt: requestedWindow.windowEnd
                },
                needsFirstUseWindow: false,
                partition,
                viewerState        : {lastSeen: state.lastSeen, lastVisitAt: state.lastVisitAt},
                window             : {
                    ...requestedWindow,
                    semantics: 'half-open'
                },
                sources: {memory, pullRequests}
            }
        },

        /**
         * @summary Advance the viewer's runtime-only lastSeen through the exact latest rendered end.
         * @param {Object} params
         * @returns {Promise<Object>}
         */
        async markCaughtUp({windowEnd} = {}) {
            const viewer  = await resolveViewer(),
                  state   = getState(viewer),
                  nowMs   = toMs(now(), 'now'),
                  markMs  = toMs(windowEnd, 'windowEnd'),
                  markIso = new Date(markMs).toISOString();

            if (!state.lastRenderedWindowEnd || markIso !== state.lastRenderedWindowEnd) {
                return {status: 'rejected', reason: 'window-not-latest-rendered'}
            }

            if (markMs > nowMs) {
                return {status: 'rejected', reason: 'future-window'}
            }

            if (state.lastSeen && markMs <= Date.parse(state.lastSeen)) {
                return {status: 'rejected', reason: 'non-monotonic-window'}
            }

            state.lastSeen = markIso;

            return {
                status     : 'advanced',
                lastSeen   : state.lastSeen,
                lastVisitAt: state.lastVisitAt
            }
        }
    }
}

export default createFleetCatchUpSource;
