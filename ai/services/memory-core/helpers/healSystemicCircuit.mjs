/**
 * @module ai/services/memory-core/helpers/healSystemicCircuit
 * @summary Pure cross-collection circuit-breaker for the autonomous data-recovery actuator — the SYSTEMIC
 * safety layer above `decideHealAction`'s per-(action,collection) anti-thrash. When a SHARED dependency (the
 * embedder) goes down, every collection's re-embed heal fails independently; the per-collection gate cannot
 * see the correlation, so N collections each retry within their own bounds — a mass-heal storm hammering a
 * dead embedder. This decider recognizes that pattern as ONE fault: >= `systemicThreshold` DISTINCT collections
 * failing with an embedder-outage signature inside `windowMs` trips the circuit OPEN, suppressing ALL heals
 * until a cooldown lets a single half-open probe test recovery. It reads the failure evidence the heal-event
 * ledger already records (`status: 'failed'` + `detail`); it is a SIBLING of `decideHealAction`, not an
 * extension — the per-collection contract stays pure and untouched. No operator, no escalate: an open circuit
 * is a recorded, self-clearing suppression, never a page.
 */

/**
 * The embedder / shared-dependency OUTAGE signature: case-insensitive substrings in a failure `detail` that
 * mark a SHARED-dependency outage (the embedder/network is down) rather than a data-specific per-collection
 * error. Cross-collection correlation on THIS signature is what distinguishes a systemic fault (one dead
 * dependency hitting many collections) from N unrelated isolated failures. Kept focused on transport/endpoint
 * outage signals — a too-broad signature trips the breaker on unrelated failures (false-positive suppression);
 * a too-narrow one misses the storm. Tunable as the observed failure corpus grows.
 * @type {String[]}
 */
export const EMBEDDER_OUTAGE_SIGNATURE = Object.freeze([
    'econnrefused', 'connection refused', 'enotfound', 'eai_again', 'etimedout', 'timeout',
    'socket hang up', 'fetch failed', 'network', '502', '503', '504', 'service unavailable',
    '429', '404' // the embedder returns 404 in one outage mode (a missing/unready endpoint)
]);

/**
 * Default circuit bounds: >= 3 DISTINCT collections failing with the outage signature inside a 10-minute
 * detection window trips the circuit; an open circuit suppresses for 10 minutes, then allows one half-open
 * probe. The window/cooldown mirror `DEFAULT_DISPATCH_BOUNDS` so the systemic and per-collection layers share
 * a time-scale.
 * @type {{systemicThreshold: Number, windowMs: Number, openDurationMs: Number}}
 */
export const DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS = Object.freeze({systemicThreshold: 3, windowMs: 600000, openDurationMs: 600000});

/**
 * @summary Whether a failure `detail` carries the shared-dependency OUTAGE signature (vs a data-specific
 * per-collection error). Case-insensitive substring match against `EMBEDDER_OUTAGE_SIGNATURE`. A non-string
 * detail never matches — it carries no transport signal to correlate on.
 * @param {String} detail The heal-event failure detail (`outcomeRecord.detail` / the ledger `detail`).
 * @returns {Boolean}
 */
export function isEmbedderOutageFailure(detail) {
    if (typeof detail !== 'string' || detail.length === 0) {
        return false;
    }
    const haystack = detail.toLowerCase();
    return EMBEDDER_OUTAGE_SIGNATURE.some(pattern => haystack.includes(pattern));
}

/**
 * @summary Decides whether the systemic circuit-breaker should SUPPRESS heals right now — the cross-collection
 * layer above the per-collection anti-thrash.
 *
 * The decision folds two inputs the caller derives from the heal-event ledger: the current circuit state
 * (`circuitOpenedAt` — the epoch of the last unmatched circuit-open event, or nullish if closed) and the recent
 * FAILED heal runs (`recentFailures`). State machine:
 *  - **open + within `openDurationMs`** -> `circuit-open` (suppress): a detected systemic fault is being ridden out.
 *  - **open + cooldown elapsed** -> `half-open-probe` (do NOT suppress): allow exactly one heal to test recovery;
 *    the caller records its outcome (success -> a circuit-close event; failure -> a fresh circuit-open), so the
 *    next fold either closes or re-opens. Assumes the actuator dispatches probes sequentially.
 *  - **closed + >= `systemicThreshold` DISTINCT collections failing with the outage signature in `windowMs`** ->
 *    `tripped` (suppress): the caller records a circuit-open at `now`.
 *  - **closed otherwise** -> `closed` (proceed).
 *
 * Indeterminate input (non-finite `now`/bounds) does NOT suppress (`indeterminate`): the breaker is a SECONDARY
 * gate, and the primary per-collection `decideHealAction` already fails CLOSED on a bad clock — the breaker must
 * not spuriously fire on un-evaluable input and block all healing.
 *
 * @param {Object} options
 * @param {Object[]} [options.recentFailures=[]] Recent FAILED heal runs `[{collection, at, detail}]` (epoch ms).
 * @param {Number} [options.circuitOpenedAt] Epoch ms of the current open circuit (the last unmatched circuit-open
 *   event from the ledger fold); nullish/non-finite => the circuit is closed.
 * @param {Number} [options.now] Epoch ms (the injected clock).
 * @param {{systemicThreshold: Number, windowMs: Number, openDurationMs: Number}} [options.bounds=DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS]
 * @returns {Object} `{open, status, reason, distinctFailingCollections?}`. `status ∈ {indeterminate, closed,
 *   tripped, circuit-open, half-open-probe}`; `open` is the should-suppress flag.
 */
export function decideSystemicCircuit({recentFailures = [], circuitOpenedAt, now, bounds = DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS} = {}) {
    const {systemicThreshold, windowMs, openDurationMs} = {...DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS, ...(bounds && typeof bounds === 'object' ? bounds : {})};

    // Indeterminate input -> do NOT suppress; defer to the per-collection gate's own fail-closed.
    if (!Number.isFinite(now) || ![systemicThreshold, windowMs, openDurationMs].every(Number.isFinite)) {
        return {open: false, status: 'indeterminate', reason: 'non-finite clock or bounds — deferring to the per-collection gate'};
    }

    // CIRCUIT OPEN: ride out the suppression window, then allow exactly one half-open probe.
    if (Number.isFinite(circuitOpenedAt)) {
        const elapsed = now - circuitOpenedAt;
        if (elapsed < openDurationMs) {
            return {open: true, status: 'circuit-open', reason: `circuit opened ${elapsed}ms ago (< ${openDurationMs}ms) — suppressing the heal storm`};
        }
        return {open: false, status: 'half-open-probe', reason: `circuit open ${elapsed}ms (>= ${openDurationMs}ms cooldown) — half-open, allow one recovery probe`};
    }

    // CIRCUIT CLOSED: trip iff enough DISTINCT collections are failing with the shared-outage signature in-window.
    const failing = new Set(
        (Array.isArray(recentFailures) ? recentFailures : [])
            .filter(run => run && typeof run === 'object' &&
                Number.isFinite(run.at) && now - run.at < windowMs &&
                typeof run.collection === 'string' && run.collection.length > 0 &&
                isEmbedderOutageFailure(run.detail))
            .map(run => run.collection)
    );

    if (failing.size >= systemicThreshold) {
        return {
            open                      : true,
            status                    : 'tripped',
            reason                    : `${failing.size} distinct collections failing with an embedder-outage signature in ${windowMs}ms (>= ${systemicThreshold}) — one systemic fault`,
            distinctFailingCollections: [...failing].sort()
        };
    }

    return {open: false, status: 'closed', reason: `${failing.size}/${systemicThreshold} distinct collections failing the outage signature — not systemic`};
}
