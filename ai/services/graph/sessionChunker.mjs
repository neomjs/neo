/**
 * @summary Deterministic, turn-aligned session chunker for hierarchical Tri-Vector extraction.
 *
 * Sub 7 of the REM-pipeline epic (Orchestrator-as-SSOT). `SemanticGraphExtractor.executeTriVectorExtraction`
 * runs a single LLM pass over the whole `session.document`; when that payload exceeds the local model's
 * `safeProcessingLimitTokens` band, the consumer-friction guardrail skips invocation and extraction yields
 * `null` — large sessions are lost. This module is the **chunking primitive** that the map→reduce integration
 * wraps: it splits a session into bounded, turn-aligned chunks so each chunk stays under the safe band.
 *
 * Pure by design — no I/O, no LLM round-trip, no graph mutation — so chunk boundaries are deterministic and
 * fully unit-testable. The estimator is a coarse char-based heuristic (no model call), which keeps boundaries
 * reproducible across runs; the integration MAY inject the guardrail's own estimator for parity.
 *
 * @module ai/services/graph/sessionChunker
 */

/**
 * ~4 characters per token — the standard coarse heuristic. Deterministic by construction (no model round-trip),
 * which is what makes chunk boundaries reproducible.
 * @type {Number}
 */
const DEFAULT_TOKENS_PER_CHAR = 0.25;

/**
 * @summary Coarse, deterministic token estimate (`ceil(chars × ratio)`).
 *
 * Intentionally NOT a model tokenizer: a pure char-based estimate is reproducible, so two runs over the same
 * session produce identical chunk boundaries (the determinism AC). Non-string input estimates to `0`.
 *
 * @param {String} text
 * @param {Number} [tokensPerChar=0.25]
 * @returns {Number} Estimated token count.
 */
export function estimateTokens(text, tokensPerChar = DEFAULT_TOKENS_PER_CHAR) {
    return typeof text === 'string' ? Math.ceil(text.length * tokensPerChar) : 0;
}

/**
 * @summary Split turn-aligned session content into deterministic, safe-band-bounded chunks.
 *
 * **Greedy left-to-right packing:** a chunk accretes whole turns until the next turn would push it over
 * `safeProcessingLimitTokens`, then a new chunk opens. Turns are NEVER split mid-turn — boundaries are
 * turn-aligned. A single turn that alone exceeds the limit becomes its own chunk flagged `oversizedTurn: true`
 * (kept intact, not split); the integration routes those through the existing guardrail/failure path.
 *
 * **Small-session fast path:** when the whole session estimates at or below the limit, a single chunk is
 * returned with `chunked: false`, so the caller preserves the current single-pass behavior unchanged.
 *
 * Chunk ids are `<sessionId>:chunk:<N>`, zero-indexed and monotonic; each chunk carries `turnIndices` for
 * source-coverage traceability.
 *
 * @param {String[]} turns Turn-aligned content units (already segmented by the caller).
 * @param {Object} options
 * @param {String} options.sessionId Source session id — chunk ids derive from it.
 * @param {Number} options.safeProcessingLimitTokens Per-chunk token ceiling (non-positive / non-finite → no chunking).
 * @param {Function} [options.estimate=estimateTokens] Token estimator `(text) => Number`; injectable for guardrail parity.
 * @returns {{chunked: Boolean, totalEstimatedTokens: Number, chunks: Array<{chunkId: String, turnIndices: Number[], text: String, estimatedTokens: Number, oversizedTurn: Boolean}>}}
 */
export function chunkSession(turns, {sessionId, safeProcessingLimitTokens, estimate = estimateTokens} = {}) {
    const safeTurns   = Array.isArray(turns) ? turns : [],
          limit       = Number.isFinite(safeProcessingLimitTokens) && safeProcessingLimitTokens > 0 ? safeProcessingLimitTokens : Infinity,
          turnTexts   = safeTurns.map(turn => typeof turn === 'string' ? turn : ''),
          turnTokens  = turnTexts.map(text => estimate(text)),
          totalTokens = turnTokens.reduce((sum, t) => sum + t, 0);

    // Small-session fast path: single chunk, single-pass behavior preserved.
    if (totalTokens <= limit) {
        return {
            chunked             : false,
            totalEstimatedTokens: totalTokens,
            chunks              : [{
                chunkId        : `${sessionId}:chunk:0`,
                turnIndices    : turnTexts.map((_, index) => index),
                text           : turnTexts.join('\n'),
                estimatedTokens: totalTokens,
                oversizedTurn  : false
            }]
        };
    }

    const chunks  = [];
    let   current = null; // {turnIndices, parts, tokens, oversizedTurn}

    const flush = () => {
        if (!current) return;
        chunks.push({
            chunkId        : `${sessionId}:chunk:${chunks.length}`,
            turnIndices    : current.turnIndices,
            text           : current.parts.join('\n'),
            estimatedTokens: current.tokens,
            oversizedTurn  : current.oversizedTurn === true
        });
        current = null;
    };

    turnTexts.forEach((text, index) => {
        const tokens = turnTokens[index];

        // A single turn larger than the whole limit: keep it intact as its own flagged chunk
        // rather than splitting mid-turn. The integration routes oversized chunks to the guardrail/failure path.
        if (tokens > limit) {
            flush();
            current = {turnIndices: [index], parts: [text], tokens, oversizedTurn: true};
            flush();
            return;
        }

        // Adding this turn would overflow the open chunk → seal it and start fresh.
        if (current && current.tokens + tokens > limit) {
            flush();
        }
        if (!current) {
            current = {turnIndices: [], parts: [], tokens: 0, oversizedTurn: false};
        }
        current.turnIndices.push(index);
        current.parts.push(text);
        current.tokens += tokens;
    });

    flush();

    return {chunked: true, totalEstimatedTokens: totalTokens, chunks};
}
