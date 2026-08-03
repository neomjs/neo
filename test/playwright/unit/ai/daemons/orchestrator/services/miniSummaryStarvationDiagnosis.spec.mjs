import {expect, test} from '@playwright/test';

import {buildMiniSummaryStarvationDiagnosis,
        DEFAULT_MIN_SUSTAINED_PASSES} from '../../../../../../../ai/daemons/orchestrator/services/miniSummaryStarvationDiagnosis.mjs';

/**
 * Cause vocabulary written as UPSTREAM LITERALS, deliberately not imported from the producer.
 *
 * @neo-gpt-emmy's mutation probe: with fixtures built from the producer's own exported `TIMEOUT_CAUSES`,
 * renaming that constant to `timeout-inner-typo` moved implementation and tests together and the suite
 * stayed green — while the real string `MemoryService` emits stopped resolving. A consumer's fixtures
 * must speak the PRODUCER's vocabulary, or they test the consumer's agreement with itself.
 */
const UPSTREAM = Object.freeze({
    timeoutInner : 'timeout-inner',
    timeoutOuter : 'timeout-outer',
    noModel      : 'no-model',
    providerError: 'provider-error'
});

const SERVICE_ID  = 'mc-server',
      OBSERVED_AT = 1_785_700_000_000;

/**
 * A provider target in the vocabulary the CONSUMERS actually use.
 *
 * Taken from `ContainerHealthDiagnosisService`/`RecoveryActuatorService` fixtures, where a provider target
 * is the compose service HOSTING the model (`model` / `local-model`) — there is no `provider` kind in
 * `RECOVERY_TARGET_IDENTITY_KINDS`. Written as a literal for the same reason as `UPSTREAM` above.
 */
const PROVIDER_TARGET = Object.freeze({kind: 'compose-service', id: 'model'});

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
            window: windowOf(starvedPass({[UPSTREAM.timeoutInner]: 4})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
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
            window: windowOf(starvedPass({[UPSTREAM.timeoutOuter]: 3})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.details.bindingTimeout).toBe('outer');
    });

    test('a tie reports mixed rather than picking one (#16382)', () => {
        // Supersedes the predecessor's tie-resolves-to-outer rule. That rule compensated for a verdict
        // INFERRED from branch topology; with typed causes both timeouts are measured, so a tie means the
        // window genuinely hit both bounds. Choosing one asserts a fact the evidence does not contain.
        const event = buildMiniSummaryStarvationDiagnosis({
            window    : windowOf(starvedPass({[UPSTREAM.timeoutInner]: 2, [UPSTREAM.timeoutOuter]: 2})),
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
        expect(event.recoveryClass).toBe('ambiguous');
        expect(event.details.causeTotals).toEqual({inner: 0, outer: 0, noModel: 0, other: 15});
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

    test('a single-pass window emits NOTHING at any threshold (@neo-gpt-emmy)', () => {
        const single = [starvedPass({[UPSTREAM.timeoutInner]: 3})];

        // My first version of this test asserted `toBeTruthy()` here while its own title and comment said
        // one pass is not sustained — the assertion contradicted the name above it, and the PR body then
        // repeated the title's claim. Sustained means REPEATED; no threshold can make one observation two.
        for (const minSustainedPasses of [0, 1, -5]) {
            expect(buildMiniSummaryStarvationDiagnosis({
                window: single, observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses
            }), `threshold ${minSustainedPasses} must not make one pass sustained`).toBeNull();
        }

        expect(buildMiniSummaryStarvationDiagnosis({
            window: single, observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();

        // Two passes DO satisfy an explicit floor — the guard must not become a blanket refusal.
        expect(buildMiniSummaryStarvationDiagnosis({
            window: [single[0], single[0]], observedAt: OBSERVED_AT, serviceId: SERVICE_ID, minSustainedPasses: 2
        })).toBeTruthy();
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

    test('exhausted rows are GENERATION failures and still diagnose (@neo-gpt-emmy)', () => {
        // The false negative: `exhausted` means the row spent its generation-attempt budget, and the
        // upstream layer records the typed cause BEFORE incrementing it. Excluding it made a genuinely
        // starved window return null — the inverse of the defect this producer exists to catch.
        const exhaustedPass = {
            processed     : 2,
            updated       : 0,
            missingContent: 0,
            exhausted     : 2,
            failureCauses : {[UPSTREAM.timeoutInner]: 2}
        };

        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(exhaustedPass), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event).toBeTruthy();
        expect(event.details.bindingTimeout).toBe('inner');

        // And the control that keeps the fix from swallowing the original guard: missingContent still
        // exempts, because an un-summarizable row was never a generation attempt.
        expect(buildMiniSummaryStarvationDiagnosis({
            window    : windowOf({processed: 4, updated: 0, missingContent: 3, exhausted: 0,
                                  failureCauses: {[UPSTREAM.providerError]: 1}}),
            observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('no-model is never contention against this service (@neo-gpt-emmy)', () => {
        // A missing model is a provider-side fact. Flattening it to contention would blame the Memory Core
        // for a provider's absence purely because the failing operation happens to use a model.
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({[UPSTREAM.noModel]: 3})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.recoveryClass).not.toBe('contention');
        expect(event.details.bindingTimeout).toBeUndefined();
    });

    test('no-model with a provider target is provider-role-residency AIMED AT THE PROVIDER (@neo-gpt-emmy)', () => {
        // Cycle-2 finding. The class alone was not the contract: `RecoveryActuatorService` derives its
        // action target from `targetIdentity.id` (RecoveryActuatorService.mjs:428), and
        // `ContainerHealthDiagnosisService` resolves provider-residency targets from the PROVIDER fact
        // (ContainerHealthDiagnosisService.mjs:460). Emitting the class against `mc-server` would send a
        // warm-provider capability call to a container that hosts no provider.
        const event = buildMiniSummaryStarvationDiagnosis({
            window        : windowOf(starvedPass({[UPSTREAM.noModel]: 3})),
            observedAt    : OBSERVED_AT,
            serviceId     : SERVICE_ID,
            providerTarget: PROVIDER_TARGET
        });

        expect(event.recoveryClass).toBe('provider-role-residency');
        expect(event.targetIdentity).toEqual(PROVIDER_TARGET);
        // The falsifier that matters: the target is NOT the service that reported the starvation.
        expect(event.targetIdentity.id).not.toBe(SERVICE_ID);
        expect(event.diagnosisId.startsWith('provider-role-residency:')).toBe(true);
        expect(event.details.unresolvedProviderTarget).toBeUndefined();
    });

    test('no-model WITHOUT provider authority degrades to ambiguous and says so (@neo-gpt-emmy)', () => {
        // `backfillMiniSummaries` returns an aggregate cause tally and no provider identity
        // (MemoryService.mjs:2182), so this is the shape production actually produces today. The class
        // must not assert a provider subject it cannot name — and must not swallow the fact that it
        // WOULD have, or a consumer holding provider authority has to re-derive the majority rule.
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({[UPSTREAM.noModel]: 3})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.recoveryClass).toBe('ambiguous');
        expect(event.targetIdentity).toEqual({kind: 'compose-service', id: SERVICE_ID});
        expect(event.details.unresolvedProviderTarget).toBe(true);
        // Nothing measured is lost by declining to be precise.
        expect(event.details.causeTotals.noModel).toBe(9);
    });

    test('an untrustworthy provider target degrades rather than throwing or passing through (@neo-gpt-emmy)', () => {
        // Three ways a caller can fail to hold authority. Each must fail CLOSED: a malformed target is a
        // caller problem and must never suppress a real starvation signal, and must never be forwarded to
        // an actuator that will treat `targetIdentity.id` as a service key.
        const candidates = [
            {label: 'unknown kind',     target: {kind: 'provider', id: 'ollama'}},
            {label: 'missing id',       target: {kind: 'compose-service'}},
            // The defect re-entering through the new door: a caller lazily passing its own identity.
            {label: 'the reporter itself', target: {kind: 'compose-service', id: SERVICE_ID}}
        ];

        for (const {label, target} of candidates) {
            const event = buildMiniSummaryStarvationDiagnosis({
                window        : windowOf(starvedPass({[UPSTREAM.noModel]: 3})),
                observedAt    : OBSERVED_AT,
                serviceId     : SERVICE_ID,
                providerTarget: target
            });

            expect(event, `${label} must still emit a diagnosis`).toBeTruthy();
            expect(event.recoveryClass, `${label} must not earn provider-role-residency`).toBe('ambiguous');
            expect(event.targetIdentity).toEqual({kind: 'compose-service', id: SERVICE_ID});
            expect(event.details.unresolvedProviderTarget).toBe(true);
        }
    });

    test('a minority of timeouts does NOT earn contention (@neo-gpt-emmy)', () => {
        // Emmy's exact cycle-2 counterexample: `timeout-inner: 1` + `provider-error: 9` per pass emitted
        // `contention` on window totals of 3:27, because any non-zero timeout won. The reading was TRUE —
        // there really was a timeout — and one level too coarse to be a window verdict. A class is a claim
        // about the window, so it takes a majority of the window.
        const event = buildMiniSummaryStarvationDiagnosis({
            window    : windowOf(starvedPass({[UPSTREAM.timeoutInner]: 1, [UPSTREAM.providerError]: 9})),
            observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event).toBeTruthy();
        expect(event.recoveryClass).toBe('ambiguous');
        expect(event.details.causeTotals).toEqual({inner: 3, outer: 0, noModel: 0, other: 27});
        // And the second half: a minority timeout may not name a binding window either. Reporting
        // `bindingTimeout: 'inner'` off 3 of 30 failures is the same defect one field over.
        expect(event.details.bindingTimeout).toBeUndefined();
    });

    test('an even cause split stays ambiguous — mixed evidence is not a verdict (@neo-gpt-emmy)', () => {
        // The strictness control for the majority rule. With `>=` instead of `>`, a 50/50 window resolves
        // to whichever branch is tested first, which is an ordering artefact masquerading as a diagnosis.
        for (const rival of [UPSTREAM.providerError, UPSTREAM.noModel]) {
            const event = buildMiniSummaryStarvationDiagnosis({
                window    : windowOf(starvedPass({[UPSTREAM.timeoutInner]: 5, [rival]: 5})),
                observedAt: OBSERVED_AT, serviceId: SERVICE_ID, providerTarget: PROVIDER_TARGET
            });

            expect(event.recoveryClass, `timeouts tied with ${rival}`).toBe('ambiguous');
            expect(event.details.bindingTimeout).toBeUndefined();
        }
    });

    test('a binding timeout is reported EXACTLY when the class is contention (#16382)', () => {
        // The invariant behind the two gates above, asserted as a pair so neither can drift alone: a
        // contention window always names its binding bound, and nothing else ever does.
        const cases = [
            {causes: {[UPSTREAM.timeoutInner]: 4},                              expected: 'contention'},
            {causes: {[UPSTREAM.timeoutInner]: 2, [UPSTREAM.timeoutOuter]: 2},  expected: 'contention'},
            {causes: {[UPSTREAM.timeoutInner]: 1, [UPSTREAM.providerError]: 9}, expected: 'ambiguous'},
            {causes: {[UPSTREAM.noModel]: 4},                                   expected: 'provider-role-residency'},
            {causes: {[UPSTREAM.providerError]: 4},                             expected: 'ambiguous'}
        ];

        for (const {causes, expected} of cases) {
            const event = buildMiniSummaryStarvationDiagnosis({
                window    : windowOf(starvedPass(causes)),
                observedAt: OBSERVED_AT, serviceId: SERVICE_ID, providerTarget: PROVIDER_TARGET
            });

            expect(event.recoveryClass, JSON.stringify(causes)).toBe(expected);
            expect(
                event.details.bindingTimeout !== undefined,
                `${JSON.stringify(causes)} → ${expected} must ${expected === 'contention' ? '' : 'not '}name a binding timeout`
            ).toBe(expected === 'contention');
        }
    });

    test('a generic provider-error proves starvation but not contention — ambiguous (@neo-gpt-emmy)', () => {
        // It proves the loop is starved and proves nothing about why. `ambiguous` exists for exactly this.
        const event = buildMiniSummaryStarvationDiagnosis({
            window: windowOf(starvedPass({[UPSTREAM.providerError]: 4})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        });

        expect(event.recoveryClass).toBe('ambiguous');
        expect(event.details.bindingTimeout).toBeUndefined();
    });

    test('a timeout window is the ONLY shape that earns contention', () => {
        // The positive control for the three classes above: without it, the mapping could collapse every
        // window to ambiguous and each negative assertion would still pass.
        for (const cause of [UPSTREAM.timeoutInner, UPSTREAM.timeoutOuter]) {
            expect(buildMiniSummaryStarvationDiagnosis({
                window: windowOf(starvedPass({[cause]: 3})), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
            }).recoveryClass).toBe('contention');
        }
    });

    test('a window that completes any work is not starved', () => {
        const partial = starvedPass({[UPSTREAM.timeoutInner]: 3}, {updated: 1});

        expect(buildMiniSummaryStarvationDiagnosis({
            window: windowOf(partial), observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('one recovered pass inside an otherwise starved window suppresses the diagnosis', () => {
        const window = windowOf(starvedPass({[UPSTREAM.timeoutInner]: 3}));
        window[1] = starvedPass({[UPSTREAM.timeoutInner]: 3}, {updated: 2});

        expect(buildMiniSummaryStarvationDiagnosis({
            window, observedAt: OBSERVED_AT, serviceId: SERVICE_ID
        })).toBeNull();
    });

    test('branch counters travel as evidence but never source the verdict (#16382)', () => {
        // The deletion test, applied to the verdict: branch topology that DISAGREES with the causes must
        // not move `bindingTimeout`. If it can, the producer is reading branches again — which is exactly
        // how the predecessor failed.
        const misleading = starvedPass({[UPSTREAM.timeoutOuter]: 4}, {failedInner: 99, failedOuter: 0});

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
