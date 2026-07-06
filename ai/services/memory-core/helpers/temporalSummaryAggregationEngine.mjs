import {
    createTemporalSummaryDocId,
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
 * @summary The session-impact floor for the `highImpactSessions` velocity field.
 * @type {Number}
 */
export const HIGH_IMPACT_THRESHOLD = 90;

/**
 * @summary Folds a window's fetched source rows into the six velocity fields. Pure + deterministic:
 * identical input → identical output; an absent or empty source folds to an honest `0` / `{}` (a window
 * with no merged PRs reports `mergedPrs: 0`, never a faked or omitted count).
 * @param {Object} [sources]
 * @param {Array}  [sources.mergedPrs=[]]          Merged-PR rows in the window.
 * @param {Array}  [sources.devCommits=[]]         `dev` first-parent commit rows in the window.
 * @param {Array}  [sources.sessions=[]]           Memory Core session rows (each carries `{agentIdentity, impact}`).
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
        const agentIdentity = session?.agentIdentity;

        if (agentIdentity) {
            sessionsPerAgent[agentIdentity] = (sessionsPerAgent[agentIdentity] || 0) + 1
        }
    }

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
 * @param {Number} params.version        Positive-integer append-only re-aggregation counter.
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
 * service fetches the window's sources, calls this, and persists the returned record. Per-agent track
 * composition is a separate step (its non-attributable-field semantics are still being pinned).
 * @param {Object} params
 * @param {String} params.level        `'session'` (L1) or `'daily'` (L2).
 * @param {String} params.windowStart  ISO 8601 UTC.
 * @param {String} params.windowEnd    ISO 8601 UTC.
 * @param {Number} [params.version=1]  Positive-integer append-only re-aggregation counter.
 * @param {Object} [params.sources={}] The window's fetched source arrays ({@link deriveVelocityFields} shape).
 * @returns {{id:String, metadata:Object, velocityFields:Object}}
 */
export function composeUnifiedRecord({level, windowStart, windowEnd, version = 1, sources = {}}) {
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
