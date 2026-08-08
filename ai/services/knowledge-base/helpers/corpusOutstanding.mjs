/**
 * @module ai/services/knowledge-base/helpers/corpusOutstanding
 * @summary Pure decision for the corpus-outstanding observable — how many chunks of a corpus are known
 * but not yet embedded, and whether that backlog is converging or stuck. The number this answers with
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
 * States a corpus-outstanding observation can carry.
 *
 * `converging` and `stuck` both mean "there is a backlog"; they differ only in whether it has moved, which
 * is the question an operator staring at `count: 0` actually has.
 * @type {Object}
 */
export const OUTSTANDING_STATE = Object.freeze({
    complete    : 'complete',
    converging  : 'converging',
    stuck       : 'stuck',
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

    // Clamped at zero rather than allowed negative: a caller that over-reports `embedded` (a retry counted
    // twice, say) would otherwise produce a negative backlog, which reads as nonsense on a surface and would
    // sort below `complete` in any comparison. Clamping degrades toward "nothing outstanding", which is the
    // claim the numbers are closest to supporting.
    return Math.max(0, total - embedded - skipped);
}

/**
 * @summary Composes the durable corpus-outstanding observation, carrying forward when the backlog last moved.
 *
 * The staleness companion is deliberately "when did the outstanding set last DECREASE" rather than "when was
 * this last observed". Observation is cheap and frequent; movement is the signal. A backlog re-observed every
 * minute at the same depth for six hours is stuck, and a `lastObservedAt` that advances every minute would
 * describe it as fresh.
 *
 * @param {Object}      options
 * @param {Number|null} options.outstanding    Current outstanding count (from `deriveOutstanding`).
 * @param {Number}      options.observedAt     Epoch ms for this observation — passed in, never read from a
 *     clock here, so the decision stays pure and testable.
 * @param {Object|null} [options.previous]     The previously persisted observation, if any.
 * @param {Number}      [options.stuckThresholdMs] How long a non-decreasing backlog may sit before it is
 *     called `stuck`. Omitted → a backlog is `converging` regardless of age.
 * @returns {{state: String, outstanding: Number|null, observable: Boolean, lastDecreasedAt: Number|null,
 *     observedAt: Number, stuckThresholdMs: Number|null}}
 */
export function describeCorpusOutstanding({outstanding, observedAt, previous = null, stuckThresholdMs} = {}) {
    const hasThreshold = Number.isFinite(stuckThresholdMs) && stuckThresholdMs > 0,
          threshold    = hasThreshold ? stuckThresholdMs : null;

    if (!Number.isFinite(observedAt)) {
        // Without a timestamp there is no movement axis at all, so the observation cannot be composed even
        // if the count itself is sound. Reported as unobservable rather than dated with a substitute clock.
        return {
            state           : OUTSTANDING_STATE.unobservable,
            outstanding     : null,
            observable      : false,
            lastDecreasedAt : null,
            observedAt      : null,
            stuckThresholdMs: threshold
        };
    }

    if (!Number.isFinite(outstanding) || outstanding < 0) {
        return {
            state      : OUTSTANDING_STATE.unobservable,
            outstanding: null,
            observable : false,
            // The previous movement stamp survives an unobservable reading. Losing it would let a single
            // failed measurement reset a six-hour-stuck backlog's clock to "just moved".
            lastDecreasedAt : Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : null,
            observedAt,
            stuckThresholdMs: threshold
        };
    }

    const previousOutstanding = Number.isFinite(previous?.outstanding) ? previous.outstanding : null,
          decreased           = previousOutstanding === null || outstanding < previousOutstanding,
          lastDecreasedAt     = decreased
              ? observedAt
              : (Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : observedAt);

    let state;

    if (outstanding === 0) {
        state = OUTSTANDING_STATE.complete;
    } else if (threshold !== null && (observedAt - lastDecreasedAt) >= threshold) {
        state = OUTSTANDING_STATE.stuck;
    } else {
        state = OUTSTANDING_STATE.converging;
    }

    return {state, outstanding, observable: true, lastDecreasedAt, observedAt, stuckThresholdMs: threshold};
}
