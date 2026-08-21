import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    OUTSTANDING_STATE,
    describeCorpusOutstanding,
    normalizeSettlementCounts
} from '../../../../../../../ai/services/knowledge-base/helpers/corpusOutstanding.mjs';

/**
 * Corpus-outstanding observable coverage.
 *
 * The property under test is a discrimination, not a number: `count: 0` at rest must be distinguishable from
 * `count: 0` with a backlog, and BOTH must be distinguishable from `count: 0` that was never measured. The
 * third case is the one that recreates the original defect if it collapses into the first.
 */

test.describe('normalizeSettlementCounts — cumulative settlement stays coherent', () => {
    test('accepts exact non-negative safe-integer partitions', () => {
        expect(normalizeSettlementCounts({accepted: 868, settled: 250, remaining: 618}))
            .toEqual({settled: 250, remaining: 618});
        expect(normalizeSettlementCounts({accepted: 3, settled: 3, remaining: 0}))
            .toEqual({settled: 3, remaining: 0});
        expect(normalizeSettlementCounts({accepted: 0, settled: 0, remaining: 0}))
            .toEqual({settled: 0, remaining: 0});
    });

    test('refuses malformed, negative, fractional, and internally inconsistent tuples', () => {
        for (const candidate of [
            {accepted: 3, settled: 1, remaining: 1},
            {accepted: 3, settled: 4, remaining: -1},
            {accepted: 3, settled: 1.5, remaining: 1.5},
            {accepted: 3, settled: undefined, remaining: 3},
            {accepted: Number.MAX_SAFE_INTEGER + 1, settled: 0, remaining: 0}
        ]) {
            expect(normalizeSettlementCounts(candidate), JSON.stringify(candidate)).toBeNull()
        }
    });
});

test.describe('describeCorpusOutstanding — empty-at-rest vs empty-mid-progress vs never-measured', () => {
    test('zero outstanding is complete', () => {
        const result = describeCorpusOutstanding({settled: 868, remaining: 0, observedAt: 1_000});

        expect(result.state).toBe(OUTSTANDING_STATE.complete);
        expect(result.observable).toBe(true);
        expect(result.outstanding).toBe(0);
        expect(result.remaining).toBe(0);
        expect(result.settled).toBe(868);
    });

    test('a backlog with no prior observation reports outstanding and stamps its first observation', () => {
        const result = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000});

        expect(result.state).toBe(OUTSTANDING_STATE.outstanding);
        expect(result.lastDecreasedAt).toBe(1_000);
    });

    test('THE DISCRIMINATION: an unmeasurable backlog is not a complete corpus', () => {
        const unknown  = describeCorpusOutstanding({settled: null, remaining: null, observedAt: 1_000}),
              complete = describeCorpusOutstanding({settled: 1,    remaining: 0,    observedAt: 1_000});

        expect(unknown.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(unknown.observable).toBe(false);
        expect(unknown.outstanding).toBeNull();
        expect(unknown.remaining).toBeNull();
        expect(unknown.settled).toBeNull();

        // The two must not be confusable on any field a caller would branch on.
        expect(unknown.state).not.toBe(complete.state);
        expect(unknown.outstanding).not.toBe(complete.outstanding);
        expect(unknown.observable).not.toBe(complete.observable);
    });

    test('a shrinking backlog stamps the movement and stays outstanding', () => {
        const previous = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000}),
              next     = describeCorpusOutstanding({
                  settled: 568, remaining: 300, observedAt: 9_000, previous
              });

        expect(next.state).toBe(OUTSTANDING_STATE.outstanding);
        expect(next.lastDecreasedAt).toBe(9_000); // it moved, so the clock restarts
    });

    test('a non-decreasing backlog keeps its ORIGINAL movement stamp', () => {
        const previous = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000}),
              next     = describeCorpusOutstanding({
                  settled: 250, remaining: 618, observedAt: 2_000, previous
              });

        expect(next.state).toBe(OUTSTANDING_STATE.outstanding);
        expect(next.lastDecreasedAt).toBe(1_000); // the ORIGINAL stamp, not the re-observation
    });

    test('re-observing an unmoved backlog does not refresh its movement stamp', () => {
        // The reason the companion measures DECREASE and not observation: a stuck backlog polled every
        // minute for six hours would otherwise report as freshly-moved on every single poll.
        let state = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000});

        for (const observedAt of [2_000, 3_000, 4_000, 5_000]) {
            state = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt, previous: state});
        }

        expect(state.state).toBe(OUTSTANDING_STATE.outstanding);
        expect(state.lastDecreasedAt).toBe(1_000);
        expect(state.observedAt).toBe(5_000);
    });

    test('a growing backlog is not a decrease', () => {
        const previous = describeCorpusOutstanding({settled: 400, remaining: 100, observedAt: 1_000}),
              next     = describeCorpusOutstanding({
                  settled: 100, remaining: 400, observedAt: 2_000, previous
              });

        expect(next.lastDecreasedAt).toBe(1_000);
        expect(next.state).toBe(OUTSTANDING_STATE.outstanding);
    });

    test('a failed measurement preserves the prior movement stamp', () => {
        // Otherwise one unreadable poll resets a long-stuck backlog's clock, and the next successful read
        // reports it as recently-moved.
        const previous = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000}),
              failed   = describeCorpusOutstanding({settled: null, remaining: null, observedAt: 2_000, previous});

        expect(failed.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(failed.lastDecreasedAt).toBe(1_000);
    });

    test('RA-2: a long-unmoved backlog still reports the NEUTRAL state — the producer never claims a trend', () => {
        const previous = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 1_000}),
              next     = describeCorpusOutstanding({settled: 250, remaining: 618, observedAt: 9_999_000, previous});

        // RA-2 (@neo-gpt): a 618 backlog observed nearly three hours later still reports the NEUTRAL
        // state — the producer makes no motion claim. The honest companion is that `lastDecreasedAt`
        // stayed at 1_000 while `observedAt` moved to 9_999_000, so a consumer that knows this lane's
        // cadence can compute the stall itself. That is the distinction the old `converging` erased.
        expect(next.lastDecreasedAt).toBe(1_000);
        expect(next.observedAt).toBe(9_999_000);
    });

    test('a missing observedAt is unobservable rather than dated with a substitute clock', () => {
        const result = describeCorpusOutstanding({settled: 250, remaining: 618});

        expect(result.state).toBe(OUTSTANDING_STATE.unobservable);
        expect(result.observedAt).toBeNull();
    });

    test('NON-VACUITY CONTROL: the composed shape carries every field a surface branches on', () => {
        // Guards against a stub that returns a plausible-looking object with fields absent — which would let
        // every assertion above pass against a decision that reports nothing.
        const result = describeCorpusOutstanding({settled: 58, remaining: 42, observedAt: 7_000});

        for (const key of ['state', 'settled', 'remaining', 'outstanding', 'observable', 'lastDecreasedAt', 'observedAt']) {
            expect(result).toHaveProperty(key);
        }
        expect(result.settled).toBe(58);
        expect(result.remaining).toBe(42);
        expect(result.outstanding).toBe(42);
        expect(result.state).toBe(OUTSTANDING_STATE.outstanding);
    });
});
