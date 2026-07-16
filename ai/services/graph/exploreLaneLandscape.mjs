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
 * @param {Function} params.deps.queryOpenIssueNodes `async () => nodeRows` — the open-work census read.
 * @param {Function} params.deps.queryRelationEdges `async () => edgeRows` — the PARENT_OF/BLOCKS read.
 * @param {Function} params.deps.generate The LLM call — `async ({prompt}) => string | {content}`.
 * @returns {Promise<Object>} A frozen `notAuthority` landscape envelope.
 * @throws {Error} When a dep is missing — an unbound source is a wiring bug, not a runtime degradation.
 */
export async function exploreLaneLandscape({now, generatedAt, deps} = {}) {
    const {queryOpenIssueNodes, queryRelationEdges, generate} = deps || {};

    if (typeof queryOpenIssueNodes !== 'function' || typeof queryRelationEdges !== 'function' ||
        typeof generate !== 'function') {
        throw new Error('exploreLaneLandscape: deps must supply queryOpenIssueNodes, queryRelationEdges, and generate')
    }

    if (!(now instanceof Date) && typeof now !== 'string' && typeof now !== 'number') {
        throw new Error('exploreLaneLandscape: a `now` capture time is required for the envelope')
    }

    const landscape = await buildLaneLandscape({queryOpenIssueNodes, queryRelationEdges, now}),
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

    return Object.freeze({
        schemaVersion    : 'lane-landscape.v1',
        capturedAt       : landscape.capturedAt,
        generatedAt      : typeof stamp === 'string' ? stamp : new Date(stamp).toISOString(),
        goalTrajectory   : landscape.goalTrajectory,
        dependencyPath   : landscape.dependencyPath,
        authorityCoverage: landscape.authorityCoverage,
        coverage         : landscape.coverage,

        synthesis: Object.freeze({
            available,
            narrative,
            unavailableReason,
            inferenceInputIds: Object.freeze(inferenceInputIds)
        }),

        notAuthority: true
    })
}
