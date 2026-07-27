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

// Reproducibility conditions: cache state alone does not pin a run, since image, source head, ignored
// generated runtime config and host load all move independently of it. `cacheConvention` must EQUAL
// the ratified constant — free text let the explicitly-excluded build-inclusive regime through.
const CONDITIONS = {
    cacheConvention: PARITY_CACHE_CONVENTION,
    imageDigest    : 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    datasetDigest  : 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    configHead     : '1111111111111111111111111111111111111111',
    runtimeDigest  : 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    hostLoad       : 'idle; load1=0.41'
};

// Parity boot samples arrive as PER-SERVICE observations and are reduced by max-of-both, so the ruling's
// separate MC/KB requirement is binding rather than illustrative.
// Per-service observations. Both topologies and BOTH dimensions take this shape now: boot reduces by
// max-of-both, hot-call stays per service so one slow service is named rather than averaged away.
const OBSERVATIONS = [
    {memoryCoreMs: 200, knowledgeBaseMs: 250},
    {memoryCoreMs: 210, knowledgeBaseMs: 240},
    {memoryCoreMs: 220, knowledgeBaseMs: 260}
];

/** Three per-service observations centred on `base`. */
const obs = base => [
    {memoryCoreMs: base,     knowledgeBaseMs: base + 2},
    {memoryCoreMs: base + 1, knowledgeBaseMs: base + 3},
    {memoryCoreMs: base + 2, knowledgeBaseMs: base + 4}
];

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
        expect(result.reason).toContain('must be one of the accepted measurement events');
        expect(result.reason).toContain('worse than no ratio');
        expect(result).not.toHaveProperty('overheadRatio');
    })

    test('⭐ CALLER PROSE is refused, however plausible — accepted values only', () => {
        // The falsified shape required a non-empty string, so `'process start'` satisfied it while naming an
        // event the ruling excludes. Making the argument harder to supply did not make the fact harder to
        // fake: the check has to be membership in the ratified set.
        for (const comparableEvent of [
            'process start', 'process start ', 'first successful healthcheck response after process/stack start',
            '   ', '', null, undefined, 42, PARITY_BOOT_EVENT + ' '
        ]) {
            const result = compareLatencyLeg({stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2], comparableEvent});

            expect(result.ok).toBe(false);
        }
    })

    test('⭐ an accepted event on the WRONG dimension refuses', () => {
        // Both values ratified is not enough: timing a cold launch and labelling it hotCall reports boot
        // latency under a hot-call heading, which is the collapse the pair exists to expose.
        const swapped = compareLatencyLeg({
            stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2],
            dimension   : 'hotCall', comparableEvent: PARITY_BOOT_EVENT
        });

        expect(swapped.ok).toBe(false);
        expect(swapped.reason).toContain('mislabels');

        // Positive control: the same event on its own dimension is accepted.
        expect(compareLatencyLeg({
            stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2],
            dimension   : 'boot', comparableEvent: PARITY_BOOT_EVENT
        }).ok).toBe(true);
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
    const boot    = {stdioObservations: obs(100), parityObservations: OBSERVATIONS, comparableEvent: PARITY_BOOT_EVENT},
          hotCall = {stdioObservations: obs(10), parityObservations: obs(12), comparableEvent: PARITY_HOT_CALL_EVENT};

    test('⭐ the reviewer\'s exact falsifier is refused end-to-end', () => {
        // Two distinct non-empty event strings ('process start' / 'process start '), the explicitly EXCLUDED
        // build-inclusive cache regime, placeholder digests, no host load, and an absurd bound. Every one of
        // those satisfied an earlier "is a non-empty string" check.
        const result = evaluateLatencyPair({
            boot              : {stdioSamples: [10, 11, 12], paritySamples: [261033, 261033, 261033], comparableEvent: 'process start'},
            hotCall           : {stdioSamples: [1, 1, 1], paritySamples: [2, 2, 2], comparableEvent: 'process start '},
            acceptableOverhead: 1_000_000,
            conditions        : {cacheConvention: 'cold-with-three-image-build', imageDigest: 'caller-text', configHead: 'caller-text'}
        });

        expect(result.ok).toBe(false);
        expect(result).not.toHaveProperty('verdict');
    })

    test('⭐ the EXCLUDED cache regime is refused even when everything else is ratified', () => {
        // Describing a disallowed regime accurately is not the same as measuring an allowed one. This is the
        // regime that produced 261033ms.
        const result = evaluateLatencyPair({
            boot, hotCall, acceptableOverhead: 3,
            conditions: {...CONDITIONS, cacheConvention: 'cold-with-three-image-build'}
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('must be exactly PARITY_CACHE_CONVENTION');
        expect(result.reason).toContain('deployment receipt');
    })

    test('⭐ a placeholder digest is refused — it reads as recorded', () => {
        const result = evaluateLatencyPair({
            boot, hotCall, acceptableOverhead: 3, conditions: {...CONDITIONS, imageDigest: 'caller-text'}
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('must be a sha256 digest');
    })

    test('⭐ matched data, host load, source head, and runtime config are REQUIRED', () => {
        for (const key of ['datasetDigest', 'hostLoad', 'configHead', 'runtimeDigest']) {
            const {[key]: _dropped, ...partial} = CONDITIONS;

            expect(evaluateLatencyPair({boot, hotCall, acceptableOverhead: 3, conditions: partial}).ok).toBe(false);
        }
    })

    test('⭐ a placeholder matched-dataset digest is refused', () => {
        const result = evaluateLatencyPair({
            boot, hotCall, acceptableOverhead: 3, conditions: {...CONDITIONS, datasetDigest: 'caller-text'}
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('conditions.datasetDigest must be a sha256 digest')
    })

    test('⭐ a PRE-REDUCED slot is refused on EITHER topology and EITHER dimension — all four are bound', () => {
        // Per-service separation was previously enforced on the parity BOOT slot alone, so the other three
        // accepted flattened arrays: nothing showed the stdio boot healthchecked both services, and both
        // hot-call legs were collapsed. Each slot is asserted individually so no single one can regress.
        const flat  = [1, 1, 1],
              slots = [
                  ['boot stdio',    {boot: {...boot, stdioObservations: flat}, hotCall}],
                  ['boot parity',   {boot: {...boot, parityObservations: flat}, hotCall}],
                  ['hotCall stdio', {boot, hotCall: {...hotCall, stdioObservations: flat}}],
                  ['hotCall parity',{boot, hotCall: {...hotCall, parityObservations: flat}}]
              ];

        for (const [label, legs] of slots) {
            const result = evaluateLatencyPair({...legs, acceptableOverhead: 3, conditions: CONDITIONS});

            expect(result.ok, `${label} must refuse a flattened array`).toBe(false);
            // The refusal names the SLOT, so a reader knows which of the four measurements was flattened.
            expect(result.reason, `${label} refusal must name its slot`).toContain(label);
        }
    })

    test('a per-observation missing service is named by index', () => {
        const result = evaluateLatencyPair({
            boot   : {...boot, parityObservations: [OBSERVATIONS[0], {memoryCoreMs: 210}, OBSERVATIONS[2]]},
            hotCall, acceptableOverhead: 3, conditions: CONDITIONS
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('boot parity[1]');
        expect(result.reason).toContain('not a zero');
    })

    test('⭐ REFUSES without an explicit acceptableOverhead — but STILL RETURNS THE PAIR', () => {
        // Capturing the pair IS the acceptance criterion: an unevaluated pair makes Option A's falsifier
        // evaluable, whereas a missing pair leaves it unfalsifiable. So the refusal must not discard it.
        const result = evaluateLatencyPair({boot, hotCall, conditions: CONDITIONS});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('no default on purpose');
        expect(result.reason).toContain('capturing it is the deliverable');
        // Boot compares seat-ready medians: parity max-of-both 250 vs stdio max-of-both 103.
        expect(result.pair.boot.overheadRatio).toBeGreaterThan(2);
        expect(Object.keys(result.pair.hotCall)).toEqual(['memoryCore', 'knowledgeBase']);
        expect(result.conditions).toBe(CONDITIONS);
    })

    test('⭐ boot parity samples are the MAX of each observation, not the mean', () => {
        // POSITIVE CONTROL for the reduction. Observations reduce to 250 / 240 / 260, median 250. A mean of
        // both services would give 225 / 225 / 240 and report the seat ready before KB was.
        const result = evaluateLatencyPair({boot, hotCall, acceptableOverhead: 3, conditions: CONDITIONS});

        expect(result.ok).toBe(true);
        expect(result.pair.boot.parity.medianMs).toBe(250);
        expect(result.pair.boot.parity.maxMs).toBe(260);
        expect(result.verdict).toBe('within-budget');
    })

    test('⭐ same event on both dimensions is impossible now — each is pinned to its dimension', () => {
        // Previously guarded by a "must differ" check, which two near-identical strings defeated. Now the
        // dimension/event agreement check makes the collapse unreachable rather than merely detected.
        const result = evaluateLatencyPair({
            boot              : {...boot, comparableEvent: PARITY_HOT_CALL_EVENT}, hotCall,
            acceptableOverhead: 3, conditions: CONDITIONS
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('mislabels');
    })

    test('an evaluated pair CARRIES the conditions it was taken under', () => {
        const result = evaluateLatencyPair({boot, hotCall, acceptableOverhead: 3, conditions: CONDITIONS});

        expect(result.conditions.cacheConvention).toBe(PARITY_CACHE_CONVENTION);
        expect(result.conditions.hostLoad).toBe(CONDITIONS.hostLoad);
    })

    test('⭐ exceeds budget NAMES the offending dimension — a bare fail hides which leg', () => {
        const result = evaluateLatencyPair({boot, hotCall, acceptableOverhead: 2, conditions: CONDITIONS});

        expect(result.verdict).toBe('exceeds-budget');
        expect(result.exceeded).toEqual(['boot']);   // hotCall at 1.2x still clears 2x
    })

    test('dispersion travels with the verdict as data, for the reader to weigh', () => {
        const noisy = [
            {memoryCoreMs: 5,  knowledgeBaseMs: 5},
            {memoryCoreMs: 40, knowledgeBaseMs: 40},
            {memoryCoreMs: 90, knowledgeBaseMs: 90}
        ];
        const result = evaluateLatencyPair({
            boot, hotCall: {...hotCall, parityObservations: noisy},
            acceptableOverhead: 100, conditions: CONDITIONS
        });

        expect(result.ok).toBe(true);
        // 90/5 = 18x within the noisy leg; reported, never scored.
        expect(result.worstSpreadRatio).toBeCloseTo(18, 5);
        expect(result).not.toHaveProperty('trustworthy');
    })

    test('a sample-count refusal in either dimension refuses the whole evaluation', () => {
        expect(evaluateLatencyPair({
            boot              : {...boot, stdioObservations: obs(100).slice(0, 1)}, hotCall,
            acceptableOverhead: 2, conditions: CONDITIONS
        }).reason).toContain('boot stdioSamples');

        expect(evaluateLatencyPair({
            boot              : {...boot, parityObservations: OBSERVATIONS.slice(0, 1)}, hotCall,
            acceptableOverhead: 2, conditions: CONDITIONS
        }).reason).toContain('boot paritySamples');
    })
});
