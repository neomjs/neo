import {test, expect}                from '@playwright/test';
import {CONTAINER_HEALTH_FACT_TYPES} from '../../../../../../../ai/daemons/orchestrator/services/containerHealthFactTypes.mjs';
import {
    deriveMemoryPressure,
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
 * The load-bearing cases are the two `unknown` ones. Degrading on a withdrawn authority would launder
 * a reading the diagnosis service explicitly refused to let speak, and degrading on an absent
 * diagnosis would assert a ceiling nobody measured — both convert "we do not know" into a verdict,
 * which is the failure this whole surface exists to stop.
 */
test.describe('memoryPressureDisposition (#17121)', () => {
    const saturationFact = (overrides = {}) => ({
        type         : CONTAINER_HEALTH_FACT_TYPES.memorySaturation,
        authoritative: true,
        serviceKey   : 'embedding-model',
        observedAt   : 1_700_000_000_000,
        details      : {
            scope           : 'container',
            threshold       : 90,
            minPercent      : 99.8,
            sampleCount     : 6,
            observedWindowMs: 300_000,
            requiredWindowMs: 120_000
        },
        ...overrides
    });

    test('a sustained authoritative saturation fact is at-cap, with a receipt an operator can act on', () => {
        const {disposition, receipt} = deriveMemoryPressure({diagnosis: {facts: [saturationFact()]}});

        expect(disposition).toBe('at-cap');
        // Which service, against what limit, for how long — and the MEASURED window beside the
        // required one, because publishing only the configured value puts an unobserved claim inside
        // the evidence a decision reads.
        expect(receipt).toMatchObject({
            metric          : 'memory',
            minPercent      : 99.8,
            observedWindowMs: 300_000,
            requiredWindowMs: 120_000,
            scope           : 'container',
            serviceKey      : 'embedding-model',
            threshold       : 90
        });
    });

    test('no saturation fact is below — the question was asked and answered', () => {
        const {disposition, receipt} = deriveMemoryPressure({
            diagnosis: {facts: [{type: CONTAINER_HEALTH_FACT_TYPES.restartChurn, authoritative: true}]}
        });

        expect(disposition).toBe('below');
        expect(receipt).toBeNull();
    });

    test('a NON-authoritative saturation fact is unknown, never below', () => {
        // The diagnosis service withdraws authority when a cgroup total may describe PID 1 plus forks
        // rather than the service. The ceiling may well be crossed; only the attribution is unsafe. So
        // the honest reading is "cannot say", and calling it `below` would mint a healthy claim from a
        // number the producer already refused to stand behind.
        const {disposition, receipt} = deriveMemoryPressure({
            diagnosis: {facts: [saturationFact({authoritative: false})]}
        });

        expect(disposition).toBe('unknown');
        expect(receipt).toBeNull();
    });

    test('an ABSENT diagnosis is unknown, never below', () => {
        // No diagnosis is not a diagnosis reporting no pressure. Answering `below` here would assert a
        // healthy ceiling nobody measured.
        for (const diagnosis of [null, undefined, {}, {facts: null}]) {
            expect(deriveMemoryPressure({diagnosis}).disposition, JSON.stringify(diagnosis) ?? 'undefined').toBe('unknown');
        }

        expect(deriveMemoryPressure({}).disposition, 'no argument at all').toBe('unknown');
    });

    test('an EMPTY fact list is below — the diagnosis ran and found nothing', () => {
        expect(deriveMemoryPressure({diagnosis: {facts: []}}).disposition).toBe('below');
    });

    test('at-cap degrades an otherwise available service — the whole point', () => {
        expect(foldMemoryPressureIntoStatus({status: 'available', disposition: 'at-cap'})).toBe('degraded');
    });

    test('unknown and below NEVER degrade', () => {
        // The rule most likely to be broken by a later edit, asserted on its own so breaking it cannot
        // hide inside a diagnosis fixture.
        for (const disposition of ['unknown', 'below', null, undefined]) {
            expect(foldMemoryPressureIntoStatus({status: 'available', disposition}), `${disposition}`).toBe('available');
        }
    });

    test('an already-degraded status is never upgraded by a healthy disposition', () => {
        for (const disposition of ['below', 'unknown', 'at-cap']) {
            expect(foldMemoryPressureIntoStatus({status: 'degraded', disposition}), `${disposition}`).toBe('degraded');
        }
    });

    test('the incident reproduces: at-cap with no errors reads degraded, where it previously read available', () => {
        // The regression this exists to prevent, stated as the incident rather than as a unit: a lane
        // at its ceiling, zero errors, every probe passing.
        const errorsLength          = 0,
              statusFromErrorsAlone = errorsLength > 0 ? 'degraded' : 'available',
              {disposition}         = deriveMemoryPressure({diagnosis: {facts: [saturationFact()]}});

        expect(statusFromErrorsAlone, 'what the old rule computed').toBe('available');
        expect(foldMemoryPressureIntoStatus({status: statusFromErrorsAlone, disposition})).toBe('degraded');
    });
});
