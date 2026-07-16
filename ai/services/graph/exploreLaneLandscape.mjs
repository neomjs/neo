import {buildLaneLandscape}          from './laneLandscapeProjection.mjs';
import {makeLaneLandscapeSynthesize} from './laneLandscapeSynthesis.mjs';

/**
 * @module ai/services/graph/exploreLaneLandscape
 * @summary The composition keystone behind the `explore_lane_landscape` current-state Bird View:
 * census reads → current-state projection → optional cited synthesis → one `notAuthority` envelope.
 *
 * Every impure edge is injected (the graph reads and the LLM call bind at the MCP registration
 * boundary), so the whole composition is hermetic. It answers "what IS the lane landscape right now",
 * which is why it carries no window: a `capturedAt` stamp is the honest key for a current-state
 * answer, where a `[windowStart, windowEnd)` would assert a bound the answer never had.
 *
 * The honest-absence firewall is the point of this file:
 * - a **degraded census** withholds the narrative entirely — a partial structure narrated confidently
 *   is worse than no narrative, and the LLM leg is skipped rather than paid for and discarded;
 * - an **inference failure** degrades only the narrative: the deterministic census/coverage evidence
 *   survives and synthesis is marked unavailable with its reason, never silently blank;
 * - nothing above L2 is written — the injectable deps are reads and one inference call, so no durable
 *   cascade is even constructible here.
 */

/**
 * @summary Explores the current-state lane landscape on demand.
 * @param {Object}   params
 * @param {Date}     params.now Capture time (injected).
 * @param {*}        [params.generatedAt] Envelope stamp; defaults to `now`.
 * @param {Object}   params.deps
 * @param {Function} params.deps.queryOpenWorkCensus `async () => {items, manifest}` — the source-owned
 *   census walk, whose manifest proves (or refuses to claim) the census is complete.
 * @param {Function} params.deps.queryRelationEdges `async () => {edges, manifest}` — the RLS-safe
 *   PARENT_OF/BLOCKS read.
 * @param {Function} params.deps.generate The LLM call — `async ({prompt}) => string | {content}`.
 * @returns {Promise<Object>} A frozen `notAuthority` landscape envelope.
 * @throws {Error} When a dep is missing — an unbound source is a wiring bug, not a runtime degradation.
 */
export async function exploreLaneLandscape({now, generatedAt, deps} = {}) {
    const {queryOpenWorkCensus, queryRelationEdges, generate} = deps || {};

    if (typeof queryOpenWorkCensus !== 'function' || typeof queryRelationEdges !== 'function' ||
        typeof generate !== 'function') {
        throw new Error('exploreLaneLandscape: deps must supply queryOpenWorkCensus, queryRelationEdges, and generate')
    }

    if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number') {
        throw new Error('exploreLaneLandscape: a `now` capture time is required for the envelope')
    }

    const landscape = await buildLaneLandscape({queryOpenWorkCensus, queryRelationEdges, now}),
          stamp     = generatedAt !== undefined ? generatedAt : landscape.capturedAt;

    let narrative         = null,
        inferenceInputIds = [],
        available         = false,
        unavailableReason = null;

    if (landscape.coverage.degraded) {
        // Honest absence: an incomplete census cannot be narrated into a confident picture, so the
        // inference leg is skipped entirely rather than run and thrown away.
        unavailableReason = 'coverage-degraded'
    } else {
        try {
            const result = await makeLaneLandscapeSynthesize({generate})({landscape});

            narrative         = result.narrative;
            inferenceInputIds = result.inferenceInputIds;
            available         = true
        } catch (error) {
            // The narrative degrades alone — the census/coverage evidence below is deterministic and
            // still true, so it is preserved rather than discarded with the failed inference.
            unavailableReason = `synthesis-failed: ${error instanceof Error ? error.message : String(error)}`
        }
    }

    // Mark which citations the narrative could actually have drawn on. The census is broader than the
    // prompt — an item with no epic, blocker, or ownership gap is cited but never enumerated — so a
    // caller auditing the narrative needs the two sets distinguished rather than conflated.
    const inferenceIdSet = new Set(inferenceInputIds),
          citations      = landscape.citations.map(citation => Object.freeze({
              ...citation,
              inSynthesis: available && inferenceIdSet.has(citation.id)
          }));

    return Object.freeze({
        schemaVersion     : 'lane-landscape.v1',
        capturedAt        : landscape.capturedAt,
        generatedAt       : typeof stamp === 'string' ? stamp : new Date(stamp).toISOString(),
        goalTrajectory    : landscape.goalTrajectory,
        dependencyPath    : landscape.dependencyPath,
        authorityCoverage : landscape.authorityCoverage,
        coverage          : landscape.coverage,
        citations         : Object.freeze(citations),
        sourceManifestHash: landscape.sourceManifestHash,

        synthesis: Object.freeze({
            available,
            narrative,
            unavailableReason,
            inferenceInputIds: Object.freeze(inferenceInputIds)
        }),

        notAuthority: true
    })
}
