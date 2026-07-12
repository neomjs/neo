import {partitionByProminence} from './citationProminence.mjs';

/**
 * @module ai/services/memory-core/helpers/temporalSynthesis
 * @summary Builds the "what happened in this window" synthesis prompt and adapts an injected LLM `generate`
 * into the `synthesize({window, sources, themes})` seam the Bird View orchestrator calls.
 *
 * Two fidelity rules are baked into the prompt, not left to the model's discretion: prominent sources
 * (high-impact sessions, accepted ADRs, named-marker PRs) are the ones the narrative must cite directly, and
 * the model may use ONLY the provided sources/themes — no invented events, no outside knowledge. The prompt
 * builder is pure (hermetically testable); the adapter wraps it with the injected `generate` so the model
 * call stays a seam. A generation that yields no narrative throws, so the orchestrator degrades the envelope
 * rather than returning an empty "what happened".
 */

const MAX_PROMINENT_CITED    = 40,
      MAX_CONTEXT_ENUMERATED = 60,
      MAX_THEMES             = 20;

/**
 * @summary Renders one source as a compact prompt line `- <type> <id>[: <title>]`.
 * @param {Object} source
 * @returns {String}
 */
function sourceLine(source) {
    const title = source.title || source.name || source.summary || '';

    return `- ${source.type || 'source'} ${source.id}${title ? `: ${title}` : ''}`
}

/**
 * @summary The bounded prominent + context slices that actually enter the synthesis prompt.
 *
 * The prompt cites prominent sources directly and enumerates context sources up to a bound; sources past the
 * bound are noted only as an overflow count — their facts never reach the model. This is the single place that
 * decides *what the synthesis actually saw*, so both the prompt renderer and the inference-input manifest
 * derive from it and can never drift apart.
 * @param {Object[]} [sources=[]]
 * @returns {{prominent: Object[], context: Object[], contextOverflow: Number}}
 */
function selectSynthesisSources(sources = []) {
    const {prominent, context} = partitionByProminence(sources);

    return {
        prominent      : prominent.slice(0, MAX_PROMINENT_CITED),
        context        : context.slice(0, MAX_CONTEXT_ENUMERATED),
        contextOverflow: Math.max(0, context.length - MAX_CONTEXT_ENUMERATED)
    }
}

/**
 * @summary The ids of the sources the synthesis actually enumerated in its prompt — its inference inputs.
 *
 * For a window whose source count fits the prompt bounds this equals the full chronological census; for a
 * larger window it is the bounded subset the narrative was built from. Exposing it lets the envelope
 * distinguish *inference inputs* from the census it also carries, so a caller never reads a citation the
 * narrative could not have used.
 * @param {Object[]} [sources=[]]
 * @returns {String[]}
 */
export function selectSynthesisInputIds(sources = []) {
    const {prominent, context} = selectSynthesisSources(sources);

    return [...prominent, ...context].map(source => source?.id).filter(Boolean)
}

/**
 * @summary Builds the temporal synthesis prompt from a resolved window, admitted sources, and theme evidence.
 *
 * The concise-narrative instruction foregrounds `prominent` sources (direct citation) and enumerates the
 * `context` sources' facts up to a bound — so the model sees what those turns were about rather than a bare
 * count it could cite past — noting any overflow. `themes` (best-effort semantic evidence) inform emphasis,
 * never coverage.
 *
 * @param {Object} options
 * @param {Object} options.window The resolved half-open window.
 * @param {Object[]} [options.sources=[]] The admitted window sources.
 * @param {Object[]} [options.themes=[]] Best-effort theme evidence (may be empty).
 * @returns {String} The synthesis prompt.
 */
export function buildTemporalSynthesisPrompt({window, sources = [], themes = []} = {}) {
    const {prominent, context, contextOverflow} = selectSynthesisSources(sources),
          citedThemes                           = (Array.isArray(themes) ? themes : []).slice(0, MAX_THEMES);

    const lines = [
        `You are summarizing what happened in one time window of an engineering team's activity.`,
        `Window: [${window?.windowStartIso ?? window?.windowStart}, ${window?.windowEndIso ?? window?.windowEnd}) — half-open, partition "${window?.partition ?? 'unified'}".`,
        ``,
        `PROMINENT sources — cite each you use directly by its id:`,
        ...(prominent.length ? prominent.map(sourceLine) : ['- (none)']),
        ``,
        `CONTEXT — further in-window sources; this is what those turns were about, so cite them by id where relevant:`,
        ...(context.length ? context.map(sourceLine) : ['- (none)']),
        ...(contextOverflow > 0 ? [`- …and ${contextOverflow} more in-window source(s), bounded for prompt size`] : []),
        ``,
        `THEME EVIDENCE (semantic, best-effort — may be incomplete):`,
        ...(citedThemes.length ? citedThemes.map(theme => `- ${theme.document || theme.text || theme.summary || theme.id}`) : ['- (none surfaced)']),
        ``,
        `Write a concise narrative of what happened in this window: the notable decisions, friction, and`,
        `outcomes. Cite prominent sources by id inline. Use ONLY the sources and themes above — do not invent`,
        `events and do not draw on outside knowledge. If the provided evidence is thin, say so plainly rather`,
        `than embellishing.`
    ];

    return lines.join('\n')
}

/**
 * @summary Builds a `synthesize({window, sources, themes})` closure over an injected LLM `generate`.
 *
 * The closure returns the narrative AND `inferenceInputIds` — the ids the prompt actually enumerated — so the
 * envelope can distinguish inference inputs from the chronological census on a window larger than the prompt
 * bounds. The narrative-only `string` shape stays valid for callers/tests that inject a bare `generate`.
 * @param {Object} options
 * @param {Function} options.generate The injected model call — `async ({prompt}) => string | {content: string}`.
 * @returns {Function} `async ({window, sources, themes}) => {narrative: String, inferenceInputIds: String[]}`.
 */
export function makeTemporalSynthesize({generate} = {}) {
    if (typeof generate !== 'function') {
        throw new Error('makeTemporalSynthesize: an injected `generate` function is required')
    }

    return async function synthesize({window, sources = [], themes = []} = {}) {
        const prompt    = buildTemporalSynthesisPrompt({window, sources, themes}),
              result    = await generate({prompt}),
              narrative = typeof result === 'string' ? result : result?.content;

        if (typeof narrative !== 'string' || narrative.length === 0) {
            throw new Error('temporal synthesis produced no narrative')
        }

        return {narrative, inferenceInputIds: selectSynthesisInputIds(sources)}
    }
}
