/**
 * @summary Pure plan arithmetic for the concurrent OpenAI-compatible embedding dispatch.
 *
 * Three questions the dispatch loop must answer without holding any I/O: how the inputs divide into
 * provider requests, how many of those may be outstanding at once, and — after some subset of them
 * has completed in an arbitrary order — exactly how much work is durably carryable.
 *
 * Separated from the service because the third question is the one concurrency makes hard, and it was
 * previously answered by arithmetic (`completedChunkCount * chunkSize`) that only held while
 * completions arrived in order. Arithmetic over a sequential index is not a contract; a function with
 * its own fixtures is.
 *
 * @module ai/services/memory-core/helpers/embeddingDispatchPlan
 */

/**
 * @summary Divides an input count into the provider requests that will carry it.
 *
 * Spans rather than bare offsets, because only the final span may be short and every later decision
 * (carry width, failure attribution) needs the real count rather than a re-derivation of it. Deriving
 * it twice is how `count * width` came to stand in for a span in the first place.
 *
 * @param {Object} options
 * @param {Number} options.textCount Number of inputs to embed.
 * @param {Number} options.chunkSize Inputs per provider request; the durability contract's width.
 * @returns {Array<{offset: Number, count: Number}>} Spans in input order; empty when there is nothing to send.
 */
export function planEmbeddingSpans({textCount, chunkSize}) {
    const spans = [],
          width = Math.max(1, Math.floor(chunkSize));

    for (let offset = 0; offset < textCount; offset += width) {
        spans.push({offset, count: Math.min(width, textCount - offset)})
    }

    return spans
}

/**
 * @summary Resolves how many provider requests may be outstanding at once.
 *
 * Reads the declared parallelism as a CONCURRENCY, which is the one thing it was never used for: the
 * previous consumer spent it on request *width* (`parallel - 1`), reserving a slot the client cannot
 * actually hold open — the server assigns slots from its own queue, so sending fewer inputs does not
 * keep one free, it only guarantees one idles.
 *
 * Falls back to 1 rather than to the input count. An unreadable parallelism must not silently become
 * unbounded fan-out at a provider whose real width is unknown.
 *
 * @param {*} embeddingParallel Resolved `localModels.embedding.parallel`.
 * @returns {Number} A positive integer request concurrency.
 */
export function resolveEmbeddingConcurrency(embeddingParallel) {
    const declared = Number(embeddingParallel);

    return Number.isInteger(declared) && declared > 0 ? declared : 1
}

/**
 * @summary Measures the durably carryable prefix from an arbitrary set of completed spans.
 *
 * **Why a prefix and not the whole completed set.** The consumer binds carried vectors to inputs BY
 * POSITION (`batchToEmbed.slice(0, completedTextCount)`), and `toOrderedEmbeddings` refuses anything
 * that is not densely indexed from 0. So a sparse carry is not expressible without changing that
 * consumer contract; the longest contiguous prefix is the most work a caller can bind correctly.
 *
 * **Why `droppedChunkCount` is returned rather than ignored.** Under concurrency a span can complete
 * after a hole, and that work is unbindable and therefore lost. Reporting the count makes the loss
 * observable: silently discarding it is exactly the regression this function exists to prevent, in a
 * tidier shape. A caller that logs zero is asserting no loss, not hoping for none.
 *
 * @param {Object} options
 * @param {Array<{offset: Number, count: Number}>} options.spans Spans from {@link planEmbeddingSpans}.
 * @param {Boolean[]} options.completedFlags Parallel to `spans`; `true` where that span landed.
 * @returns {{chunkCount: Number, textCount: Number, droppedChunkCount: Number}} Carryable prefix, plus completed-but-unbindable spans.
 */
export function resolveCompletedPrefix({spans, completedFlags}) {
    let chunkCount = 0,
        textCount  = 0;

    while (chunkCount < spans.length && completedFlags[chunkCount] === true) {
        textCount += spans[chunkCount].count;
        chunkCount++
    }

    const completedTotal = completedFlags.reduce((sum, landed) => landed === true ? sum + 1 : sum, 0);

    return {chunkCount, textCount, droppedChunkCount: completedTotal - chunkCount}
}
