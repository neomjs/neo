import {enumerateChronologicalWindowSources} from './chronologicalWindowSources.mjs';
import {makeRecentTurnsFetchPage}            from './recentTurnsFetchPage.mjs';
import {makeSemanticEnrichment}              from './semanticEnrichment.mjs';
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
 * @returns {Promise<Object>} The `notAuthority` Bird View envelope.
 */
export async function exploreMemoryHistory({
    partition = 'unified', preset, windowStart, windowEnd, now, generatedAt,
    enrichmentQuery = DEFAULT_ENRICHMENT_QUERY, deps
} = {}) {
    const {queryRecentTurns, queryMemories, generate, listIdentities} = deps || {};

    if (typeof queryRecentTurns !== 'function' || typeof queryMemories !== 'function' ||
        typeof generate !== 'function' || typeof listIdentities !== 'function') {
        throw new Error('exploreMemoryHistory: deps must supply queryRecentTurns, queryMemories, generate, and listIdentities')
    }

    const fetchPage         = makeRecentTurnsFetchPage({queryRecentTurns}),
          enrich            = makeSemanticEnrichment({queryMemories}),
          generateNarrative = makeTemporalSynthesize({generate});

    // the recency spine is the coverage backbone; identities resolve at retrieve time so `unified` walks
    // the live roster while `@<identity>` walks exactly one.
    const retrieve = async ({window}) => {
        const identities = window.partition === 'unified' ? await listIdentities() : [window.partition];

        return enumerateChronologicalWindowSources({window, identities, fetchPage})
    };

    // synthesis foregrounds themes (best-effort, never coverage) then runs the fidelity-bound generation
    const synthesize = async ({window, sources}) => {
        const {themes} = await enrich({query: enrichmentQuery});

        return generateNarrative({window, sources, themes})
    };

    return synthesizeTemporalBirdView({partition, preset, windowStart, windowEnd, now, generatedAt, retrieve, synthesize})
}
