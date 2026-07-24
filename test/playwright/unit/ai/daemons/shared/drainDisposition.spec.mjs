import {expect, test}                  from '@playwright/test';
import {createDrainDispositionTracker} from '../../../../../../ai/daemons/shared/drainDisposition.mjs';

/**
 * @summary Coverage for the drain receipt's state machine.
 *
 * The tracker exists because both WAL drain loops computed a per-cycle summary, logged it
 * conditionally, and discarded it — so nothing downstream could answer "did this plane drain, and
 * is it clean?". The parity pilot consumes that answer as a receipt field.
 *
 * The tests that matter are the ones proving `drainedClean` cannot be reached by an absence: no
 * cycle yet, a cycle that threw, and a deliberately-inactive loop are three different facts and
 * none of them is cleanliness. A boolean-only receipt would have collapsed all three into `false`
 * with no way to tell "not drained" from "drained and dirty" — or, worse, into `true` by defaulting.
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

    test('#15802 a completed cycle with nothing outstanding is CLEAN', async () => {
        const t = tracker();
        t.recordCycle({pending: 0, failed: 0, embedded: 3, prunedSegments: 1});

        const d = t.getDisposition();
        expect(d.state).toBe('clean');
        expect(d.drainedClean).toBe(true);
        expect(d.counts.embedded).toBe(3);
        expect(d.at).toBe(1000);
    });

    test('#15802 progress is not cleanliness — outstanding work is DIRTY', async () => {
        // `embedded`/`drained` count what was done; cleanliness is the ABSENCE of what is left.
        // A cycle that embedded 100 records and left 2 pending is not clean.
        const t = tracker();
        t.recordCycle({pending: 2, failed: 1, embedded: 100});

        const d = t.getDisposition();
        expect(d.state).toBe('dirty');
        expect(d.drainedClean).toBe(false);
        expect(d.reason).toContain('outstanding=3');
    });

    test('#15802 `deferred` counts as outstanding — the message loop reports it', async () => {
        const t = tracker();
        t.recordCycle({observed: 5, drained: 4, failed: 0, deferred: 1, inactive: false});

        expect(t.getDisposition().state).toBe('dirty');
    });

    test('#15802 an INACTIVE loop is its own state — not clean, not failing', async () => {
        // The message drain runs with no replay processor wired. It is deliberately not draining,
        // which is neither a clean plane nor a broken one; folding it into either would misreport.
        const t = tracker();
        t.recordCycle({observed: 0, drained: 0, failed: 0, deferred: 0, inactive: true});

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
        t.recordCycle({pending: 0, failed: 0});
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
        t.recordCycle({pending: 0, failed: 0, embedded: 1});

        t.getDisposition().counts.embedded = 999;

        expect(t.getDisposition().counts.embedded).toBe(1);
    });
});
