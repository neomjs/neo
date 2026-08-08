import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    OUTSTANDING_STATE,
    deriveOutstanding,
    describeCorpusOutstanding
} from '../../../../../../../ai/services/knowledge-base/helpers/corpusOutstanding.mjs';

/**
 * Corpus-outstanding observable coverage.
 *
 * The property under test is a discrimination, not a number: `count: 0` at rest must be distinguishable from
 * `count: 0` with a backlog, and BOTH must be distinguishable from `count: 0` that was never measured. The
 * third case is the one that recreates the original defect if it collapses into the first.
 */

test.describe('deriveOutstanding — the run leaves a real remainder', () => {
    test('a completed run leaves nothing outstanding', () => {
        expect(deriveOutstanding({total: 868, embedded: 868})).toBe(0);
    });

    test('a lease-yielded run leaves exactly what it did not reach', () => {
        // The specimen from the live plane: 18 batches of 50, yielded after 5.
        expect(deriveOutstanding({total: 868, embedded: 250})).toBe(618);
    });

    test('deliberately skipped chunks are NOT outstanding', () => {
        // Guardrail rejections will never embed. Counting them as backlog produces a figure that can never
        // reach zero, so `complete` would become unreachable for any corpus carrying one oversized chunk.
        expect(deriveOutstanding({total: 100, embedded: 90, skipped: 10})).toBe(0);

        // …and the skip must subtract exactly once. Asserted at a NON-ZERO remainder because the zero case
        // above passes identically against a stub that ignores its inputs and returns 0 — which a mutation
        // run proved: `return 0` survived four of the five cases in this block.
        expect(deriveOutstanding({total: 100, embedded: 60, skipped: 10})).toBe(30);
    });

    test('ARITHMETIC PIN: the remainder tracks each input independently', () => {
        // Every case here has a distinct non-zero expectation, so no constant-returning implementation and
        // no single-input implementation can satisfy the set.
        expect(deriveOutstanding({total: 868, embedded: 0}))              .toBe(868);
        expect(deriveOutstanding({total: 868, embedded: 50}))             .toBe(818);
        expect(deriveOutstanding({total: 868, embedded: 0,  skipped: 8})) .toBe(860);
        expect(deriveOutstanding({total: 500, embedded: 100, skipped: 25})).toBe(375);
        expect(deriveOutstanding({total: 1,   embedded: 0}))              .toBe(1);
    });

    test('over-reported progress clamps to zero rather than going negative', () => {
        expect(deriveOutstanding({total: 10, embedded: 12})).toBe(0);
    });

    test('unusable inputs return null, never a reassuring zero', () => {
        expect(deriveOutstanding({total: NaN, embedded: 0})).toBeNull();
        expect(deriveOutstanding({total: 10, embedded: undefined})).toBeNull();
        expect(deriveOutstanding({total: -1, embedded: 0})).toBeNull();
        expect(deriveOutstanding({})).toBeNull();
    });
});

test.describe('describeCorpusOutstanding — empty-at-rest vs empty-mid-progress vs never-measured', () => {
    test('zero outstanding is complete', () => {
        const result = describeCorpusOutstanding({outstanding: 0, observedAt: 1_000});

        expect(result.state).toBe(OUTSTANDING_STATE.complete);
        expect(result.observable).toBe(true);
        expect(result.outstanding).toBe(0);
    });

    test('a backlog with no prior observation is converging, not stuck', () => {
        const result = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000, stuckThresholdMs: 500});

        expect(result.state).toBe(OUTSTANDING_STATE.converging);
        expect(result.lastDecreasedAt).toBe(1_000);
    });

    test('THE DISCRIMINATION: an unmeasurable backlog is not a complete corpus', () => {
        const unknown  = describeCorpusOutstanding({outstanding: null, observedAt: 1_000}),
              complete = describeCorpusOutstanding({outstanding: 0,    observedAt: 1_000});

        expect(unknown.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(unknown.observable).toBe(false);
        expect(unknown.outstanding).toBeNull();

        // The two must not be confusable on any field a caller would branch on.
        expect(unknown.state).not.toBe(complete.state);
        expect(unknown.outstanding).not.toBe(complete.outstanding);
        expect(unknown.observable).not.toBe(complete.observable);
    });

    test('a shrinking backlog stamps the movement and stays converging', () => {
        const previous = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000, stuckThresholdMs: 500}),
              next     = describeCorpusOutstanding({
                  outstanding: 300, observedAt: 9_000, previous, stuckThresholdMs: 500
              });

        expect(next.state).toBe(OUTSTANDING_STATE.converging);
        expect(next.lastDecreasedAt).toBe(9_000); // it moved, so the clock restarts
    });

    test('a backlog that has not moved past the threshold is stuck', () => {
        const previous = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000, stuckThresholdMs: 500}),
              next     = describeCorpusOutstanding({
                  outstanding: 618, observedAt: 2_000, previous, stuckThresholdMs: 500
              });

        expect(next.state).toBe(OUTSTANDING_STATE.stuck);
        expect(next.lastDecreasedAt).toBe(1_000); // the ORIGINAL stamp, not the re-observation
    });

    test('re-observing a stuck backlog does not refresh its movement stamp', () => {
        // The reason the companion measures DECREASE and not observation: a stuck backlog polled every
        // minute for six hours would otherwise report as freshly-moved on every single poll.
        let state = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000, stuckThresholdMs: 500});

        for (const observedAt of [2_000, 3_000, 4_000, 5_000]) {
            state = describeCorpusOutstanding({outstanding: 618, observedAt, previous: state, stuckThresholdMs: 500});
        }

        expect(state.state).toBe(OUTSTANDING_STATE.stuck);
        expect(state.lastDecreasedAt).toBe(1_000);
        expect(state.observedAt).toBe(5_000);
    });

    test('a growing backlog is not a decrease', () => {
        const previous = describeCorpusOutstanding({outstanding: 100, observedAt: 1_000, stuckThresholdMs: 500}),
              next     = describeCorpusOutstanding({
                  outstanding: 400, observedAt: 2_000, previous, stuckThresholdMs: 500
              });

        expect(next.lastDecreasedAt).toBe(1_000);
        expect(next.state).toBe(OUTSTANDING_STATE.stuck);
    });

    test('a failed measurement preserves the prior movement stamp', () => {
        // Otherwise one unreadable poll resets a long-stuck backlog's clock, and the next successful read
        // reports it as recently-moved.
        const previous = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000, stuckThresholdMs: 500}),
              failed   = describeCorpusOutstanding({outstanding: null, observedAt: 2_000, previous});

        expect(failed.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(failed.lastDecreasedAt).toBe(1_000);
    });

    test('without a threshold a backlog never claims to be stuck', () => {
        const previous = describeCorpusOutstanding({outstanding: 618, observedAt: 1_000}),
              next     = describeCorpusOutstanding({outstanding: 618, observedAt: 9_999_000, previous});

        expect(next.state).toBe(OUTSTANDING_STATE.converging);
        expect(next.stuckThresholdMs).toBeNull();
    });

    test('a missing observedAt is unobservable rather than dated with a substitute clock', () => {
        const result = describeCorpusOutstanding({outstanding: 618});

        expect(result.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(result.observedAt).toBeNull();
    });

    test('NON-VACUITY CONTROL: the composed shape carries every field a surface branches on', () => {
        // Guards against a stub that returns a plausible-looking object with fields absent — which would let
        // every assertion above pass against a decision that reports nothing.
        const result = describeCorpusOutstanding({outstanding: 42, observedAt: 7_000, stuckThresholdMs: 500});

        for (const key of ['state', 'outstanding', 'observable', 'lastDecreasedAt', 'observedAt', 'stuckThresholdMs']) {
            expect(result).toHaveProperty(key);
        }
        expect(result.outstanding).toBe(42);
        expect(result.stuckThresholdMs).toBe(500);
    });
});
