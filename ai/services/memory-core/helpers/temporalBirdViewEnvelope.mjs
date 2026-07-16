/**
 * @module ai/services/memory-core/helpers/temporalBirdViewEnvelope
 * @summary Assembles the structured, cite-backed, **non-authoritative** Bird View result for the
 * temporal-pyramid dynamic-synthesis path — the discipline layer that guarantees coverage never
 * masquerades as complete and a narrative is never claimed over incomplete or degraded retrieval.
 *
 * The synthesis path resolves a window, retrieves its source records, and (when coverage is complete)
 * synthesizes a narrative. This helper wraps that into one honest envelope: it stamps `notAuthority: true`,
 * hashes the exact source manifest for provenance, carries per-source citations for drill-down, and — the
 * load-bearing rule — **withholds the narrative whenever coverage is not provably complete**. A caller that
 * cannot prove it retrieved every resolved source (unknown total, truncation, or an excluded remainder) gets
 * a deterministic coverage report with `synthesisAvailable: false`, never a confident "what happened" over
 * a partial read. Nothing here is durable: the envelope is a query-time result, written nowhere.
 */

import {hashSourceManifest, projectDrillDown} from './birdViewCitations.mjs';

/**
 * @summary Coerces a `Date` / ISO-8601 string / epoch-ms number to finite epoch milliseconds, or `null`.
 * @param {Date|String|Number} value
 * @returns {Number|null}
 */
function toMs(value) {
    if (value instanceof Date)    return Number.isFinite(value.getTime()) ? value.getTime() : null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;

    return null
}

/**
 * @summary Builds the non-authoritative temporal Bird View envelope from a resolved window + retrieved sources.
 *
 * Completeness is proven, never assumed: an envelope is `synthesisAvailable: true` only when the caller
 * supplies a finite `coverage.totalResolved`, every resolved source was included (`excluded === 0`), nothing
 * was truncated, the caller did not flag `degraded`, AND a `narrative` exists. Any gap withholds the narrative
 * and records the exact `degradedReason` — the "no confident narrative without complete coverage" contract.
 *
 * @param {Object} options
 * @param {Object} options.window The resolved half-open window (from `resolveTemporalWindow`).
 * @param {Object[]} [options.sources=[]] Retrieved source records. `id` is required; adapters may add an explicit
 *   scalar `revision` / `manifestKey` for content-sensitive manifest identity and a structured `drillDown` target.
 * @param {String} [options.narrative=null] The synthesized "what happened" text — used ONLY when coverage is complete.
 * @param {Object} [options.coverage={}] `{totalResolved?, truncated?, degraded?, degradedReason?}` from retrieval.
 *   Source-specific evidence fields are preserved, while canonical completeness fields are always recomputed.
 * @param {String[]} [options.inferenceInputIds] The ids the synthesis actually enumerated. When supplied, the
 *   envelope marks each citation `inSynthesis` and reports `coverage.synthesisInputCount` — so a caller on a
 *   window larger than the prompt bounds sees which citations the narrative could actually have used, distinct
 *   from the chronological census. Omitted (degraded path / narrative-only synthesize) → citations are unmarked.
 * @param {Object} [options.synthesisDetails] Optional structured synthesis metadata. It is exposed only alongside
 *   an available synthesis; degraded / narrative-less results omit the field entirely.
 * @param {Date|String|Number} options.generatedAt Injected generation stamp (never read from a clock internally).
 * @returns {Object} The `notAuthority` Bird View envelope.
 */
export function buildTemporalBirdViewEnvelope({
    window, sources = [], narrative = null, coverage = {}, inferenceInputIds, synthesisDetails, generatedAt
} = {}) {
    const generatedMs = toMs(generatedAt);

    if (generatedMs === null) {
        throw new Error('buildTemporalBirdViewEnvelope: an injected `generatedAt` (Date / ISO-8601 / epoch-ms) is required')
    }

    if (!window || typeof window !== 'object') {
        throw new Error('buildTemporalBirdViewEnvelope: a resolved `window` is required')
    }

    const safeSources  = Array.isArray(sources) ? sources : [],
          safeCoverage = coverage && typeof coverage === 'object' && !Array.isArray(coverage) ? coverage : {},
          sourceIds    = safeSources.map(source => source?.id).filter(Boolean),
          included     = sourceIds.length,
          totalKnown   = Number.isFinite(safeCoverage.totalResolved),
          total        = totalKnown ? safeCoverage.totalResolved : included,
          excluded     = totalKnown ? Math.max(0, total - included) : 0,
          truncated    = safeCoverage.truncated === true,
          // completeness must be PROVEN: unknown total, truncation, an excluded remainder, or an explicit
          // degraded flag each block the narrative — coverage never masquerades as complete.
          incomplete = !totalKnown || truncated || excluded > 0 || safeCoverage.degraded === true,
          hasNarrative      = typeof narrative === 'string' && narrative.length > 0,
          synthesisAvailable = hasNarrative && !incomplete;

    // per-type counts (e.g. {session, memory}) so a caller sees the session/turn split, not just a total
    const sourceTypeCounts = {};
    for (const source of safeSources) {
        if (source?.id) sourceTypeCounts[source.type || 'unknown'] = (sourceTypeCounts[source.type || 'unknown'] || 0) + 1
    }

    // census-vs-inference: when the synthesis reports which sources it actually enumerated, the citations
    // carry `inSynthesis` and coverage exposes `synthesisInputCount` — so a caller on an over-bound window
    // never reads a citation the narrative could not have used. Absent the manifest, citations stay unmarked.
    const inferenceSet = Array.isArray(inferenceInputIds) ? new Set(inferenceInputIds) : null;

    let degradedReason = null;

    if (incomplete) {
        degradedReason = safeCoverage.degradedReason ||
            (!totalKnown ? 'coverage-unknown'   :
             truncated   ? 'source-truncated'   :
             excluded > 0 ? 'incomplete-inclusion' : 'flagged-degraded')
    }

    // Preserve adapter-owned evidence (for example `childEvidence` or `corpus`) without allowing stale or
    // caller-supplied canonical fields to override the envelope's completeness calculation.
    const sourceCoverage = {...safeCoverage};

    for (const key of [
        'totalResolved', 'included', 'excluded', 'truncated', 'sourceTypeCounts', 'synthesisInputCount',
        'degraded', 'degradedReason'
    ]) {
        delete sourceCoverage[key]
    }

    const hasStructuredSynthesisDetails = synthesisDetails &&
        typeof synthesisDetails === 'object' &&
        !Array.isArray(synthesisDetails);

    return {
        window,
        coverage: {
            ...sourceCoverage,
            totalResolved: total,
            included,
            excluded,
            truncated,
            sourceTypeCounts,
            ...(inferenceSet ? {synthesisInputCount: inferenceSet.size} : {}),
            degraded     : incomplete,
            degradedReason
        },
        sourceManifestHash: hashSourceManifest(safeSources),
        citations         : safeSources
            .filter(source => source?.id)
            .map(source => {
                const drillDown    = projectDrillDown(source.drillDown),
                      safeRevision = typeof source.revision === 'string' && source.revision.length <= 256 ||
                          typeof source.revision === 'number' && Number.isFinite(source.revision);

                return {
                    type: source.type || 'unknown',
                    id  : source.id,
                    ...(source.sessionId ? {sessionId: source.sessionId} : {}),
                    ...(source.ref ? {ref: source.ref} : {}),
                    ...(safeRevision ? {revision: source.revision} : {}),
                    ...(drillDown ? {drillDown} : {}),
                    ...(inferenceSet ? {inSynthesis: inferenceSet.has(source.id)} : {})
                }
            }),
        synthesis                 : synthesisAvailable ? narrative : null,
        ...(synthesisAvailable && hasStructuredSynthesisDetails ? {synthesisDetails: {...synthesisDetails}} : {}),
        synthesisAvailable,
        synthesisUnavailableReason: synthesisAvailable ? null : (incomplete ? 'coverage-incomplete' : 'no-narrative'),
        generatedAt               : new Date(generatedMs).toISOString(),
        notAuthority              : true
    }
}
