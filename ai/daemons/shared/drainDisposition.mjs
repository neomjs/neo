/**
 * @module ai/daemons/shared/drainDisposition
 * @summary The drain receipt: what the last cycle actually did, in states a consumer cannot misread.
 *
 * Both WAL drain loops — `ai/daemons/embed/drainCycle.mjs` (memory) and
 * `ai/daemons/message/drainCycle.mjs` (message) — already compute a per-cycle summary, log it
 * conditionally, and then **discard it**. The loops return `{stop}` and nothing else, so nothing
 * downstream can answer "did this plane drain, and is it clean?" The counts existed; they were
 * thrown away one line after being produced.
 *
 * The parity pilot needs that answer as a receipt field: a seat's `memory-wal` disposition feeds the
 * fork-then-replay-vs-dual-journal decision, and the continuity-receipt vocabulary consumes it.
 *
 * **Four states, not two, and the distinction is the whole point.** A boolean `drainedClean` would
 * be the defect this substrate keeps producing — an absence of evidence wearing the words of
 * evidence. A loop that has not completed a cycle yet has NOT drained cleanly; it has not drained.
 * A loop whose last cycle threw has not drained cleanly either, and it must not keep reporting the
 * previous good summary as if nothing happened. And the message drain has a genuine `inactive`
 * state — no replay processor wired — which is neither clean nor failing.
 *
 *   - `clean`      — a cycle completed with nothing pending and nothing failed.
 *   - `dirty`      — a cycle completed with work outstanding or failures.
 *   - `inactive`   — the loop ran but is deliberately not draining (no processor wired).
 *   - `unobserved` — no cycle has completed, or the last one threw. **Never** collapse into `clean`.
 *
 * Pure and fully injectable (clock only) so the state machine is testable without timers or a WAL.
 *
 * @see ai/daemons/embed/drainCycle.mjs    memory WAL loop
 * @see ai/daemons/message/drainCycle.mjs  message WAL loop
 */

/**
 * @summary Creates a tracker that remembers the last cycle outcome and reports it as a receipt.
 *
 * @param {Object}   [options]
 * @param {Function} [options.now=Date.now] Injectable clock.
 * @returns {{recordCycle: Function, recordFailure: Function, getDisposition: Function}}
 */
export function createDrainDispositionTracker({now = Date.now} = {}) {
    let state  = 'unobserved',
        reason = 'no-drain-cycle-completed-yet',
        counts = null,
        at     = null;

    return {
        /**
         * @summary Records a completed cycle. `pending`/`failed` absent are treated as 0 — the two
         * loops report different count vocabularies, and a missing key means "this loop does not
         * track that", not "there is some".
         * @param {Object} summary The loop's per-cycle summary.
         */
        recordCycle(summary = {}) {
            counts = {...summary};
            at     = now();

            if (summary.inactive) {
                state  = 'inactive';
                reason = 'no-replay-processor-wired';
                return
            }

            // `drained`/`embedded` are progress, not cleanliness. Cleanliness is the ABSENCE of
            // outstanding work: nothing pending and nothing failed.
            const outstanding = (summary.pending ?? 0) + (summary.failed ?? 0) + (summary.deferred ?? 0);

            state  = outstanding === 0 ? 'clean' : 'dirty';
            reason = outstanding === 0 ? null : `outstanding=${outstanding}`
        },

        /**
         * @summary Records a cycle that threw. The previous good summary must NOT keep standing —
         * a consumer asking "is this plane clean?" after a failed cycle would otherwise read a
         * stale success.
         * @param {Error|String} error
         */
        recordFailure(error) {
            state  = 'unobserved';
            reason = `drain-cycle-failed: ${error?.message ?? error ?? 'unknown'}`;
            counts = null;
            at     = now()
        },

        /**
         * @summary The receipt.
         * @returns {{state: String, drainedClean: Boolean, reason: String|null, counts: Object|null, at: Number|null}}
         *          `drainedClean` is true ONLY for `clean` — `inactive` and `unobserved` are both
         *          false, because neither is a statement that the plane is drained.
         */
        getDisposition() {
            return {state, drainedClean: state === 'clean', reason, counts: counts && {...counts}, at}
        }
    }
}
