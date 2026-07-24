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
 * ## Taking a `memory-wal` volume baseline
 *
 * The phase-5 pilot decides its write disposition — fork-then-replay versus dual-journal — on how
 * much is actually written over a period. That is a **measurement, not new instrumentation**:
 * everything needed is already durable on disk, and this receipt supplies the missing half.
 *
 * **The directory is shared, so its size is a PLANE number and never a seat number.** `memory-wal`
 * is absent from `DATA_SUBDIRS_BLOCKLIST` in `ai/scripts/migrations/bootstrapWorktree.mjs`, which
 * means hydration symlinks it: every hydrated seat's `memoryWal.dir` resolves to the **one**
 * canonical directory, deliberately, so records, embed markers and `.drain-lock` are shared for
 * cross-clone sole-drainer enforcement. Two seats sampling `du` therefore read **identical bytes**,
 * and neither reading is "that seat's volume". Nor can the files be split by seat: segments are
 * keyed by **day** (`wal-YYYY-MM-DD.jsonl`, plus `.embedded.jsonl` / `.graph.jsonl` marker
 * siblings — `SEGMENT_RE` in `ai/services/memory-core/helpers/memoryWalStore.mjs`), and every seat
 * appends into the same day file. **Directory size answers "what did the plane write"; it cannot be
 * disaggregated into seats at all.** The message WAL follows at `${memoryWal.dir}/messages`.
 *
 * **Per-seat volume comes from the records, not the files** — and from exactly one field.
 * Group a segment's JSONL by **`metadata.agentIdentity`**. Measured on `wal-2026-07-24.jsonl`:
 * present on **363 of 363 records**, every identity `@`-prefixed, no unattributed remainder.
 *
 * **Do NOT group by `metadata.agent`.** It is a partial duplicate — present on only 219 of those
 * 363 records, never disagreeing where both exist, so it looks authoritative on inspection while
 * being silently incomplete. Grouping by it **erases whole seats**: `@neo-fable` (81 records,
 * 14.8% of bytes) and `@neo-opus-vega` (24 records, 5.9%) vanish entirely, `@neo-fable-clio` reads
 * 32 records instead of 70, and the missing 29.7% presents as an "unattributed" bucket that does
 * not exist. A field that is *sometimes* populated produces a plausible table with named rows and
 * believable percentages — the failure mode is a confident answer, not an obvious gap.
 *
 * **Why the receipt is required to read any of it correctly.** Bytes measure what was *written*,
 * not what remains to be *replayed*. A plane writing heavily whose drain reports `clean` every
 * cycle carries no backlog — its volume is throughput, and replay is cheap. The same volume while
 * reporting `dirty` is accumulating, and the identical byte count then means something entirely
 * different for the replay decision. **Reading volume without the disposition is the same category
 * error this receipt exists to prevent**, one level up: a number that answers "how much was
 * written" when the question is "how much is outstanding".
 *
 * A `retentionLimit`-driven prune also removes drained segments, so a raw directory size understates
 * cumulative volume — count across the window rather than sampling the directory once at the end.
 *
 * **The four readings, and none of them is optional:** plane volume over the window · the per-seat
 * split by `metadata.agentIdentity` · the disposition `state` sampled across the window (a plane
 * that is ever `unobserved` has an unmeasured gap, not a quiet one) · and `counts.pending` at the
 * window's close.
 *
 * @see ai/daemons/embed/drainCycle.mjs                          memory WAL loop
 * @see ai/daemons/message/drainCycle.mjs                        message WAL loop
 * @see ai/services/memory-core/helpers/memoryWalStore.mjs       segment naming + enumeration
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
