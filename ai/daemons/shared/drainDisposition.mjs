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
 * Group a segment's JSONL by **`metadata.agentIdentity`**: it is the canonical grouping key,
 * `MemoryService.addMemory` deriving it from the request context's identity chain.
 *
 * **Do NOT group by `metadata.agent`.** It is a partial duplicate that `addMemory` stamps only when
 * the caller passes one — never disagreeing with `agentIdentity` where both exist, so it looks
 * authoritative on inspection while being silently absent on a large share of records. Grouping by
 * it erases whole seats and invents an "unattributed" remainder out of the records it simply never
 * carried. A field that is *sometimes* populated produces a plausible table with named rows and
 * believable percentages — the failure mode is a confident answer, not an obvious gap.
 *
 * **Keep an explicit unattributed bucket even so.** `agentIdentity` is itself optional — `addMemory`
 * stamps it only when a canonical identity resolves from the request context — so a robust grouping
 * must bucket records that lack it rather than drop them. On a well-formed corpus that bucket is
 * empty, but a consumer that assumes 100% attribution turns a future unstamped record into a silent
 * omission. Absence must be *visible*, which is this whole receipt's thesis applied to attribution.
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
 * **The three readings, and none of them is optional:** plane volume over the window · the per-seat
 * split by `metadata.agentIdentity` (with its unattributed bucket) · and the disposition `state`
 * sampled across the window — a plane ever `unobserved` has an unmeasured gap, not a quiet one, and
 * a `dirty` sample at the window's close means `getDisposition().counts.outstanding` records had not
 * drained. (Concrete per-seat counts for a given day live in this PR's evidence, not here — a dated
 * corpus snapshot rots as durable module prose.)
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
export function createDrainDispositionTracker({historyLimit = 256, now = Date.now} = {}) {
    // The earliest instant this tracker could attest to anything. A lookback reaching further back
    // than this is asking about a period the tracker did not exist for, and the only honest answer
    // is "partial" — a process restart makes that the DAILY case, not an edge one.
    const coverageStartedAt = now();

    // `evictedThrough` is the newest cycle timestamp the ring has dropped, null while nothing has
    // been evicted — the second boundary a lookback can fail to clear.
    let state          = 'unobserved',
        reason         = 'no-drain-cycle-completed-yet',
        counts         = null,
        at             = null,
        inProgress     = null,
        evictedThrough = null,
        lastFailureAt  = null;

    // Completed cycles, oldest first. The receipt above is a LAST-VALUE LATCH and cannot answer a
    // windowed question: an idle poll overwrites a work-bearing cycle that is still inside a
    // consumer's lookback, so "latest says pending 0" and "no work happened in the window" are
    // different propositions. A consumer aggregating provider activity over `sinceTs` needs the
    // cycles that fall in the SAME window, which is what this retains.
    const history = [];

    return {
        /**
         * @summary Publishes the work a cycle SELECTED, before it completes.
         *
         * Without this, a cycle that has selected items and is waiting on the provider is invisible:
         * the tracker cannot speak until the provider call returns, so the exact interval a load
         * observer most needs to interpret reads as "no work". In-progress is cleared by the
         * completion or failure that follows it.
         * @param {Object} [data]
         * @param {Number} [data.selected] Items admitted into this cycle.
         * @param {Number} [data.pending] Items pending when the cycle began.
         */
        recordCycleStart({pending, selected} = {}) {
            inProgress = {
                pendingAtStart: Number.isFinite(pending)  ? pending  : null,
                selectedCount : Number.isFinite(selected) ? selected : null,
                startedAt     : now()
            }
        },

        /**
         * @summary Aggregates the completed cycles inside a consumer's lookback.
         *
         * `truncated` is not decoration: the ring is bounded, so a lookback older than the oldest
         * retained cycle is a PARTIAL answer, and a partial answer reported as a total is the same
         * false-zero this module exists to prevent.
         * @param {Number} sinceTs Lower bound, epoch ms.
         * @returns {Object}
         */
        getWindowSince(sinceTs) {
            const inWindow = history.filter(entry => entry.at >= sinceTs),
                  totals   = {embedded: 0, failed: 0, pending: 0, selected: 0};

            for (const {counts: c} of inWindow) {
                totals.embedded += Number(c?.embedded)  || 0;
                totals.failed   += Number(c?.failed)    || 0;
                totals.pending  += Number(c?.pending)   || 0;
                totals.selected += Number(c?.selected)  || 0
            }

            return {
                coverageStartedAt,
                cycles          : inWindow.length,
                oldestRetainedAt: history.length ? history[0].at : null,
                totals,
                // Coverage, NOT capacity. A full ring is one way to lose the head of a lookback;
                // never having observed it is the other, and keying only off `historyLimit` saw
                // just the first — so a fresh tracker answered "nothing happened, completely" for
                // a window it could not see at all.
                truncated       : sinceTs < coverageStartedAt ||
                                  (evictedThrough !== null && sinceTs <= evictedThrough) ||
                                  (lastFailureAt  !== null && lastFailureAt >= sinceTs)
            }
        },

        /**
         * @summary The work the currently-running cycle selected, or null when none is running.
         * @returns {Object|null}
         */
        getInProgress() {
            return inProgress && {...inProgress}
        },

        /**
         * @summary Records a completed cycle. Cleanliness is read from ONE producer-declared field,
         * `summary.outstanding`, never re-derived here from producer-specific counts.
         *
         * The two loops name their fields differently and — the trap this replaced — both report a
         * PRE-drain observation (`pending` / `observed`) that is NOT work-left: a cycle that reads one
         * pending record and embeds it emits `{pending: 1, embedded: 1}`, whose residue is zero. Any
         * arithmetic here that treated `pending` as outstanding reported that fully-drained cycle as
         * `dirty`, and continuous traffic never let it go `clean`. So each drain cycle now computes
         * its own post-cycle residue in its own vocabulary (embed: `pending - embedded - compensated`;
         * message: `observed - drained`) and declares it as `outstanding`; the tracker only records
         * the verdict, crossing the real producer→consumer boundary instead of guessing across it.
         * @param {Object} summary The loop's per-cycle summary; `outstanding` is the residue field.
         */
        recordCycle(summary = {}) {
            counts     = {...summary};
            at         = now();
            inProgress = null;

            history.push({at, counts: {...summary}});

            if (history.length > historyLimit) {
                // Remember WHAT was dropped, not just that the ring is full: the dropped cycle's
                // timestamp is the boundary a later lookback must be told it cannot cross.
                evictedThrough = history.shift().at
            }

            if (summary.inactive) {
                state  = 'inactive';
                reason = 'no-replay-processor-wired';
                return
            }

            const {outstanding} = summary;

            // Fail closed, never to `clean`: a summary that does not declare its residue cannot be
            // graded, so it is `unobserved` (the "no readable verdict" class), not silently drained.
            // This is the invariant — cleanliness must be asserted by the producer, never assumed.
            if (!Number.isFinite(outstanding)) {
                state  = 'unobserved';
                reason = 'summary-missing-outstanding';
                return
            }

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
            state      = 'unobserved';
            reason     = `drain-cycle-failed: ${error?.message ?? error ?? 'unknown'}`;
            counts     = null;
            at         = now();
            inProgress = null;

            // The third way to lose coverage, and the one that survived two repairs. A cycle can
            // START, reach the provider — durably, on the activity ledger — and then throw during
            // post-add verification, pending re-read, marker append or prune; `startDrainLoop` routes
            // every such throw here. It never becomes a completed history entry, so the window used
            // to aggregate right past the hole and still report `truncated: false`: provider activity
            // of 1 against window totals of 0, advertised as a complete denominator.
            //
            // Its counts are unknowable — that is what "failed" means — so it is deliberately NOT a
            // history entry. Only the newest timestamp is kept: the question a lookback asks is
            // "did any failure land at or after `sinceTs`", and the newest answers it for every
            // `sinceTs` without an unbounded list.
            lastFailureAt = at
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
