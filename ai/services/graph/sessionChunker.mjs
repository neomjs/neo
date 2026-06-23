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
 * fully unit-testable. The estimator is a conservative char-based heuristic (no model call), which keeps
 * boundaries reproducible across runs; the integration MAY inject the guardrail's own estimator for parity.
 *
 * @module ai/services/graph/sessionChunker
 */

/**
 * ~3 characters per token — the conservative dense REM / Agent OS heuristic. Deterministic by construction
 * (no model round-trip), which is what makes chunk boundaries reproducible.
 * @type {Number}
 */
const DEFAULT_TOKENS_PER_CHAR = 1 / 3;

/**
 * @summary Coarse, deterministic token estimate (`ceil(chars × ratio)`).
 *
 * Intentionally NOT a model tokenizer: a pure char-based estimate is reproducible, so two runs over the same
 * session produce identical chunk boundaries (the determinism AC). Non-string input estimates to `0`.
 *
 * @param {String} text
 * @param {Number} [tokensPerChar=1/3]
 * @returns {Number} Estimated token count.
 */
export function estimateTokens(text, tokensPerChar = DEFAULT_TOKENS_PER_CHAR) {
    return typeof text === 'string' ? Math.ceil(text.length * tokensPerChar) : 0;
}

/**
 * @summary Split turn-aligned session content into deterministic, safe-band-bounded chunks.
 *
 * **Greedy left-to-right packing:** a chunk accretes whole turns until the next turn would push the *emitted*
 * (separator-joined) chunk text over `safeProcessingLimitTokens`, then a new chunk opens. Bounds are measured on
 * the joined text — never the bare per-turn sum — so a chunk's `estimatedTokens` always equals
 * `estimateTokens(chunk.text)` and never under-counts the `\n` join separators. Turns are NEVER split mid-turn —
 * boundaries are turn-aligned. A single turn that alone exceeds the limit becomes its own chunk flagged
 * `oversizedTurn: true` (kept intact, not split); the integration routes those through the guardrail/failure path.
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
    const SEP         = '\n',
          safeTurns   = Array.isArray(turns) ? turns : [],
          limit       = Number.isFinite(safeProcessingLimitTokens) && safeProcessingLimitTokens > 0 ? safeProcessingLimitTokens : Infinity,
          turnTexts   = safeTurns.map(turn => typeof turn === 'string' ? turn : ''),
          fullText    = turnTexts.join(SEP),
          totalTokens = estimate(fullText);

    // Small-session fast path: the whole joined document fits → single-pass behavior preserved.
    if (totalTokens <= limit) {
        return {
            chunked             : false,
            totalEstimatedTokens: totalTokens,
            chunks              : [{
                chunkId        : `${sessionId}:chunk:0`,
                turnIndices    : turnTexts.map((_, index) => index),
                text           : fullText,
                estimatedTokens: totalTokens,
                oversizedTurn  : false
            }]
        };
    }

    const chunks  = [];
    let   current = null; // {turnIndices, parts, oversizedTurn}

    // Bounds are measured on the EMITTED (separator-joined) text, so a chunk's reported estimatedTokens
    // always equals estimate(chunk.text) and can't under-count the `\n` join separators — a per-turn-sum
    // bound would report under-limit while the joined text estimates over.
    const flush = () => {
        if (!current) return;
        const text = current.parts.join(SEP);
        chunks.push({
            chunkId        : `${sessionId}:chunk:${chunks.length}`,
            turnIndices    : current.turnIndices,
            text,
            estimatedTokens: estimate(text),
            oversizedTurn  : current.oversizedTurn === true
        });
        current = null;
    };

    turnTexts.forEach((text, index) => {
        // A single turn whose own text exceeds the limit: keep it intact as its own flagged chunk
        // rather than splitting mid-turn. The integration routes oversized chunks to the guardrail/failure path.
        if (estimate(text) > limit) {
            flush();
            current = {turnIndices: [index], parts: [text], oversizedTurn: true};
            flush();
            return;
        }

        // Would adding this turn push the EMITTED chunk text (join separators included) over the limit? Seal and start fresh.
        if (current && estimate(current.parts.concat(text).join(SEP)) > limit) {
            flush();
        }
        if (!current) {
            current = {turnIndices: [], parts: [], oversizedTurn: false};
        }
        current.turnIndices.push(index);
        current.parts.push(text);
    });

    flush();

    return {chunked: true, totalEstimatedTokens: totalTokens, chunks};
}
