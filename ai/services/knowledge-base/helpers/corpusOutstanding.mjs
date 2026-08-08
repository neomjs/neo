/**
 * @module ai/services/knowledge-base/helpers/corpusOutstanding
 * @summary Pure decision for the corpus-outstanding observable — how many chunks of a corpus are known
 * but not yet embedded, plus the movement stamp a consumer needs to judge whether that backlog is moving.
 * It reports a state, never a trend. The number this answers with
 * already exists inside every ingest run (`VectorService` derives `chunksToProcess` from the parsed corpus
 * against the ids present in Chroma, and the lease-yield path logs the remainder) and is then discarded
 * when the run returns. THIS is the placement-independent decision; persisting the observation and putting
 * it on a surface is the caller's concern.
 *
 * ## Why the observable exists
 *
 * On a starved embedding provider a corpus reports `count: 0` for hours. That is indistinguishable, at the
 * surface, from a corpus at rest with nothing to do — and it is the difference between a deployment that is
 * dead and one that is visibly converging. This is deliberately NOT a queue depth: `VectorService` never
 * re-embeds a chunk already present in the corpus-scoped collection, so ingest is incremental by
 * construction and no pending queue exists to measure. A derived outstanding count replaces the depth, and
 * "when the outstanding set last decreased" replaces an oldest-pending age.
 *
 * ## Where this must NOT be consumed
 *
 * Not on `health.status`. `ai/mcp/server/knowledge-base/describeCollectionStats.mjs` settled that boundary
 * for exactly this family of observation: the MCP healthcheck accepts only `healthy`, and both ingress and
 * the orchestrator gate on `service_healthy`, so degrading a corpus that is merely behind stops a fresh
 * plane from booting at all. This reports; it never gates.
 *
 * ## The unknown/zero distinction is the whole safety property
 *
 * An unmeasurable backlog MUST NOT render as `0`. A zero means "every known chunk is embedded"; an unknown
 * means "nobody asked". Collapsing them recreates the empty-is-not-success defect one layer up — a caller
 * trusting a number that actually means nothing was observed. `observable: false` carries null counts and
 * its own state rather than a reassuring number.
 */

/**
 * The CLOSED state vocabulary a corpus-outstanding observation may carry.
 *
 * Deliberately three states, and deliberately NOT a motion claim. An earlier revision carried
 * `converging` / `stuck`, discriminated by an age threshold — but no production caller could supply a
 * semantically owned threshold, so `stuck` was unreachable and `converging` degraded to "positive count,
 * forever": a claim about movement made by something that never observed movement.
 *
 * `outstanding` is therefore neutral. Whether a backlog is converging or stalled is the CONSUMER's
 * question, answerable from `lastDecreasedAt` against `observedAt` — the honest companions, which do
 * carry motion. A producer that cannot see cadence must not name a trend.
 *
 * Each state has exactly one coherent tuple, enforced at both trust boundaries:
 *
 * | state          | outstanding | observable |
 * |----------------|-------------|------------|
 * | `complete`     | `0`         | `true`     |
 * | `outstanding`  | `> 0`       | `true`     |
 * | `unobservable` | `null`      | `false`    |
 *
 * @type {Object}
 */
export const OUTSTANDING_STATE = Object.freeze({
    complete    : 'complete',
    outstanding : 'outstanding',
    unobservable: 'unobservable'
});

/**
 * @summary Derives the outstanding-chunk count for a completed ingest run from the delta the run already had.
 *
 * Deliberately takes the run's own numbers rather than recomputing a delta: a second implementation of
 * "which chunks are missing" can disagree with the one that did the embedding, and a backlog figure that
 * disagrees with the embedder is worse than none. `total` is the post-delta work volume the run started with
 * (`chunksToProcess.length`), not the corpus size.
 *
 * A run that yields its lease mid-way leaves a real remainder; a run that completes leaves zero, because the
 * next sweep's delta is recomputed from scratch against Chroma.
 *
 * @param {Object}  options
 * @param {Number}  options.total     Chunks this run set out to embed (the post-delta work volume).
 * @param {Number}  options.embedded  Chunks this run durably embedded.
 * @param {Number} [options.skipped=0] Chunks the run deliberately declined (guardrail rejections) — these are
 *     NOT outstanding: nothing further will embed them, and counting them as backlog produces a figure that
 *     never reaches zero.
 * @returns {Number|null} Remaining chunks, or null when the inputs cannot support a count.
 */
export function deriveOutstanding({total, embedded, skipped = 0} = {}) {
    if (!Number.isFinite(total) || !Number.isFinite(embedded) || !Number.isFinite(skipped)) {
        return null;
    }

    if (total < 0 || embedded < 0 || skipped < 0) {
        return null;
    }

    // INCOHERENT INPUTS ARE UNMEASURABLE, NOT COMPLETE. An earlier revision clamped this with
    // `Math.max(0, …)` and justified it as "degrading toward the claim the numbers are closest to
    // supporting". That was wrong, and it built the exact defect this module exists to prevent: a run
    // reporting more embedded-plus-skipped than it ever accepted is a run whose numbers disagree with
    // themselves, and `0` would publish that as a FINISHED corpus. There is no reading of contradictory
    // arithmetic that supports "nothing left to do" — only "this cannot be trusted".
    if (embedded + skipped > total) {
        return null;
    }

    return total - embedded - skipped;
}

/**
* @summary Composes the durable corpus-outstanding observation, carrying forward when the backlog last moved.
 *
 * The staleness companion is deliberately "when did the outstanding set last DECREASE" rather than "when was
 * this last observed". Observation is cheap and frequent; movement is the signal. A backlog re-observed every
 * minute at the same depth for six hours has not moved, and a `lastObservedAt` that advances every minute
 * would describe it as fresh.
 *
 * **This function names a state, never a trend.** `lastDecreasedAt` and `observedAt` are published so a
 * consumer that knows the lane's cadence can decide whether a backlog is converging or stalled. Deciding
 * that here would require a threshold no producer on this path can own.
 *
 * @param {Object}      options
 * @param {Number|null} options.outstanding Current outstanding count (from `deriveOutstanding`).
 * @param {Number}      options.observedAt  Epoch ms for this observation — passed in, never read from a
 *     clock here, so the decision stays pure and testable.
 * @param {Object|null} [options.previous]  The previously persisted observation, if any.
 * @returns {{state: String, outstanding: Number|null, observable: Boolean, lastDecreasedAt: Number|null,
 *     observedAt: Number|null}}
 */
export function describeCorpusOutstanding({outstanding, observedAt, previous = null} = {}) {
    if (!Number.isFinite(observedAt)) {
        // Without a timestamp there is no movement axis at all, so the observation cannot be composed even
        // if the count itself is sound. Reported as unobservable rather than dated with a substitute clock.
        return {
            state          : OUTSTANDING_STATE.unobservable,
            outstanding    : null,
            observable     : false,
            lastDecreasedAt: null,
            observedAt     : null
        };
    }

    if (!Number.isFinite(outstanding) || outstanding < 0) {
        return {
            state      : OUTSTANDING_STATE.unobservable,
            outstanding: null,
            observable : false,
            // The previous movement stamp survives an unobservable reading. Losing it would let a single
            // failed measurement reset a six-hour-stalled backlog's clock to "just moved".
            lastDecreasedAt: Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : null,
            observedAt
        };
    }

    const previousOutstanding = Number.isFinite(previous?.outstanding) ? previous.outstanding : null,
          decreased           = previousOutstanding === null || outstanding < previousOutstanding,
          lastDecreasedAt     = decreased
              ? observedAt
              : (Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : observedAt);

    return {
        state     : outstanding === 0 ? OUTSTANDING_STATE.complete : OUTSTANDING_STATE.outstanding,
        outstanding,
        observable: true,
        lastDecreasedAt,
        observedAt
    };
}
