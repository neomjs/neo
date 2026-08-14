import {test, expect}                    from '@playwright/test';
import Neo                               from '../../../../../../../src/Neo.mjs';
import * as core                         from '../../../../../../../src/core/_export.mjs';
import {ContainerHealthDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/ContainerHealthDiagnosisService.mjs';
import {
    MEMORY_PRESSURE_UNKNOWN_REASONS,
    deriveMemoryPressure,
    describeMemoryWindowReachability,
    describeSaturationThresholdDomain,
    foldMemoryPressureIntoStatus
} from '../../../../../../../ai/daemons/orchestrator/services/memoryPressureDisposition.mjs';

/**
 * Memory-pressure disposition — the fold that was missing between a computed fact and a verdict.
 *
 * The observed incident is the fixture behind these cases: a lane at 48.0G of a 48.0G cap, swap
 * 0.4% → 52.8%, a task in flight ~26 minutes whose clean cost is ~2, while every health surface read
 * healthy. The saturation fact existed the whole time. What did not exist was anything that turned it
 * into a status, because the service record derived `status` from `errors.length` alone and a
 * container at its ceiling produces no error.
 *
 * ## Why these run through the REAL diagnosis service
 *
 * The first version of this matrix hand-authored the saturation fact. Every case passed, and three
 * production seams sat underneath it untouched: the shipped window could not be spanned by the shipped
 * retention so the fact never fired at all, an unavailable heap observation resolved to `below`, and
 * the receipt read `details.scope` while the producer writes `details.memoryScope`.
 *
 * The fixture is what hid all three — it was authored to agree with the consumer rather than with the
 * producer, so it could not disagree with it. A matrix that manufactures its own input tests the
 * fixture. These cases therefore build a real `ContainerHealthDiagnosisService`, feed it real stats
 * samples, and let it emit (or decline to emit) the fact.
 */
test.describe('memoryPressureDisposition (#17121)', () => {
    const
        OBSERVED_AT = 1_710_000_000_000,
        SERVICE_KEY = 'embedding-model',
        // The shipped pair. Named here so a change to either default breaks these cases loudly rather
        // than quietly making the window unspannable again.
        WINDOW_MS    = 30_000,
        SAMPLE_WINDOW = 2,
        WRITE_INTERVAL_MS = 30_000;

    /**
     * A Docker stats sample at a given memory percent, stamped as `rememberStatsSample` stamps it in
     * production. An unstamped sample asserts a window nothing observed, so the stamp is deliberate.
     */
    function statsSample({memoryPercent, observedAtMs, cpuPercent = 0, containerId = 'container-1'}) {
        const
            memoryLimit = 1000,
            systemDelta = 1_000_000_000,
            cpuDelta    = (cpuPercent / 100) * systemDelta / 4;

        return {
            observedAtMs,
            containerId,
            cpu_stats: {
                online_cpus     : 4,
                system_cpu_usage: systemDelta,
                cpu_usage       : {
                    total_usage : cpuDelta,
                    percpu_usage: [cpuDelta / 4, cpuDelta / 4, cpuDelta / 4, cpuDelta / 4]
                }
            },
            precpu_stats: {system_cpu_usage: 0, cpu_usage: {total_usage: 0}},
            memory_stats: {usage: memoryLimit * memoryPercent / 100, limit: memoryLimit}
        };
    }

    function createService(diagnosisConfig = {memorySaturationWindowMs: WINDOW_MS}) {
        return Neo.create(ContainerHealthDiagnosisService, {
            diagnosisConfig,
            nowFn           : () => OBSERVED_AT,
            ollamaHostReader: () => 'http://local-model:11434'
        });
    }

    /**
     * Runs the real producer and returns both halves of what the bridge passes to the consumer, so a
     * case cannot accidentally certify a disposition against evidence the producer never emitted.
     */
    // `nodeCommand === false` is the SOLE licence for the container ratio — `true` and `null` both
    // route to heap scope, because "not Node" and "could not tell" must not collapse into one answer.
    // These cases are container-scoped unless a test says otherwise, so the default is explicit.
    function observe({percents, spanMs = WRITE_INTERVAL_MS, nodeCommand = false}) {
        const
            service      = createService(),
            statsSamples = percents.map((memoryPercent, index) => statsSample({
                memoryPercent,
                observedAtMs: OBSERVED_AT - spanMs * (percents.length - 1 - index)
            })),
            diagnosis = service.diagnose({
                serviceKey        : SERVICE_KEY,
                inspect           : {State: {Status: 'running', Health: {Status: 'healthy'}}},
                stats             : statsSamples.at(-1),
                statsSamples,
                runtimeContainerId: 'container-1',
                nodeCommand,
                observedAt        : OBSERVED_AT
            }),
            classification = service.describeClassification({serviceKey: SERVICE_KEY, statsSamples, nodeCommand});

        return {classification, diagnosis};
    }

    test('sustained saturation from the real producer is at-cap, and the receipt carries the scope the producer actually writes', () => {
        const {disposition, receipt} = deriveMemoryPressure(observe({percents: [99.8, 99.9]}));

        expect(disposition).toBe('at-cap');
        // The producer writes `details.memoryScope`. Reading `details.scope` — as this consumer did
        // for one revision — yields `undefined`, and the `?? null` beside it converts the broken
        // contract into a legal-looking value, so every real receipt silently lost its scope while
        // a hand-authored fixture that spelled the field the consumer's way stayed green.
        expect(receipt.scope).toBe('container');
        expect(receipt.serviceKey).toBe(SERVICE_KEY);
        expect(receipt.threshold).toBe(90);
        expect(receipt.observedWindowMs).toBe(WRITE_INTERVAL_MS);
        // The window the fact was ACTUALLY tested against, not the shared diagnosis clock.
        expect(receipt.requiredWindowMs).toBe(WINDOW_MS);
    });

    test('a spike that does not hold across the window is below, not at-cap', () => {
        // One sample over the line, one under: the window is fully spanned and fully stamped, so the
        // question WAS answered — and the answer is that this lane is not at its ceiling.
        const {disposition, reason} = deriveMemoryPressure(observe({percents: [99.8, 12]}));

        expect(disposition).toBe('below');
        expect(reason).toBeNull();
    });

    test('an unspanned window is unknown, not below — the question was not answerable', () => {
        // Two samples one second apart cannot evidence a 30s sustained window. Reporting `below` here
        // would publish an all-clear derived from a measurement that never happened.
        const {disposition, reason} = deriveMemoryPressure(observe({percents: [99.8, 99.9], spanMs: 1_000}));

        expect(disposition).toBe('unknown');
        expect(reason).toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.windowNotSpanned);
    });

    test('a single sample is unknown — one stamp is no span', () => {
        const {disposition, reason} = deriveMemoryPressure(observe({percents: [99.8]}));

        expect(disposition).toBe('unknown');
        expect(reason).toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.windowNotSpanned);
    });

    test('an unavailable heap observation is unknown — an explicit blindness report is not an all-clear', () => {
        // A Node service is measured against its OWN heap, never the container. With no heap
        // observation attached, the producer emits `heap-observation-unavailable` INSTEAD of a memory
        // reading. Treating that absence as "no saturation found" is how a consumer answers "memory
        // is fine" to a producer that just said it cannot see memory at all.
        const {disposition, reason} = deriveMemoryPressure(observe({percents: [99.8, 99.9], nodeCommand: true}));

        expect(disposition).toBe('unknown');
        expect(reason).toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.heapObservationUnavailable);
    });

    test('an absent diagnosis is unknown — a ceiling nobody measured is not a ceiling nobody crossed', () => {
        expect(deriveMemoryPressure({}).disposition).toBe('unknown');
        expect(deriveMemoryPressure({}).reason).toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.diagnosisUnavailable);
    });

    test('a withdrawn authority is unknown — a non-authoritative reading may not be laundered into a verdict', () => {
        // The diagnosis service withdraws authority when a cgroup total may describe forks rather than
        // the service. The number stays reported; only its right to license a verdict is removed.
        const {classification, diagnosis} = observe({percents: [99.8, 99.9]});
        const withdrawn                   = {
            ...diagnosis,
            facts: diagnosis.facts.map(fact => ({...fact, authoritative: false}))
        };

        const {disposition, reason} = deriveMemoryPressure({classification, diagnosis: withdrawn});

        expect(disposition).toBe('unknown');
        expect(reason).toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.authorityWithdrawn);
    });

    test('classification is required to answer below — without it the absence of a fact is ambiguous', () => {
        const {diagnosis} = observe({percents: [50, 51]});

        expect(deriveMemoryPressure({diagnosis}).reason)
            .toBe(MEMORY_PRESSURE_UNKNOWN_REASONS.classificationUnavailable);
    });

    test('only at-cap degrades, and an existing degraded verdict is never softened', () => {
        expect(foldMemoryPressureIntoStatus({status: 'available', disposition: 'at-cap'})).toBe('degraded');
        expect(foldMemoryPressureIntoStatus({status: 'available', disposition: 'below'})).toBe('available');
        expect(foldMemoryPressureIntoStatus({status: 'available', disposition: 'unknown'})).toBe('available');
        expect(foldMemoryPressureIntoStatus({status: 'degraded', disposition: 'below'})).toBe('degraded');
    });

    test('widening the memory window does not retime the CPU clock', () => {
        // The regression half of the same defect. `memorySaturationWindowMs` and `sampleWindowMs` were
        // briefly ONE leaf, so configuring memory also moved the CPU sustained window, the container
        // cold-start gate and three provider-activity freshness bounds — five gates the PR claimed not
        // to touch, and none of their specs went red because each injects its own config.
        //
        // Both directions in one case: at a 120s memory window against a 30s span, memory must fall
        // silent while CPU — still on its own 30s clock — must continue to fire.
        const
            service = createService({memorySaturationWindowMs: 120_000}),
            samples = [0, 1].map(index => statsSample({
                cpuPercent   : 99,
                memoryPercent: 99.8,
                observedAtMs : OBSERVED_AT - WRITE_INTERVAL_MS * (1 - index)
            })),
            {facts} = service.diagnose({
                serviceKey        : SERVICE_KEY,
                inspect           : {State: {Status: 'running', Health: {Status: 'healthy'}}},
                stats             : samples.at(-1),
                statsSamples      : samples,
                runtimeContainerId: 'container-1',
                nodeCommand       : false,
                observedAt        : OBSERVED_AT
            }),
            types = facts.map(fact => fact.type);

        expect(types).toContain('resource-saturation');
        expect(types).not.toContain('memory-saturation');
    });

    test.describe('threshold domain — a percentage that cannot mean anything', () => {
        test('the shipped thresholds are in domain', () => {
            expect(describeSaturationThresholdDomain({percent: 90, storePercent: 80}))
                .toEqual({valid: true, invalid: []});
        });

        test('0 is refused — it reports every complete sample set as saturated', () => {
            // A ratio is always >= 0, so a zero threshold fires constantly and degrades a healthy
            // plane. Loud, but wrong.
            expect(describeSaturationThresholdDomain({percent: 0, storePercent: 80}).invalid)
                .toEqual(['percent']);
        });

        test('above 100 is refused — an unreachable threshold DISABLES the detector silently', () => {
            // The dangerous direction, and the reason this refuses rather than clamps. A percentage
            // of a limit can never exceed 100, so the fact is never emitted — and a detector that
            // never fires is indistinguishable from a plane that is never saturated, which is the
            // exact failure this whole surface exists to close. Clamping 101 to 100 would substitute
            // a threshold nobody chose and the operator would never learn the config was impossible.
            expect(describeSaturationThresholdDomain({percent: 101, storePercent: 80}).invalid)
                .toEqual(['percent']);
        });

        test('both leaves are checked, and each is named', () => {
            expect(describeSaturationThresholdDomain({percent: -1, storePercent: 1000}).invalid)
                .toEqual(['percent', 'storePercent']);
            expect(describeSaturationThresholdDomain({percent: 90, storePercent: NaN}).invalid)
                .toEqual(['storePercent']);
            // The boundary is inclusive at 100: a lane pinned AT its limit is the incident.
            expect(describeSaturationThresholdDomain({percent: 100, storePercent: 100}).valid).toBe(true);
        });
    });

    test.describe('window reachability — the guard for the defect that shipped', () => {
        test('the shipped window is spannable by the shipped retention', () => {
            // The pair, asserted together. Either default moving alone silently re-creates a detector
            // that cannot fire, which is invisible in every other test: an un-emitted fact and an
            // unsaturated plane produce identical evidence.
            const {reachable, maxSpannableMs} = describeMemoryWindowReachability({
                windowMs         : WINDOW_MS,
                statsSampleWindow: SAMPLE_WINDOW,
                writeIntervalMs  : WRITE_INTERVAL_MS
            });

            expect(reachable).toBe(true);
            expect(maxSpannableMs).toBe(30_000);
        });

        test('the pair that actually shipped is rejected', () => {
            // 120000ms against 2 samples 30s apart: green CI, passing unit matrix, dead feature.
            expect(describeMemoryWindowReachability({
                windowMs         : 120_000,
                statsSampleWindow: 2,
                writeIntervalMs  : 30_000
            })).toEqual({reachable: false, maxSpannableMs: 30_000, windowMs: 120_000});
        });

        test('a wider window becomes reachable by raising retention with it', () => {
            // Five samples make FOUR intervals, not five — the off-by-one that makes a 2-sample buffer
            // look like it covers a full cadence when it covers a single gap.
            expect(describeMemoryWindowReachability({
                windowMs         : 120_000,
                statsSampleWindow: 5,
                writeIntervalMs  : 30_000
            }).reachable).toBe(true);
        });

        test('a zero window is refused, not trivially satisfied', () => {
            // The subtle one, and the reason it is refused rather than accepted: `0 <= maxSpannable`
            // is true, so a zero window READS as reachable while asserting no sustained requirement
            // at all. Every complete sample set clears it, a single spike becomes at-cap, and the
            // corroboration that licenses one memory fact to degrade a service alone disappears
            // silently. A disabled detector and a floorless one are different failures; only one is
            // loud, so the quiet one is rejected here.
            expect(describeMemoryWindowReachability({
                windowMs: 0, statsSampleWindow: 2, writeIntervalMs: 30_000
            }).reachable).toBe(false);
        });

        test('a fractional retention is refused — it spans a window nothing observes', () => {
            expect(describeMemoryWindowReachability({
                windowMs: 30_000, statsSampleWindow: 2.5, writeIntervalMs: 30_000
            }).reachable).toBe(false);
        });

        test('a degenerate retention cannot span any positive window', () => {
            expect(describeMemoryWindowReachability({
                windowMs: 1, statsSampleWindow: 1, writeIntervalMs: 30_000
            }).reachable).toBe(false);
        });
    });
});
