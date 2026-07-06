import {
    createTemporalSummaryDocId,
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
