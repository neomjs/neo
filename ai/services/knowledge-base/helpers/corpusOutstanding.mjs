/**
 * @module ai/services/knowledge-base/helpers/corpusOutstanding
 * @summary Pure decisions for cumulative corpus settlement — how many accepted chunks are settled,
 * how many remain, and the movement stamp a consumer needs to judge whether that remainder is moving.
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
 * An unmeasurable backlog MUST NOT render as `0`. A zero means "every accepted chunk is settled"; an
 * unknown means "nobody established the tuple". Collapsing them recreates the empty-is-not-success defect
 * one layer up. `observable: false` carries null counts and its own state rather than a reassuring number.
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
 * | state          | settled | remaining / outstanding | observable |
 * |----------------|---------|-------------------------|------------|
 * | `complete`     | `>= 0`  | `0`                     | `true`     |
 * | `outstanding`  | `>= 0`  | `> 0`                   | `true`     |
 * | `unobservable` | `null`  | `null`                  | `false`    |
 *
 * @type {Object}
 */
export const OUTSTANDING_STATE = Object.freeze({
    complete    : 'complete',
    outstanding : 'outstanding',
    unobservable: 'unobservable'
});

/**
 * @summary Validates one exact partition of an accepted corpus into settled and remaining chunks.
 *
 * This is the consumed boundary between Vector and Ingestion. Safe integers are required because these
 * values persist into operator state; exact equality is required because either under- or over-crediting
 * changes whether a repo is retried. Missing legacy fields and malformed present fields are distinguished
 * by the caller — this helper answers only whether a present tuple is coherent.
 *
 * @param {Object} options
 * @param {Number} options.accepted Accepted unique embeddable chunks in this group.
 * @param {Number} options.settled Chunks requiring no provider work on an identical next sweep.
 * @param {Number} options.remaining Chunks still requiring provider work on an identical next sweep.
 * @returns {{settled: Number, remaining: Number}|null}
 */
export function normalizeSettlementCounts({accepted, settled, remaining} = {}) {
    if (![accepted, settled, remaining].every(value => Number.isSafeInteger(value) && value >= 0)) {
        return null
    }

    return settled + remaining === accepted ? {settled, remaining} : null
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
 * @param {Number|null} options.settled Cumulative settled count.
 * @param {Number|null} options.remaining Authoritative remaining count.
 * @param {Number}      options.observedAt  Epoch ms for this observation — passed in, never read from a
 *     clock here, so the decision stays pure and testable.
 * @param {Object|null} [options.previous]  The previously persisted observation, if any.
 * @returns {{state: String, settled: Number|null, remaining: Number|null, outstanding: Number|null,
 *     observable: Boolean, lastDecreasedAt: Number|null, observedAt: Number|null}}
 */
export function describeCorpusOutstanding({settled, remaining, observedAt, previous = null} = {}) {
    if (!Number.isFinite(observedAt)) {
        // Without a timestamp there is no movement axis at all, so the observation cannot be composed even
        // if the count itself is sound. Reported as unobservable rather than dated with a substitute clock.
        return {
            state          : OUTSTANDING_STATE.unobservable,
            settled        : null,
            remaining      : null,
            outstanding    : null,
            observable     : false,
            lastDecreasedAt: null,
            observedAt     : null
        };
    }

    if (!Number.isSafeInteger(settled) || settled < 0
        || !Number.isSafeInteger(remaining) || remaining < 0) {
        return {
            state      : OUTSTANDING_STATE.unobservable,
            settled    : null,
            remaining  : null,
            outstanding: null,
            observable : false,
            // The previous movement stamp survives an unobservable reading. Losing it would let a single
            // failed measurement reset a six-hour-stalled backlog's clock to "just moved".
            lastDecreasedAt: Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : null,
            observedAt
        };
    }

    const
        previousRemaining = Number.isSafeInteger(previous?.remaining)
            ? previous.remaining
            : (Number.isSafeInteger(previous?.outstanding) ? previous.outstanding : null),
        decreased       = previousRemaining === null || remaining < previousRemaining,
        lastDecreasedAt = decreased
            ? observedAt
            : (Number.isFinite(previous?.lastDecreasedAt) ? previous.lastDecreasedAt : observedAt);

    return {
        state     : remaining === 0 ? OUTSTANDING_STATE.complete : OUTSTANDING_STATE.outstanding,
        settled,
        remaining,
        // Backward-compatible operator field. New writers keep it byte-equal to the authoritative
        // remaining count; old persisted observations are rejected by the checkpoint normalizer.
        outstanding: remaining,
        observable : true,
        lastDecreasedAt,
        observedAt
    };
}
