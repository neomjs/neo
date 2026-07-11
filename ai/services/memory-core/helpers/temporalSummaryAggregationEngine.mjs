import {
    createTemporalSummaryDocId,
    isValidPartition,
    UNIFIED_PARTITION,
    validateTemporalSummaryMetadata
} from '../../../graph/temporalSummarySchema.mjs';

/**
 * @module ai/services/memory-core/helpers/temporalSummaryAggregationEngine
 * @summary Pure aggregation engine for the temporal-pyramid durable tiers — L1 (session) / L2 (daily).
 * Folds a window's already-fetched source rows into the deterministic velocity fields and composes the
 * temporal-summary document (id + five-field metadata + payload) through the temporal-summary schema.
 *
 * No I/O lives here: the scheduled `TemporalSummaryAggregationService` owns the fetch (GitHub/git/Memory
 * Core reads) and the Chroma/graph upsert under the backpressure lease; this engine is the unit-tested
 * pure fold, mirroring the `kbGarbageCollectionEngine` split (the classification is pure + isolated, the
 * daemon owns the I/O). Prose is never a metric source — every field binds to a named substrate the
 * service reads. The per-direction breakdown (`{v, s, r}`) is a separate velocity leaf that extends this
 * fold on the same single writer — out of scope here.
 */

/**
 * @summary The deterministic velocity fields keyed to the named source substrate each binds to. The
 * service fetches from these substrates; the engine folds — the map is the contract that keeps prose out
 * of the numbers.
 * @type {Readonly<Object>}
 */
export const VELOCITY_FIELD_SOURCES = Object.freeze({
    mergedPrs         : 'GitHub PR sync — merged-PR graph nodes within the window',
    devCommits        : 'git first-parent log over the window on dev',
    sessionsPerAgent  : 'Memory Core session nodes, per-agent partition keys',
    highImpactSessions: 'Memory Core session impact metadata (impact >= 90)',
    adrsLanded        : 'landed architectural decision records (decisions dir / graph nodes)',
    sandboxesGraduated: 'Discussion graduation markers (GitHub Discussions sync)'
});

/**
 * @summary The velocity fields that are window-scoped facts rather than agent-attributable measurements: each
 * counts whole-repository activity across the window, so no share of it belongs to any single agent. They are
 * attributed ONLY on the unified track, and are `null` on every per-agent `'@<identity>'` partition by design.
 *
 * `null` — not `0`, and not the repeated window count — is the only honest value there:
 * - `0` would assert a measurement ("this agent contributed none") that was never taken.
 * - Repeating the window count on each track invites silent double-counting the moment a consumer aggregates
 *   across partitions — precisely the class of error a durable record must not seed.
 * - `null` carries the only safe upgrade path: should a field ever become agent-attributable, `null → measured`
 *   is additive for consumers that already skip null, whereas `repeated → measured` would silently change
 *   meaning underneath them.
 * @type {ReadonlyArray<String>}
 */
export const WINDOW_SCOPED_VELOCITY_FIELDS = Object.freeze([
    'mergedPrs', 'devCommits', 'adrsLanded', 'sandboxesGraduated'
]);

/**
 * @summary The session-impact floor for the `highImpactSessions` velocity field.
 * @type {Number}
 */
export const HIGH_IMPACT_THRESHOLD = 90;

/**
 * @summary The aggregation CONTRACT version stamped on every record this engine composes. It is NOT a per-cycle
 * counter: re-folding a window under the same contract keeps the version, so the deterministic doc id is stable
 * and re-aggregation overwrites in place (the settling-sources case). Bump this ONLY when the fold or source
 * contract changes materially — then new records mint under the next version while the prior version's records
 * stay queryable (append-only history), bounded by {@link versionsToPrune}.
 * @type {Number}
 */
export const TEMPORAL_AGGREGATION_VERSION = 1;

/**
 * @summary How many of the newest contract-versions the retention policy keeps per window+track; older versions
 * are prune-eligible. Bounds durable-tier growth so append-only version history cannot grow without limit.
 * @type {Number}
 */
export const DEFAULT_RETAINED_VERSIONS = 3;

/**
 * @summary Folds a window's fetched source rows into the six velocity fields. Pure + deterministic:
 * identical input → identical output; an absent or empty source folds to an honest `0` / `{}` (a window
 * with no merged PRs reports `mergedPrs: 0`, never a faked or omitted count).
 * A session is multi-agent: each row carries `agentIdentities` (every agent that participated). Both folds
 * respect that shape — `sessionsPerAgent` credits the session to each participant, while `highImpactSessions`
 * counts the SESSION once regardless of how many agents took part. Exploding one row per participant would
 * inflate the high-impact count by the size of the swarm.
 * @param {Object} [sources]
 * @param {Array}  [sources.mergedPrs=[]]          Merged-PR rows in the window.
 * @param {Array}  [sources.devCommits=[]]         `dev` first-parent commit rows in the window.
 * @param {Array}  [sources.sessions=[]]           Memory Core session rows (each carries `{agentIdentities, impact}`).
 * @param {Array}  [sources.adrsLanded=[]]         Decision-record rows landed in the window.
 * @param {Array}  [sources.sandboxesGraduated=[]] Discussion-graduation rows in the window.
 * @returns {{mergedPrs:Number, devCommits:Number, sessionsPerAgent:Object, highImpactSessions:Number, adrsLanded:Number, sandboxesGraduated:Number}}
 */
export function deriveVelocityFields({
    mergedPrs          = [],
    devCommits         = [],
    sessions           = [],
    adrsLanded         = [],
    sandboxesGraduated = []
} = {}) {
    const sessionsPerAgent = {};

    for (const session of sessions) {
        for (const agentIdentity of session?.agentIdentities || []) {
            if (agentIdentity) {
                sessionsPerAgent[agentIdentity] = (sessionsPerAgent[agentIdentity] || 0) + 1
            }
        }
    }

    // counts sessions, not (session, agent) pairs — a 3-agent high-impact session is one high-impact session
    const highImpactSessions = sessions.filter(session => Number(session?.impact) >= HIGH_IMPACT_THRESHOLD).length;

    return {
        mergedPrs         : mergedPrs.length,
        devCommits        : devCommits.length,
        adrsLanded        : adrsLanded.length,
        sandboxesGraduated: sandboxesGraduated.length,
        highImpactSessions,
        sessionsPerAgent
    }
}

/**
 * @summary Composes one temporal-summary document from window metadata + derived velocity fields. The
 * five-field metadata contract is validated fail-closed through the temporal-summary schema; the velocity
 * fields ride the document payload (the metadata rejects extras by construction, so they are never
 * smuggled into it). Idempotent: same window + track + version → the same id (re-aggregation overwrites
 * in place); a bumped `version` mints a new id (append-only history).
 * @param {Object} params
 * @param {String} params.level          `'session'` (L1) or `'daily'` (L2).
 * @param {String} params.partition      `'unified'` or a per-agent `'@<identity>'` track.
 * @param {String} params.windowStart    ISO 8601 UTC, strictly before `windowEnd`.
 * @param {String} params.windowEnd      ISO 8601 UTC.
 * @param {Number} params.version        Positive-integer material contract-version (same-version re-folds overwrite; a contract bump mints a new version).
 * @param {Object} params.velocityFields The {@link deriveVelocityFields} output.
 * @returns {{id:String, metadata:Object, velocityFields:Object}}
 */
export function buildTemporalSummaryDocument({level, partition, windowStart, windowEnd, version, velocityFields}) {
    const
        metadata        = {level, partition, windowStart, windowEnd, version},
        {valid, errors} = validateTemporalSummaryMetadata(metadata);

    if (!valid) {
        throw new Error(`buildTemporalSummaryDocument: invalid metadata — ${errors.join('; ')}`)
    }

    return {
        id      : createTemporalSummaryDocId(metadata),
        metadata,
        velocityFields
    }
}

/**
 * @summary Resolves the half-open UTC-day window for an L2 (daily) aggregation anchored at any instant in
 * the day: `windowStart` is the day's `00:00:00.000Z`, `windowEnd` is the next day's `00:00:00.000Z`. The
 * half-open `[start, end)` shape guarantees one instant never falls in two daily windows — the aggregation
 * lane fetches source rows in `[windowStart, windowEnd)` and folds them through {@link deriveVelocityFields}.
 * @param {String|Date} anchor An ISO 8601 timestamp string or Date within the target UTC day.
 * @returns {{windowStart:String, windowEnd:String}}
 */
export function resolveDailyWindow(anchor) {
    const anchorMs = anchor instanceof Date ? anchor.getTime() : Date.parse(anchor);

    if (Number.isNaN(anchorMs)) {
        throw new Error(`resolveDailyWindow: invalid anchor — ${JSON.stringify(anchor)}`)
    }

    const start = new Date(anchorMs);

    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start.getTime());

    end.setUTCDate(end.getUTCDate() + 1);

    return {windowStart: start.toISOString(), windowEnd: end.toISOString()}
}

/**
 * @summary Resolves the partition tracks a window aggregates into: the single `'unified'` track plus one
 * `'@<identity>'` track per distinct agent seen in the window. Deterministic + de-duped, `'unified'` always
 * first; blank or non-`'@'` identities are dropped (they are not valid partition keys). The service folds
 * each returned partition separately so per-agent future-self continuity and the unified view stay in step.
 * @param {String[]} [agentIdentities=[]] Canonical `'@<identity>'` ids observed in the window.
 * @returns {String[]} `['unified', ...sorted per-agent tracks]`.
 */
export function resolvePartitionKeys(agentIdentities = []) {
    const perAgentTracks = [...new Set(agentIdentities)]
        .filter(identity => typeof identity === 'string' && identity.startsWith('@') && identity.length > 1)
        .sort();

    return [UNIFIED_PARTITION, ...perAgentTracks]
}

/**
 * @summary Composes the unified-track record for one window — the whole-window fold (all sources) under
 * the `'unified'` partition. The unified track is always present (per-agent tracks are additive); the
 * service fetches the window's sources, calls this, and persists the returned record. Per-agent tracks are
 * composed by {@link composeAgentRecord}, which carries only the agent-attributable fields.
 * @param {Object} params
 * @param {String} params.level        `'session'` (L1) or `'daily'` (L2).
 * @param {String} params.windowStart  ISO 8601 UTC.
 * @param {String} params.windowEnd    ISO 8601 UTC.
 * @param {Number} [params.version=1]  Positive-integer material contract-version (same-version re-folds overwrite; a contract bump mints a new version).
 * @param {Object} [params.sources={}] The window's fetched source arrays ({@link deriveVelocityFields} shape).
 * @returns {{id:String, metadata:Object, velocityFields:Object}}
 */
export function composeUnifiedRecord({level, windowStart, windowEnd, version = TEMPORAL_AGGREGATION_VERSION, sources = {}}) {
    return buildTemporalSummaryDocument({
        level,
        partition     : UNIFIED_PARTITION,
        windowStart,
        windowEnd,
        version,
        velocityFields: deriveVelocityFields(sources)
    })
}

/**
 * @summary Folds a window's fetched source rows into the six velocity fields for ONE per-agent track. Session
 * rows are filtered to the sessions this agent participated in, so `sessionsPerAgent` / `highImpactSessions`
 * carry that agent's measurements alone — a co-participant's identity never leaks onto this track, even though
 * the same session also lands on theirs. Every {@link WINDOW_SCOPED_VELOCITY_FIELDS} entry is `null` (that
 * constant carries the reasoning). Fails closed on the unified track or a malformed identity — folding a
 * per-agent record under the wrong partition would silently mis-attribute the whole window.
 * @param {Object} params
 * @param {String} params.partition    A per-agent `'@<identity>'` track.
 * @param {Object} [params.sources={}] The window's fetched source arrays ({@link deriveVelocityFields} shape).
 * @returns {{mergedPrs:null, devCommits:null, adrsLanded:null, sandboxesGraduated:null, highImpactSessions:Number, sessionsPerAgent:Object}}
 */
export function deriveAgentVelocityFields({partition, sources = {}}) {
    if (partition === UNIFIED_PARTITION || !isValidPartition(partition)) {
        throw new Error(`deriveAgentVelocityFields: expected a per-agent '@<identity>' track — got ${JSON.stringify(partition)}`)
    }

    const
        agentSessions      = (sources.sessions || []).filter(session => (session?.agentIdentities || []).includes(partition)),
        highImpactSessions = agentSessions.filter(session => Number(session?.impact) >= HIGH_IMPACT_THRESHOLD).length,
        sessionsPerAgent   = agentSessions.length > 0 ? {[partition]: agentSessions.length} : {},
        windowScopedFields = Object.fromEntries(WINDOW_SCOPED_VELOCITY_FIELDS.map(field => [field, null]));

    return {...windowScopedFields, highImpactSessions, sessionsPerAgent}
}

/**
 * @summary Composes one per-agent track record for a window — the agent-attributable fold under the
 * `'@<identity>'` partition. The unified track ({@link composeUnifiedRecord}) owns the window facts; this
 * record carries only what is attributable to the agent, leaving the window-scoped fields `null`.
 * @param {Object} params
 * @param {String} params.level        `'session'` (L1) or `'daily'` (L2).
 * @param {String} params.partition    A per-agent `'@<identity>'` track.
 * @param {String} params.windowStart  ISO 8601 UTC.
 * @param {String} params.windowEnd    ISO 8601 UTC.
 * @param {Number} [params.version=1]  Positive-integer material contract-version (same-version re-folds overwrite; a contract bump mints a new version).
 * @param {Object} [params.sources={}] The window's fetched source arrays ({@link deriveVelocityFields} shape).
 * @returns {{id:String, metadata:Object, velocityFields:Object}}
 */
export function composeAgentRecord({level, partition, windowStart, windowEnd, version = TEMPORAL_AGGREGATION_VERSION, sources = {}}) {
    return buildTemporalSummaryDocument({
        level,
        partition,
        windowStart,
        windowEnd,
        version,
        velocityFields: deriveAgentVelocityFields({partition, sources})
    })
}

/**
 * @summary Plans the most-recent-first daily (L2) windows to aggregate: the UTC day containing `anchor`
 * plus the preceding `dayCount - 1` days. Bounded + deterministic — the lane plans a fixed trailing batch,
 * never an unbounded history scan; the service fetches each window's sources + folds them. The returned
 * windows are contiguous, non-overlapping, and ordered most-recent-first.
 * @param {Object}      params
 * @param {String|Date} params.anchor         Instant within the most-recent target day.
 * @param {Number}      [params.dayCount=7]   Trailing day count to plan (coerced to >= 1).
 * @returns {Array<{windowStart:String, windowEnd:String}>}
 */
export function planDailyWindows({anchor, dayCount = 7} = {}) {
    const
        count   = Number.isInteger(dayCount) && dayCount > 0 ? dayCount : 1,
        windows = [resolveDailyWindow(anchor)];

    for (let i = 1; i < count; i++) {
        // 1ms before the prior window's start lands in the previous UTC day
        const previousDayAnchor = new Date(Date.parse(windows[i - 1].windowStart) - 1);

        windows.push(resolveDailyWindow(previousDayAnchor))
    }

    return windows
}

/**
 * @summary Resolves the half-open UTC-hour window for an L1 (session) aggregation anchored at any instant in
 * the hour: `windowStart` is the hour's `:00:00.000Z`, `windowEnd` is the next hour's `:00:00.000Z`. L1 is the
 * session tier — `session` names the sub-daily granularity at which work sessions happen, NOT a per-session-id
 * key: the metadata contract keys every record (all levels) by `{windowStart, windowEnd}` with no session id,
 * and the document id embeds the window start, so L1 tiles the clock one unit finer than L2 rather than
 * tracking individual (overlapping, ragged) session spans. Hour-aligned tiling keeps the half-open
 * `[start, end)` non-overlap invariant — one instant never falls in two windows — so the window-scoped
 * velocity facts (`mergedPrs`, `devCommits`) land in exactly one L1 window and roll up into the containing L2
 * day without double-counting, the same single-attribution discipline the per-agent fold carries on the
 * partition axis.
 * @param {String|Date} anchor An ISO 8601 timestamp string or Date within the target UTC hour.
 * @returns {{windowStart:String, windowEnd:String}}
 */
export function resolveSessionWindow(anchor) {
    const anchorMs = anchor instanceof Date ? anchor.getTime() : Date.parse(anchor);

    if (Number.isNaN(anchorMs)) {
        throw new Error(`resolveSessionWindow: invalid anchor — ${JSON.stringify(anchor)}`)
    }

    const start = new Date(anchorMs);

    start.setUTCMinutes(0, 0, 0);

    const end = new Date(start.getTime());

    end.setUTCHours(end.getUTCHours() + 1);

    return {windowStart: start.toISOString(), windowEnd: end.toISOString()}
}

/**
 * @summary Plans the most-recent-first hourly (L1 session) windows to aggregate: the UTC hour containing
 * `anchor` plus the preceding `hourCount - 1` hours. Bounded + deterministic — the lane plans a fixed trailing
 * batch, never an unbounded history scan; the service fetches each window's sources + folds them. The returned
 * windows are contiguous, non-overlapping, and ordered most-recent-first. The default trailing batch is 24
 * hourly windows — a day's worth; every hour-aligned window nests within exactly one L2 {@link planDailyWindows}
 * day (it never straddles the UTC-day boundary), so the L1/L2 tiers stay coherent wherever the batch begins.
 * @param {Object}      params
 * @param {String|Date} params.anchor          Instant within the most-recent target hour.
 * @param {Number}      [params.hourCount=24]  Trailing hour count to plan (coerced to >= 1).
 * @returns {Array<{windowStart:String, windowEnd:String}>}
 */
export function planSessionWindows({anchor, hourCount = 24} = {}) {
    const
        count   = Number.isInteger(hourCount) && hourCount > 0 ? hourCount : 1,
        windows = [resolveSessionWindow(anchor)];

    for (let i = 1; i < count; i++) {
        // 1ms before the prior window's start lands in the previous UTC hour
        const previousHourAnchor = new Date(Date.parse(windows[i - 1].windowStart) - 1);

        windows.push(resolveSessionWindow(previousHourAnchor))
    }

    return windows
}

/**
 * @summary The append-only retention decision: given the versions currently persisted for ONE window+track,
 * returns the versions to prune — everything except the newest {@link DEFAULT_RETAINED_VERSIONS}. Pure +
 * deterministic; the service applies the delete. Retention is defined by COUNT (keep newest-N), so a sparse or
 * gapped version sequence still bounds cleanly. Non-integer / `< 1` versions are ignored (never valid record ids).
 * @param {Object}   params
 * @param {Number[]} [params.existingVersions=[]]                        Versions currently persisted for the window+track.
 * @param {Number}   [params.retainedVersions=DEFAULT_RETAINED_VERSIONS] Newest versions to keep (coerced to >= 1).
 * @returns {Number[]} The older overflow versions to delete (newest retained, the rest returned for pruning).
 */
export function versionsToPrune({existingVersions = [], retainedVersions = DEFAULT_RETAINED_VERSIONS} = {}) {
    const
        keep     = Number.isInteger(retainedVersions) && retainedVersions > 0 ? retainedVersions : 1,
        distinct = [...new Set(existingVersions)].filter(version => Number.isInteger(version) && version >= 1).sort((a, b) => b - a);

    return distinct.slice(keep)
}
