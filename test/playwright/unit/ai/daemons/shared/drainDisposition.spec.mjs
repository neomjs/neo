import {expect, test}                  from '@playwright/test';
import {createDrainDispositionTracker} from '../../../../../../ai/daemons/shared/drainDisposition.mjs';

/**
 * @summary Coverage for the drain receipt's state machine.
 *
 * The tracker exists because both WAL drain loops computed a per-cycle summary, logged it
 * conditionally, and discarded it — so nothing downstream could answer "did this plane drain, and
 * is it clean?". The parity pilot consumes that answer as a receipt field.
 *
 * Cleanliness is read from ONE producer-declared field, `summary.outstanding` — the post-cycle
 * residue each loop computes in its own vocabulary. These tests use that contract; the proof that
 * the REAL producers actually emit it (and that a fully-drained cycle whose `pending` is non-zero
 * still reads `clean`) lives in the boundary-crossing integration test in
 * `test/.../ai/daemons/embed/drainCycle.spec.mjs`, because a summary fabricated here could assert a
 * shape the source never emits.
 *
 * The tests that matter are the ones proving `drainedClean` cannot be reached by an absence: no
 * cycle yet, a cycle that threw, a deliberately-inactive loop, and — the fix's core — a summary that
 * does not declare its residue are four different not-clean facts, none of them cleanliness.
 */
test.describe('ai/daemons/shared drainDisposition', () => {
    const tracker = () => createDrainDispositionTracker({now: () => 1000});

    test('#15802 before any cycle the state is UNOBSERVED, never clean', async () => {
        const d = tracker().getDisposition();

        expect(d.state).toBe('unobserved');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toBe('no-drain-cycle-completed-yet');
        expect(d.counts).toBeNull();
        expect(d.at).toBeNull();
    });

    test('#15802 a completed cycle with zero residue is CLEAN even when pending was non-zero', async () => {
        // The load-bearing semantic: `pending` is the PRE-drain observation. A cycle that read one
        // record and embedded it emits `{pending: 1, embedded: 1, outstanding: 0}`. Reading `pending`
        // as work-left would call this `dirty` and never let steady traffic go clean — the exact
        // defect this fix removed. Cleanliness reads `outstanding`, which is zero here.
        const t = tracker();
        t.recordCycle({pending: 1, embedded: 1, compensated: 0, failed: 0, prunedSegments: 1, outstanding: 0});

        const d = t.getDisposition();
        expect(d.state).toBe('clean');
        expect(d.drainedClean).toBe(true);
        expect(d.counts.embedded).toBe(1);
        expect(d.at).toBe(1000);
    });

    test('#15802 residue left after the cycle is DIRTY', async () => {
        // A cycle that embedded 100 records and left 2 behind (batch-overflow / cooling / failed)
        // reports the producer's residue, not its progress.
        const t = tracker();
        t.recordCycle({pending: 102, embedded: 100, compensated: 0, outstanding: 2});

        const d = t.getDisposition();
        expect(d.state).toBe('dirty');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toContain('outstanding=2');
    });

    test('#15802 the message loop reports its own residue vocabulary', async () => {
        // `observed - drained`: five read, four drained, one still outstanding.
        const t = tracker();
        t.recordCycle({observed: 5, drained: 4, failed: 0, deferred: 1, inactive: false, outstanding: 1});

        expect(t.getDisposition().state).toBe('dirty');
    });

    test('#15802 a summary that does not DECLARE its residue is UNOBSERVED, never clean', async () => {
        // The fail-closed invariant. A producer that forgets `outstanding` (or a future third loop
        // wired before it reports one) must not be graded `clean` by default — cleanliness has to be
        // asserted, never assumed. This is the guard that makes "read one field" safe.
        const t = tracker();
        t.recordCycle({pending: 0, embedded: 3, failed: 0});   // no `outstanding` key

        const d = t.getDisposition();
        expect(d.state).toBe('unobserved');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toBe('summary-missing-outstanding');
    });

    test('#15802 an INACTIVE loop is its own state — not clean, not failing', async () => {
        // The message drain runs with no replay processor wired. It is deliberately not draining,
        // which is neither a clean plane nor a broken one; folding it into either would misreport.
        const t = tracker();
        t.recordCycle({observed: 0, drained: 0, failed: 0, deferred: 0, inactive: true, outstanding: 0});

        const d = t.getDisposition();
        expect(d.state).toBe('inactive');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toBe('no-replay-processor-wired');
    });

    test('#15802 a failed cycle REVOKES a previous clean result — no stale success', async () => {
        // The load-bearing case. Without this, a plane that drained cleanly at 10:00 and has been
        // throwing ever since still reports `drainedClean: true` — a receipt that cannot go
        // negative once it has gone positive, which is the defect class this whole receipt guards.
        const t = tracker();
        t.recordCycle({pending: 0, embedded: 0, compensated: 0, outstanding: 0});
        expect(t.getDisposition().drainedClean).toBe(true);

        t.recordFailure(new Error('collection unavailable'));

        const d = t.getDisposition();
        expect(d.state).toBe('unobserved');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toContain('collection unavailable');
        expect(d.counts).toBeNull();   // the stale counts must not survive either
    });

    test('#15802 the receipt is a copy — a consumer cannot mutate the tracker through it', async () => {
        const t = tracker();
        t.recordCycle({pending: 1, embedded: 1, compensated: 0, outstanding: 0});

        t.getDisposition().counts.embedded = 999;

        expect(t.getDisposition().counts.embedded).toBe(1);
    });

    /**
     * `truncated` answers ONE question: may a consumer read these totals as the whole window?
     *
     * Everything below drives the real tracker. The recorder-side specs stub the provider and so
     * prove only that the recorder relays whatever it is handed — a producer that computes
     * `truncated` wrongly passes every one of them. That gap is what these close.
     */
    test('a lookback that predates the tracker itself is NOT a complete answer (#16835)', async () => {
        // The post-restart shape: the process died, the in-memory ring went with it, and the new
        // tracker's first completed cycle is idle. Durable rows written before the restart are real
        // work this tracker never saw — so the honest answer is "I cannot say", not "nothing".
        let   clock = 10000;
        const t     = createDrainDispositionTracker({now: () => clock});

        t.recordCycle({pending: 0, embedded: 0, outstanding: 0});

        const w = t.getWindowSince(0);

        expect(w.totals.embedded, 'the tracker genuinely observed no embeds').toBe(0);
        expect(w.truncated,
            'a window starting before the tracker existed is a PARTIAL answer — reporting it as ' +
            'complete is the same false zero the module exists to prevent').toBe(true);
    });

    test('eviction also truncates — the ring dropped cycles inside the lookback (#16835)', async () => {
        // The control that already held: capacity loss. Kept so a coverage-based predicate cannot
        // regress it.
        let   clock = 0;
        const t     = createDrainDispositionTracker({historyLimit: 4, now: () => (clock += 1000)});

        for (let i = 0; i < 10; i++) t.recordCycle({pending: 1, embedded: 1, outstanding: 0});

        const w = t.getWindowSince(0);

        expect(w.cycles, 'only the retained tail is aggregated').toBe(4);
        expect(w.truncated, 'cycles inside the lookback were evicted').toBe(true);
    });

    test('a fully covered window is NOT truncated, however quiet it was (#16835)', async () => {
        // The negative control, and the one that matters most: without it, "always true" satisfies
        // both tests above. An idle interval the tracker WAS alive for is genuine idleness, and
        // flagging it would make the alarm fire on every healthy plane — disabled within a week.
        let   clock = 1000;
        const t     = createDrainDispositionTracker({now: () => clock});

        clock = 2000; t.recordCycle({pending: 0, embedded: 0, outstanding: 0});
        clock = 3000; t.recordCycle({pending: 0, embedded: 0, outstanding: 0});

        const w = t.getWindowSince(1000);

        expect(w.cycles).toBe(2);
        expect(w.truncated,
            'the tracker was alive across the whole lookback and evicted nothing — the quiet is ' +
            'real, and reporting it as unattestable would fire on every healthy plane').toBe(false);
    });

    test('a cycle that started, reached the provider, and THREW leaves a hole the window admits (#16835)', async () => {
        // @neo-gpt's Cycle-3 witness, executed against the real tracker. The dangerous shape: a cycle
        // starts, its provider call settles DURABLY on the activity ledger, and the cycle then throws
        // during post-add verification / pending re-read / marker append / prune — `startDrainLoop`
        // routes every such throw to `recordFailure`. It never becomes a history entry.
        //
        // Before the repair this read providerActivity=1 against window totals of 0 with
        // truncated=false: a hole inside an interval advertised as a complete denominator.
        let   clock = 1000;
        const t     = createDrainDispositionTracker({now: () => clock});

        clock = 2000; t.recordCycleStart({pending: 1, selected: 1});
        clock = 3000; t.recordFailure(new Error('post-add verification failed'));
        clock = 4000; t.recordCycle({pending: 0, embedded: 0, outstanding: 0});

        const w = t.getWindowSince(1000);

        expect(t.getInProgress(), 'the failure clears the in-progress slot — that part was right').toBeNull();
        expect(w.totals.embedded, 'the failed cycle contributes no counts, because it has none').toBe(0);
        expect(w.truncated,
            'a failed cycle did real provider work inside this lookback and left no entry — the ' +
            'aggregate cannot be offered as the whole of it').toBe(true);
    });

    test('a failure OUTSIDE the lookback does not truncate it (#16835)', async () => {
        // The bound on the fix. A failure that predates the window is not this window's hole, and
        // truncating on it would make every plane that ever failed permanently unattestable.
        let   clock = 1000;
        const t     = createDrainDispositionTracker({now: () => clock});

        clock = 2000; t.recordFailure(new Error('old failure, long since past'));
        clock = 5000; t.recordCycle({pending: 0, embedded: 0, outstanding: 0});

        expect(t.getWindowSince(3000).truncated,
            'the failure is older than the lookback — it is not this interval\'s gap').toBe(false);
    });

    test('the covered interval is on the surface, not left to be inferred (#16835)', async () => {
        // A consumer cannot act on `truncated` alone: it says the answer is partial without saying
        // which part. `coverageStartedAt` is the denominator of the reading.
        let   clock = 5000;
        const t     = createDrainDispositionTracker({now: () => clock});

        clock = 6000; t.recordCycle({pending: 0, embedded: 0, outstanding: 0});

        expect(t.getWindowSince(0).coverageStartedAt,
            'the earliest instant this tracker could attest').toBe(5000);
    });
});
