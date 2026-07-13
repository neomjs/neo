import {buildTemporalBirdViewEnvelope} from './temporalBirdViewEnvelope.mjs';
import {resolveTemporalWindow}         from './temporalWindowResolver.mjs';

/**
 * @module ai/services/memory-core/helpers/temporalBirdViewSynthesizer
 * @summary The composition core of the temporal-pyramid dynamic-synthesis path: resolve a window → retrieve
 * its sources → (only when coverage is provably complete) synthesize a narrative → wrap in the honest
 * `notAuthority` envelope.
 *
 * The two impure legs — source retrieval and narrative synthesis — are **injected** (`retrieve`, `synthesize`),
 * so this orchestrator is deterministic and hermetically testable while the real Memory Core / inference
 * adapters plug into the same seam. Two disciplines are enforced here rather than trusted to the callers:
 *
 * 1. **Fail-open synthesis.** A retrieval or synthesis error degrades *this one* Bird View (returns a
 *    coverage-bearing degraded envelope with the failure reason) — it never throws out of the synthesis. An
 *    invalid *window request* is the one exception: that is a caller error and propagates, because there is
 *    no honest window to report against.
 * 2. **No inference over incomplete coverage.** The LLM synthesis leg is skipped entirely when retrieval
 *    reports degraded/incomplete coverage — the envelope would withhold the narrative anyway, so a partial
 *    read must not incur (or pay for) a synthesis call.
 *
 * Nothing is written: the whole path is a query-time composition, per the no-durable-above-L2 contract.
 */

/**
 * @summary Extracts a safe message string from a thrown value.
 * @param {*} error
 * @returns {String}
 */
function errMsg(error) {
    return error instanceof Error ? error.message : String(error)
}

/**
 * @summary Runs one temporal Bird View synthesis over a resolved window using injected retrieval + synthesis.
 *
 * @param {Object} options
 * @param {String} [options.partition='unified'] Adapter-owned source partition key, or `'unified'`.
 * @param {String} [options.preset]      A grain preset (mutually exclusive with an explicit window).
 * @param {Date|String|Number} [options.windowStart] Explicit inclusive start.
 * @param {Date|String|Number} [options.windowEnd]   Explicit exclusive end.
 * @param {Date|String|Number} [options.now] Injected reference clock (required for a preset window; also the
 *   default generation stamp).
 * @param {Date|String|Number} [options.generatedAt] Injected generation stamp; defaults to `now`.
 * @param {Function} options.retrieve `async ({window}) => {sources: [{id, type?, ref?}], coverage: {...}}`.
 * @param {Function} options.synthesize `async ({window, sources}) => string | {narrative,
 *   inferenceInputIds?, synthesisDetails?}` (called ONLY on complete coverage).
 * @returns {Promise<Object>} The `notAuthority` Bird View envelope.
 */
export async function synthesizeTemporalBirdView({
    partition, preset, windowStart, windowEnd, now, generatedAt, retrieve, synthesize
} = {}) {
    if (typeof retrieve !== 'function') {
        throw new Error('synthesizeTemporalBirdView: an injected `retrieve` function is required')
    }

    if (typeof synthesize !== 'function') {
        throw new Error('synthesizeTemporalBirdView: an injected `synthesize` function is required')
    }

    // an invalid window request is a CALLER error (no honest window to report against) — it propagates
    const window = resolveTemporalWindow({partition, preset, windowStart, windowEnd, now}),
          stamp  = generatedAt !== undefined ? generatedAt : now;

    if (stamp === undefined) {
        throw new Error('synthesizeTemporalBirdView: a `generatedAt` or `now` stamp is required for the envelope')
    }

    // retrieval is fail-OPEN: a source-read failure degrades this synthesis, never throws out of it
    let sources, coverage;

    try {
        const retrieved = await retrieve({window});

        sources  = Array.isArray(retrieved?.sources) ? retrieved.sources : [];
        coverage = retrieved?.coverage && typeof retrieved.coverage === 'object' ? retrieved.coverage : {}
    } catch (error) {
        return buildTemporalBirdViewEnvelope({
            window,
            sources    : [],
            coverage   : {degraded: true, degradedReason: `retrieval-failed: ${errMsg(error)}`},
            generatedAt: stamp
        })
    }

    // only pay for LLM synthesis when coverage is provably complete — the envelope withholds the narrative
    // on any gap, so a degraded read must not incur a synthesis call. The provisional envelope is the single
    // authority for "is this coverage complete?".
    const provisional = buildTemporalBirdViewEnvelope({window, sources, coverage, generatedAt: stamp});

    if (provisional.coverage.degraded) {
        return provisional
    }

    let narrative, inferenceInputIds, synthesisDetails;

    try {
        // synthesize may return the bare narrative (legacy / test seam) OR a structured result. The manifest
        // separates inference inputs from the census; optional details remain query-time synthesis evidence.
        const synthResult = await synthesize({window, sources});

        narrative         = typeof synthResult === 'string' ? synthResult : synthResult?.narrative;
        inferenceInputIds = typeof synthResult === 'string' ? undefined   : synthResult?.inferenceInputIds;
        synthesisDetails  = typeof synthResult === 'string' ? undefined   : synthResult?.synthesisDetails
    } catch (error) {
        return buildTemporalBirdViewEnvelope({
            window,
            sources,
            coverage   : {...coverage, degraded: true, degradedReason: `synthesis-failed: ${errMsg(error)}`},
            generatedAt: stamp
        })
    }

    return buildTemporalBirdViewEnvelope({
        window, sources, coverage, narrative, inferenceInputIds, synthesisDetails, generatedAt: stamp
    })
}
