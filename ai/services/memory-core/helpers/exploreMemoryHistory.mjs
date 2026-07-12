import {enumerateChronologicalWindowSources} from './chronologicalWindowSources.mjs';
import {makeRecentTurnsFetchPage}            from './recentTurnsFetchPage.mjs';
import {makeSemanticEnrichment}              from './semanticEnrichment.mjs';
import {makeSessionSummaryReader}            from './sessionSummaryReader.mjs';
import {makeTemporalSynthesize}              from './temporalSynthesis.mjs';
import {synthesizeTemporalBirdView}          from './temporalBirdViewSynthesizer.mjs';

/**
 * @module ai/services/memory-core/helpers/exploreMemoryHistory
 * @summary The Memory/session temporal Bird View composition — wires the resolved window through the
 * chronological completeness spine, best-effort semantic enrichment, and cited synthesis into one honest
 * `notAuthority` envelope. This is the logic behind the `explore_memory_history` runtime operation, kept
 * separate from its MCP-server registration so the whole path is dependency-injected and hermetically
 * testable.
 *
 * All Memory Core / inference touchpoints are injected via `deps` (`queryRecentTurns`, `queryMemories`,
 * `generate`, `listIdentities`), so this composes the eight tested primitives without reaching for a global.
 * Coverage is the recency spine's alone; enrichment only foregrounds themes; the envelope withholds the
 * narrative on any coverage gap. The `unified` partition walks the full identity roster and cross-agent
 * de-duplicates; an `@<identity>` partition walks exactly that identity.
 */

const DEFAULT_ENRICHMENT_QUERY = 'notable engineering decisions, friction, and outcomes';

/**
 * @summary Runs one `explore_memory_history` synthesis and returns the non-authoritative Bird View envelope.
 *
 * @param {Object} options
 * @param {String} [options.partition='unified'] `'unified'` or a canonical `'@<identity>'`.
 * @param {String} [options.preset] A grain preset (mutually exclusive with an explicit window).
 * @param {Date|String|Number} [options.windowStart] Explicit inclusive start.
 * @param {Date|String|Number} [options.windowEnd]   Explicit exclusive end.
 * @param {Date|String|Number} [options.now] Injected reference clock (required for a preset).
 * @param {Date|String|Number} [options.generatedAt] Injected generation stamp; defaults to `now`.
 * @param {String} [options.enrichmentQuery] Semantic theme query (best-effort).
 * @param {Object} options.deps Injected Memory Core / inference touchpoints.
 * @param {Function} options.deps.queryRecentTurns Bound `queryRecentTurns` (the recency spine source).
 * @param {Function} options.deps.queryMemories   Bound `queryMemories` (semantic enrichment).
 * @param {Function} options.deps.generate         The LLM `generate` call.
 * @param {Function} options.deps.listIdentities   `async () => string[]` — the roster walked for `unified`.
 * @param {Function} options.deps.listSummaries    Bound `listSummaries` — the team-visible session-summary coverage leg.
 * @returns {Promise<Object>} The `notAuthority` Bird View envelope.
 */
export async function exploreMemoryHistory({
    partition = 'unified', preset, windowStart, windowEnd, now, generatedAt,
    enrichmentQuery = DEFAULT_ENRICHMENT_QUERY, deps
} = {}) {
    const {queryRecentTurns, queryMemories, generate, listIdentities, listSummaries} = deps || {};

    if (typeof queryRecentTurns !== 'function' || typeof queryMemories !== 'function' ||
        typeof generate !== 'function' || typeof listIdentities !== 'function' ||
        typeof listSummaries !== 'function') {
        throw new Error('exploreMemoryHistory: deps must supply queryRecentTurns, queryMemories, generate, listIdentities, and listSummaries')
    }

    const fetchPage           = makeRecentTurnsFetchPage({queryRecentTurns}),
          fetchWindowSessions = makeSessionSummaryReader({listSummaries}),
          enrich              = makeSemanticEnrichment({queryMemories}),
          generateNarrative   = makeTemporalSynthesize({generate});

    // Coverage has TWO legs: the tenant-scoped recency walk (the caller's own turns) AND the team-visible
    // session-summary leg (the peer sessions the recency walk structurally cannot see — query_recent_turns
    // is userId-bound). Merged + deduped by id; a failure in EITHER leg degrades coverage honestly, so the
    // narrative is withheld rather than served partial.
    const retrieve = async ({window}) => {
        const identities = window.partition === 'unified' ? await listIdentities() : [window.partition],
              turnResult = await enumerateChronologicalWindowSources({window, identities, fetchPage}),
              summaries  = await fetchWindowSessions({windowStart: window.windowStart, windowEnd: window.windowEnd, partition: window.partition});

        const byId = new Map(turnResult.sources.map(source => [source.id, source]));
        for (const source of summaries.sources) if (!byId.has(source.id)) byId.set(source.id, source);
        const sources = [...byId.values()];

        return {
            sources,
            coverage: {
                ...turnResult.coverage,
                totalResolved : sources.length,
                degraded      : turnResult.coverage.degraded || summaries.degraded,
                degradedReason: turnResult.coverage.degradedReason || (summaries.degraded ? summaries.reason : null)
            }
        }
    };

    // synthesis foregrounds themes (best-effort, never coverage) then runs the fidelity-bound generation
    const synthesize = async ({window, sources}) => {
        // enrichment is window-bound to the resolved window so a relevance-ranked theme cannot leak in
        // from outside [windowStart, windowEnd) and fabricate a narrative this window was never about.
        const {themes} = await enrich({query: enrichmentQuery, windowStart: window.windowStart, windowEnd: window.windowEnd});

        return generateNarrative({window, sources, themes})
    };

    return synthesizeTemporalBirdView({partition, preset, windowStart, windowEnd, now, generatedAt, retrieve, synthesize})
}
