import {expect, test} from '@playwright/test';

import {buildMiniSummaryStarvationDiagnosis,
        DEFAULT_MIN_SUSTAINED_PASSES,
        TIMEOUT_CAUSES} from '../../../../../../../ai/daemons/orchestrator/services/miniSummaryStarvationDiagnosis.mjs';

const SERVICE_ID  = 'mc-server',
      OBSERVED_AT = 1_785_700_000_000;

/**
 * miniSummary generation-starvation detection.
 *
 * The predecessor was closed unmerged for deriving a timeout verdict from control-flow branch counters,
 * so the assertions here are weighted toward the things that go WRONG silently: emitting from no
 * evidence, emitting on a sweep that is merely draining bad rows, and naming a binding timeout that no
 * cause supports. A detector that only proves it fires on a real starvation is the shape that failed.
 */
test.describe('Neo.ai.daemons.orchestrator miniSummaryStarvationDiagnosis', () => {
    const starvedPass = (causes, extra = {}) => ({
        processed     : Object.values(causes).reduce((sum, count) => sum + count, 0),
        updated       : 0,
        deferred      : 0,
        missingContent: 0,
        exhausted     : 0,
        failedInner   : 0,
        failedOuter   : 0,
        failureCauses : causes,
        ...extra
    });

    const windowOf = (pass, count = DEFAULT_MIN_SUSTAINED_PASSES) => Array.from({length: count}, () => pass);

    test('a sustained inner-timeout window diagnoses contention and names the inner window', () => {
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({[TIMEOUT_CAUSES.inner]: 4})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event).toBeTruthy();
        // contention, never crash: a model-dependent canary means saturation, not a dead service, and a
        // restart would cost an outage while fixing nothing.
        expect(event.recoveryClass).toBe('contention');
        expect(event.details.bindingTimeout).toBe('inner');
        expect(event.details.sustainedPasses).toBe(DEFAULT_MIN_SUSTAINED_PASSES);
    });

    test('an outer-dominant window names the outer window', () => {
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({[TIMEOUT_CAUSES.outer]: 3})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.details.bindingTimeout).toBe('outer');
    });

    test('a tie reports mixed rather than picking one (#16382)', () => {
        // Supersedes the predecessor's tie-resolves-to-outer rule. That rule compensated for a verdict
        // INFERRED from branch topology; with typed causes both timeouts are measured, so a tie means the
        // window genuinely hit both bounds. Choosing one asserts a fact the evidence does not contain.
        const event = buildMiniSummaryStarvationDiagnosis({
            window    : windowOf(starvedPass({[TIMEOUT_CAUSES.inner]: 2, [TIMEOUT_CAUSES.outer]: 2})),
            observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.details.bindingTimeout).toBe('mixed');
    });

    test('a starved window with NO timeout cause names no binding timeout at all (#16382)', () => {
        // Real starvation, nothing to widen. `provider-error` means the provider failed, not that a window
        // was too small — naming one would send a controller to adjust a bound that was never involved.
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({'provider-error': 5})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event).toBeTruthy();
        expect(event.details.bindingTimeout).toBeUndefined();
        expect(event.details.causeTotals).toEqual({inner: 0, outer: 0, other: 15});
    });

    test('an empty window with a zero threshold emits NOTHING (@neo-gpt-emmy)', () => {
        // The predecessor's live defect: `0 < 0` is false and `[].every(...)` is vacuously true, so it
        // emitted a diagnosis from no evidence whatsoever. Both halves of the guard are needed.
        expect(buildMiniSummaryStarvationDiagnosis({
            window: [], observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses: 0
        })).toBeNull();

        expect(buildMiniSummaryStarvationDiagnosis({
            window: [], observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses: -5
        })).toBeNull();

        expect(buildMiniSummaryStarvationDiagnosis({
            observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses: 0
        })).toBeNull();
    });

    test('a single-pass window does not satisfy a zero threshold (@neo-gpt-emmy)', () => {
        const single = [starvedPass({[TIMEOUT_CAUSES.inner]: 3})];

        // One pass is not a sustained window; a zero threshold must not make it one.
        expect(buildMiniSummaryStarvationDiagnosis({
            window: single, observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses: 0
        })).toBeTruthy();
        expect(buildMiniSummaryStarvationDiagnosis({
            window: single, observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('a mixed-cause pass draining un-summarizable rows does NOT diagnose starvation (@neo-gpt-emmy)', () => {
        // The predecessor's second live defect: it required only *at least one* branch failure, so a sweep
        // that correctly archived three un-summarizable rows and hit one unrelated error read as starved.
        // That is a working sweep with a bad row in it.
        const draining = {
            processed     : 4,
            updated       : 0,
            missingContent: 3,
            exhausted     : 0,
            failureCauses : {'provider-error': 1}
        };

        expect(buildMiniSummaryStarvationDiagnosis({
            window: windowOf(draining), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('a window that completes any work is not starved', () => {
        const partial = starvedPass({[TIMEOUT_CAUSES.inner]: 3}, {updated: 1});

        expect(buildMiniSummaryStarvationDiagnosis({
            window: windowOf(partial), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('one recovered pass inside an otherwise starved window suppresses the diagnosis', () => {
        const window = windowOf(starvedPass({[TIMEOUT_CAUSES.inner]: 3}));
        window[1] = starvedPass({[TIMEOUT_CAUSES.inner]: 3}, {updated: 2});

        expect(buildMiniSummaryStarvationDiagnosis({
            window, observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('branch counters travel as evidence but never source the verdict (#16382)', () => {
        // The deletion test, applied to the verdict: branch topology that DISAGREES with the causes must
        // not move `bindingTimeout`. If it can, the producer is reading branches again — which is exactly
        // how the predecessor failed.
        const misleading = starvedPass({[TIMEOUT_CAUSES.outer]: 4}, {failedInner: 99, failedOuter: 0});

        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(misleading), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.details.bindingTimeout).toBe('outer');
        expect(event.evidenceFacts[0].branchSplit).toEqual({failedInner: 99, failedOuter: 0});
    });

    test('an unrecognised cause is counted as other, never silently dropped', () => {
        const event = buildMiniSummaryStarvationDiagnosis({
            window    : windowOf(starvedPass({'some-future-cause': 2})),
            observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event).toBeTruthy();
        expect(event.details.causeTotals.other).toBe(6);
        expect(event.details.bindingTimeout).toBeUndefined();
    });

    test('argument guards reject a missing serviceId or a non-finite observedAt', () => {
        expect(() => buildMiniSummaryStarvationDiagnosis({window: [], observedAt: OBSERVED_AT}))
            .toThrow(/serviceId is required/);
        expect(() => buildMiniSummaryStarvationDiagnosis({window: [], serviceId: SERVICE_ID}))
            .toThrow(/observedAt must be a finite number/);
    });
});
