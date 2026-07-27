import {test, expect} from '@playwright/test';
import {
    MIN_SAMPLES,
    PARITY_BOOT_EVENT,
    PARITY_CACHE_CONVENTION,
    PARITY_HOT_CALL_EVENT,
    compareLatencyLeg,
    deriveSeatReadyMs,
    evaluateLatencyPair,
    summarizeSamples
} from '../../../../../../ai/scripts/diagnostics/parityLatencyPair.mjs';

// Option A asserts the parity topology is fast enough to be a seat's daily reality. Its falsifier is
// latency, and without a measured PAIR it is unfalsifiable by construction — a parity figure alone says
// nothing, because the question is always "compared to what the seat has today".
//
// Four disciplines are asserted here rather than trusted: a single sample is not a measurement, the
// acceptability bound is the caller's to supply, the two dimensions must measure DIFFERENT events, and a
// pair that cannot be reproduced is a number rather than a measurement.
//
// This suite previously carried the collapse it now guards: one generic `leg(EVENT)` was handed to both
// dimensions, so the hot-call leg measured process start — the boot definition, and explicitly not the
// selected hot-call one. Dimension-specific helpers exist so that cannot recur silently.

// Reproducibility conditions: cache state alone does not pin a run, since image and config move
// independently of it.
const CONDITIONS = {
    cacheConvention: PARITY_CACHE_CONVENTION,
    imageDigest    : 'sha256:e3b0c44298fc1c149afbf4c8996fb924',
    configHead     : '8c73d531c5'
};

const bootLeg    = (stdio, parity) => ({stdioSamples: stdio, paritySamples: parity, comparableEvent: PARITY_BOOT_EVENT}),
      hotCallLeg = (stdio, parity) => ({stdioSamples: stdio, paritySamples: parity, comparableEvent: PARITY_HOT_CALL_EVENT}),
      // Kept for the single-leg suites below, where the dimension under test is stated explicitly.
      leg        = bootLeg;

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
        expect(compareLatencyLeg(leg([100, 100, 100], [250, 250, 250])).comparableEvent).toBe(PARITY_BOOT_EVENT);
    })
});

test.describe('compareLatencyLeg — dispersion is reported, not scored', () => {
    test('reports overhead as both a ratio and an absolute', () => {
        const result = compareLatencyLeg({...bootLeg([100, 100, 100], [250, 250, 250]), dimension: 'boot'});

        expect(result.ok).toBe(true);
        expect(result.overheadRatio).toBeCloseTo(2.5, 5);
        expect(result.overheadMs).toBe(150);
        expect(result.dimension).toBe('boot');
    })

    test('⭐ NO trustworthiness boolean is minted from an unratified cutoff', () => {
        // An earlier shape emitted `trustworthy: spreadRatio <= 2`. Nobody selected 2x — it was invented
        // here and hardened into something downstream readers would treat as a verdict. Having declined to
        // invent the acceptability bound and then inventing a dispersion bound is the same defect one level
        // down, so the spread is reported and the judgement is left to whoever holds a ratified ceiling.
        const noisy = compareLatencyLeg(bootLeg([100, 100, 100], [100, 400, 900]));

        expect(noisy.ok).toBe(true);
        expect(noisy).not.toHaveProperty('trustworthy');
        expect(noisy.parity.spreadRatio).toBeCloseTo(9, 5);
        expect(noisy.worstSpreadRatio).toBeCloseTo(9, 5);

        const tight = compareLatencyLeg(bootLeg([100, 110, 120], [200, 210, 220]));

        expect(tight).not.toHaveProperty('trustworthy');
        // Reported for both legs, so the worse of the two is what a reader sees.
        expect(tight.worstSpreadRatio).toBeCloseTo(1.2, 5);
    })

    test('a refusal in either leg propagates with the offending leg named', () => {
        expect(compareLatencyLeg({...bootLeg([100], [100, 100, 100]), dimension: 'boot'}).reason)
            .toContain('boot stdioSamples');
        expect(compareLatencyLeg({...hotCallLeg([100, 100, 100], [100]), dimension: 'hotCall'}).reason)
            .toContain('hotCall paritySamples');
    })
});

test.describe('deriveSeatReadyMs — seat-ready is the LATER service, per service', () => {
    test('takes the max, and names which service was slower', () => {
        // The steward's boot definition times MC and KB separately; the seat is ready when the later one
        // is. A mean would report a seat ready while a service it depends on is still starting.
        const result = deriveSeatReadyMs({memoryCoreMs: 4200, knowledgeBaseMs: 6100});

        expect(result.ok).toBe(true);
        expect(result.seatReadyMs).toBe(6100);
        expect(result.slowerService).toBe('knowledge-base');

        expect(deriveSeatReadyMs({memoryCoreMs: 9000, knowledgeBaseMs: 1000}).slowerService).toBe('memory-core');
    })

    test('⭐ a missing service is UNMEASURED, not zero', () => {
        // Defaulting the absent one to zero would let the faster service alone define readiness — the
        // optimistic direction, and invisible in the resulting number.
        for (const spec of [
            {memoryCoreMs: 4200},
            {knowledgeBaseMs: 6100},
            {memoryCoreMs: 4200, knowledgeBaseMs: 0},
            {memoryCoreMs: -1, knowledgeBaseMs: 6100},
            {}
        ]) {
            const result = deriveSeatReadyMs(spec);

            expect(result.ok).toBe(false);
            expect(result.reason).toContain('not a zero');
        }

        expect(deriveSeatReadyMs().ok).toBe(false);
    })
});

test.describe('evaluateLatencyPair — the bound is the caller\'s, the pair is the deliverable', () => {
    const boot    = bootLeg([100, 100, 100], [250, 250, 250]),
          hotCall = hotCallLeg([10, 10, 10], [12, 12, 12]);

    test('⭐ REFUSES when both dimensions declare the SAME event — that is not a pair', () => {
        // The falsified shape. Each leg is individually well-formed, so only a check that sees both can
        // catch it: reusing the boot event for hot-call made the second leg time process start, reporting
        // boot latency twice under two labels.
        const collapsed = evaluateLatencyPair({
            boot, hotCall: bootLeg([10, 10, 10], [12, 12, 12]),
            conditions: CONDITIONS, acceptableOverhead: 3
        });

        expect(collapsed.ok).toBe(false);
        expect(collapsed.reason).toContain('SAME comparableEvent');
        expect(collapsed.reason).toContain('boot latency twice');
        // The evidence survives the refusal.
        expect(collapsed.pair.boot.overheadRatio).toBeCloseTo(2.5, 5);
    })

    test('⭐ REFUSES without an explicit acceptableOverhead — but STILL RETURNS THE PAIR', () => {
        // Capturing the pair IS the acceptance criterion: an unevaluated pair makes Option A's falsifier
        // evaluable, whereas a missing pair leaves it unfalsifiable. So the refusal must not discard it.
        // Conditions supplied so the refusal is provably about the MISSING BOUND — otherwise this test
        // would pass on the earlier conditions guard and stop covering what it names.
        const result = evaluateLatencyPair({boot, hotCall, conditions: CONDITIONS});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('no default on purpose');
        expect(result.reason).toContain('operational decision');
        expect(result.reason).toContain('capturing it is the deliverable');
        expect(result.pair.boot.overheadRatio).toBeCloseTo(2.5, 5);
        expect(result.pair.hotCall.overheadRatio).toBeCloseTo(1.2, 5);
        // Conditions ride along, so the recorded pair stays interpretable.
        expect(result.conditions).toBe(CONDITIONS);
    })

    test('⭐ REFUSES conditions that cannot reproduce the run — cache state alone does not pin it', () => {
        // Image digest and config head move independently of cache state. This is how a build-dominated
        // 261033ms survives as an apparently comparable number: nothing in the figure says what produced it.
        for (const conditions of [
            undefined, null, {}, 'warm',
            {cacheConvention: PARITY_CACHE_CONVENTION},
            {cacheConvention: PARITY_CACHE_CONVENTION, imageDigest: 'sha256:abc'},
            {cacheConvention: PARITY_CACHE_CONVENTION, imageDigest: '', configHead: '8c73d531c5'},
            {imageDigest: 'sha256:abc', configHead: '8c73d531c5'}
        ]) {
            const result = evaluateLatencyPair({boot, hotCall, conditions, acceptableOverhead: 3});

            expect(result.ok).toBe(false);
            expect(result.reason).toMatch(/conditions/);
            // The pair still survives the refusal.
            expect(result.pair.boot.ok).toBe(true);
        }
    })

    test('an evaluated pair CARRIES the conditions it was taken under', () => {
        const result = evaluateLatencyPair({boot, hotCall, conditions: CONDITIONS, acceptableOverhead: 3});

        expect(result.conditions.cacheConvention).toBe(PARITY_CACHE_CONVENTION);
        expect(result.conditions.imageDigest).toBe(CONDITIONS.imageDigest);
        expect(result.conditions.configHead).toBe(CONDITIONS.configHead);
    })

    test('the steward-decided definitions are single-sourced, distinct, and not defaulted', () => {
        expect(PARITY_BOOT_EVENT).toContain('cold runtime launch');
        expect(PARITY_BOOT_EVENT).toContain('memory-core and knowledge-base separately');
        // The hot-call definition must EXCLUDE process start — that exclusion is the whole distinction.
        expect(PARITY_HOT_CALL_EVENT).toContain('already-established sessions');
        expect(PARITY_HOT_CALL_EVENT).toContain('no process or stack start');
        expect(PARITY_HOT_CALL_EVENT).not.toBe(PARITY_BOOT_EVENT);

        expect(PARITY_CACHE_CONVENTION).toContain('images/artifacts warm');
        expect(PARITY_CACHE_CONVENTION).toContain('runtimes cold');

        // Omission is still a refusal even though canonical values now exist.
        expect(compareLatencyLeg({stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2]}).ok).toBe(false);
        expect(evaluateLatencyPair({boot, hotCall, acceptableOverhead: 3}).ok).toBe(false);
    })

    test('within budget when every leg clears the supplied bound', () => {
        const result = evaluateLatencyPair({boot, hotCall, conditions: CONDITIONS, acceptableOverhead: 3});

        expect(result.ok).toBe(true);
        expect(result.verdict).toBe('within-budget');
        expect(result.exceeded).toEqual([]);
        expect(result).not.toHaveProperty('trustworthy');
        expect(result.worstSpreadRatio).toBeCloseTo(1, 5);
    })

    test('⭐ exceeds budget NAMES the offending dimension — a bare fail hides which leg', () => {
        const result = evaluateLatencyPair({boot, hotCall, conditions: CONDITIONS, acceptableOverhead: 2});

        expect(result.verdict).toBe('exceeds-budget');
        expect(result.exceeded).toEqual(['boot']);   // hotCall at 1.2x still clears 2x
    })

    test('dispersion travels with the verdict as data, for the reader to weigh', () => {
        const result = evaluateLatencyPair({
            boot, hotCall: hotCallLeg([10, 10, 10], [5, 40, 90]),
            conditions: CONDITIONS, acceptableOverhead: 10
        });

        expect(result.ok).toBe(true);
        expect(result.verdict).toBe('within-budget');
        // Reported, not scored: the worst spread across both legs is 18x here, and the reader decides.
        expect(result.worstSpreadRatio).toBeCloseTo(18, 5);
        expect(result).not.toHaveProperty('trustworthy');
    })

    test('a sample-count refusal in either dimension refuses the whole evaluation', () => {
        expect(evaluateLatencyPair({
            boot: bootLeg([100], [100, 100, 100]), hotCall, conditions: CONDITIONS, acceptableOverhead: 2
        }).reason).toContain('boot stdioSamples');
    })
});
