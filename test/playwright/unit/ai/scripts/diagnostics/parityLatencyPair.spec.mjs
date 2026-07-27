import {test, expect} from '@playwright/test';
import {
    MIN_SAMPLES,
    compareLatencyLeg,
    evaluateLatencyPair,
    summarizeSamples
} from '../../../../../../ai/scripts/diagnostics/parityLatencyPair.mjs';

// Option A asserts the parity topology is fast enough to be a seat's daily reality. Its falsifier is
// latency, and without a measured PAIR it is unfalsifiable by construction — a parity figure alone says
// nothing, because the question is always "compared to what the seat has today".
//
// Two disciplines are asserted here rather than trusted: a single sample is not a measurement, and the
// acceptability bound is the caller's to supply.

const EVENT = 'first successful healthcheck response after process/stack start';

const leg = (stdio, parity) => ({stdioSamples: stdio, paritySamples: parity, comparableEvent: EVENT});

test.describe('summarizeSamples — one reading is not a measurement', () => {
    test('⭐ fewer than the floor refuses, and says why rather than just how many', () => {
        const result = summarizeSamples([120], 'boot stdioSamples');

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('1 sample(s)');
        expect(result.reason).toContain('is not a measurement');
        expect(result.reason).toContain('moves substantially on re-run');
        expect(MIN_SAMPLES).toBe(3);
    })

    test('median, not mean — one scheduling outlier must not move the centre', () => {
        // Mean would be 340; median stays 120, and the outlier is visible in spreadRatio instead.
        const result = summarizeSamples([110, 120, 130, 1000]);

        expect(result.ok).toBe(true);
        expect(result.medianMs).toBe(125);          // (120+130)/2 on an even count
        expect(result.minMs).toBe(110);
        expect(result.maxMs).toBe(1000);
        expect(result.spreadRatio).toBeCloseTo(1000 / 110, 5);
    })

    test('an odd count takes the middle value', () => {
        expect(summarizeSamples([130, 110, 120]).medianMs).toBe(120);
    })

    test('refuses non-positive or non-finite samples by index', () => {
        expect(summarizeSamples([100, 0, 120]).reason).toContain('[1]');
        expect(summarizeSamples([100, Number.NaN, 120]).reason).toContain('[1]');
        expect(summarizeSamples([100, -5, 120]).reason).toContain('[1]');
        expect(summarizeSamples('nope').reason).toContain('must be an array');
    })
});

test.describe('compareLatencyLeg — the equivalence must be STATED, not assumed', () => {
    test('⭐ an UNNAMED comparableEvent refuses — the topologies share no native "boot"', () => {
        // Parity times a FOUR-SERVICE container plane to healthy (vector store + both MCP servers +
        // running orchestrator + served-identity assertion); stdio spawns a server per client and has no
        // such plane-ready moment. A ratio between two different events is misleading even when both
        // numbers are real — which is the failure this comparator exists to prevent one level up.
        const result = compareLatencyLeg({
            stdioSamples: [100, 100, 100], paritySamples: [250, 250, 250], dimension: 'boot'
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('comparableEvent must name the event BOTH legs measured');
        expect(result.reason).toContain('worse than no ratio');
        expect(result).not.toHaveProperty('overheadRatio');
    })

    test('a blank comparableEvent is not a name', () => {
        expect(compareLatencyLeg({stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2], comparableEvent: '   '}).ok).toBe(false);
    })

    test('the named event is carried onto the result, so a reader sees what was compared', () => {
        expect(compareLatencyLeg(leg([100, 100, 100], [250, 250, 250])).comparableEvent).toBe(EVENT);
    })
});

test.describe('compareLatencyLeg — the pair, with its trustworthiness exposed', () => {
    test('reports overhead as both a ratio and an absolute', () => {
        const result = compareLatencyLeg({...leg([100, 100, 100], [250, 250, 250]), dimension: 'boot'});

        expect(result.ok).toBe(true);
        expect(result.overheadRatio).toBeCloseTo(2.5, 5);
        expect(result.overheadMs).toBe(150);
        expect(result.dimension).toBe('boot');
    })

    test('⭐ a NOISY leg is flagged untrustworthy — a ratio between two noisy legs earns no verdict', () => {
        // The ratio is still computed and reported; what changes is that the reader is told not to lean
        // on it. Silently folding dispersion into the ratio would hide exactly the case that matters.
        const noisy = compareLatencyLeg(leg([100, 100, 100], [100, 400, 900]));

        expect(noisy.ok).toBe(true);
        expect(noisy.trustworthy).toBe(false);
        expect(noisy.parity.spreadRatio).toBeCloseTo(9, 5);

        const tight = compareLatencyLeg(leg([100, 110, 120], [200, 210, 220]));

        expect(tight.trustworthy).toBe(true);
    })

    test('a refusal in either leg propagates with the offending leg named', () => {
        expect(compareLatencyLeg({...leg([100], [100, 100, 100]), dimension: 'boot'}).reason)
            .toContain('boot stdioSamples');
        expect(compareLatencyLeg({...leg([100, 100, 100], [100]), dimension: 'hotCall'}).reason)
            .toContain('hotCall paritySamples');
    })
});

test.describe('evaluateLatencyPair — the bound is the caller\'s, the pair is the deliverable', () => {
    const boot    = leg([100, 100, 100], [250, 250, 250]),
          hotCall = leg([10, 10, 10], [12, 12, 12]);

    test('⭐ REFUSES without an explicit acceptableOverhead — but STILL RETURNS THE PAIR', () => {
        // Capturing the pair IS the acceptance criterion: an unevaluated pair makes Option A's falsifier
        // evaluable, whereas a missing pair leaves it unfalsifiable. So the refusal must not discard it.
        const result = evaluateLatencyPair({boot, hotCall});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('no default on purpose');
        expect(result.reason).toContain('operational decision');
        expect(result.reason).toContain('capturing it is the deliverable');
        // The evidence survives the refusal.
        expect(result.pair.boot.overheadRatio).toBeCloseTo(2.5, 5);
        expect(result.pair.hotCall.overheadRatio).toBeCloseTo(1.2, 5);
    })

    test('within budget when every leg clears the supplied bound', () => {
        const result = evaluateLatencyPair({boot, hotCall, acceptableOverhead: 3});

        expect(result.ok).toBe(true);
        expect(result.verdict).toBe('within-budget');
        expect(result.exceeded).toEqual([]);
        expect(result.trustworthy).toBe(true);
    })

    test('⭐ exceeds budget NAMES the offending dimension — a bare fail hides which leg', () => {
        const result = evaluateLatencyPair({boot, hotCall, acceptableOverhead: 2});

        expect(result.verdict).toBe('exceeds-budget');
        expect(result.exceeded).toEqual(['boot']);   // hotCall at 1.2x still clears 2x
    })

    test('trustworthiness is per-pair — one noisy leg withdraws confidence from the verdict', () => {
        const result = evaluateLatencyPair({
            boot, hotCall: leg([10, 10, 10], [5, 40, 90]), acceptableOverhead: 10
        });

        expect(result.ok).toBe(true);
        expect(result.verdict).toBe('within-budget');
        // ...but the reader is told the verdict rests on a noisy leg.
        expect(result.trustworthy).toBe(false);
    })

    test('a sample-count refusal in either dimension refuses the whole evaluation', () => {
        expect(evaluateLatencyPair({boot: leg([100], [100, 100, 100]), hotCall, acceptableOverhead: 2}).reason)
            .toContain('boot stdioSamples');
    })
});
