/**
 * @module ai/services/knowledge-base/helpers/adaptiveEmbeddingBatch
 * @summary Embeds a batch of texts, halving it whenever the provider times out.
 *
 * ## Why this exists
 *
 * **A retry that changes nothing cannot succeed.** Measured on a client plane 2026-08-11: one
 * ingestion batch exceeded a 30-minute provider deadline and was retried four more times at the
 * identical size — about two and a half hours of continuous work on a single-slot provider, for a
 * request that could never have completed. `maxRetries` was acting as a multiplier on a hopeless
 * call rather than as a recovery mechanism.
 *
 * **A timeout is evidence about SIZE.** It is the one error class that says "this request was too
 * big for this provider right now", so it is the one that justifies changing the request instead of
 * repeating it. Halving converges in `log2(batchSize)` steps and needs no knowledge of the
 * deployment's hardware — which is the point, because a fixed `batchSize` default cannot have any.
 * On the plane above a small embed took **150ms** while a 50-chunk batch exceeded thirty minutes;
 * no single configured number is right for both.
 *
 * Only timeouts halve. A credential, dimension or transport error says nothing about size, so
 * splitting on those would multiply calls while changing nothing — the same defect inverted.
 *
 * Work already paid for is never re-bought: each completed half's embeddings are retained, so a
 * later failure cannot charge for an earlier success.
 *
 * @see ai/services/knowledge-base/VectorService.mjs — the ingestion caller
 */

/**
 * True when an error is the provider reporting that the request outlived its deadline.
 *
 * Matched on the message because the providers surface deadlines as plain `Error`s rather than a
 * typed class. Deliberately narrow: `timed out` / `timeout` / `deadline`, and the abort name Node
 * raises for a signalled cancellation.
 * @param {Error} error
 * @returns {Boolean}
 */
export function isEmbeddingTimeout(error) {
    if (!error) {
        return false;
    }

    return error.name === 'AbortError' || /\b(timed out|timeout|deadline exceeded)\b/i.test(error.message || '');
}

/**
 * Embeds `texts`, halving the request on each provider timeout until it fits or a single text fails.
 *
 * @param {Object} params
 * @param {String[]} params.texts The batch to embed, in order.
 * @param {Function} params.embed `(texts) => Promise<Array>` — one provider call per invocation.
 * @param {Function} [params.onSplit] Reporter: `({attempted, next, depth})` when a timeout halves.
 * @returns {Promise<Array>} One embedding per input text, in input order.
 * @throws The provider's error when a SINGLE text still times out — at that point the batch is not
 * the problem and failing honestly beats looping.
 */
export async function embedWithAdaptiveBatch({texts, embed, onSplit = null}) {
    const embeddings = [];

    let cursor = 0,
        // Starts at the full batch: the happy path must be ONE provider call, never a pre-emptive
        // split. Shrinking only in response to a measured timeout is what keeps this free when the
        // configured size is already fine.
        size   = texts.length,
        depth  = 0;

    while (cursor < texts.length) {
        const slice = texts.slice(cursor, cursor + size);

        try {
            const result = await embed(slice);

            embeddings.push(...result);
            cursor += slice.length;
        } catch (error) {
            if (!isEmbeddingTimeout(error) || slice.length === 1) {
                // Either the error says nothing about size, or the batch is already one text. Both
                // mean halving cannot help, and retrying would only spend the provider again.
                throw error;
            }

            size = Math.floor(slice.length / 2);
            depth++;
            onSplit?.({attempted: slice.length, next: size, depth});
        }
    }

    return embeddings;
}
