import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../../src/core/_export.mjs';
import {DataIntegrityDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs';

const OBSERVED_AT = 1710000000000;

/**
 * Records every actuator surface reached so a test can assert SELF-HEAL behavior: `applyHeal` is the only
 * sink — there is no `escalateDiagnosis`/operator path by construction.
 */
function fakeActuator({failOn = null} = {}) {
    const calls = {applyHeal: []};

    return {
        calls,
        async applyHeal({action, collection, evidence, now}) {
            calls.applyHeal.push({action, collection, evidence, now});
            if (failOn && failOn === collection) {
                throw new Error(`heal failed for ${collection}`);
            }
            return {status: 'healed', action};
        }
    };
}

/** A clean per-collection evidence row. */
function clean(collection = 'neo-agent-memory') {
    return {collection, rowCount: 1000};
}

/** A WAL-stall row: metadata-without-vector, documents intact → autonomous re-embed-missing. */
function walStall(collection = 'neo-agent-memory') {
    return {collection, rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 200};
}

function createService(config = {}) {
    return Neo.create(DataIntegrityDiagnosisService, {
        serviceId: 'memory-core',
        nowFn    : () => OBSERVED_AT,
        ...config
    });
}

test.describe('Neo.ai.daemons.services.DataIntegrityDiagnosisService', () => {
    test('clean evidence → clean decision, nothing healed', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [clean()],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({
            recordType: 'data-integrity-self-heal-decision',
            serviceId : 'memory-core',
            observedAt: OBSERVED_AT,
            status    : 'clean'
        });
        expect(decision.heals).toHaveLength(0);
        expect(actuator.calls.applyHeal).toHaveLength(0);
    });

    test('WAL-stall → routes an autonomous re-embed-missing heal to applyHeal (no escalate)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(decision.heals).toHaveLength(1);
        expect(decision.heals[0]).toMatchObject({collection: 'neo-agent-memory', action: 're-embed-missing', mode: 'wal-stall'});
        expect(actuator.calls.applyHeal).toHaveLength(1);
        expect(actuator.calls.applyHeal[0]).toMatchObject({action: 're-embed-missing', collection: 'neo-agent-memory', now: OBSERVED_AT});
        expect(actuator.calls.applyHeal[0].evidence).toMatchObject({missingFromVectorCount: 200, documentsPresentCount: 200});
    });

    test('wipe (docs gone) → restore-delta-merge; systemic mismatch → freeze (never mass re-embed)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [
                      {collection: 'neo-agent-memory',   rowCount: 1000, missingFromVectorCount: 200, documentsPresentCount: 0},
                      {collection: 'neo-agent-sessions', rowCount: 1000, mismatchedVectorCount: 900}
                  ],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        const actions = decision.heals.map(h => h.action);
        expect(actions).toContain('restore-delta-merge');
        expect(actions).toContain('freeze');
        expect(actuator.calls.applyHeal).toHaveLength(2);
    });

    test('probe-unavailable: a failing gatherer heals NOTHING (failed probe ≠ corruption signal)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => { throw new Error('Chroma unreachable'); },
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({status: 'probe-unavailable', probeError: 'Chroma unreachable'});
        expect(decision.heals).toHaveLength(0);
        expect(actuator.calls.applyHeal).toHaveLength(0);
    });

    test('a single heal failure is recorded, not thrown — the cycle still heals the other collections', async () => {
        const actuator = fakeActuator({failOn: 'neo-agent-memory'}),
              service  = createService({
                  evidenceGatherer: async () => [walStall('neo-agent-memory'), walStall('neo-agent-sessions')],
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healed');
        expect(decision.heals).toHaveLength(2);
        const memHeal = decision.heals.find(h => h.collection === 'neo-agent-memory');
        expect(memHeal.outcome).toMatchObject({status: 'failed'});
        const sessHeal = decision.heals.find(h => h.collection === 'neo-agent-sessions');
        expect(sessHeal.outcome).toMatchObject({status: 'healed'});
    });

    test('INVARIANT: the runner reaches applyHeal ONLY — there is no escalate/operator sink', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        await service.gatherAndDiagnose();

        // The fake actuator exposes no escalateDiagnosis; the runner must only ever call applyHeal.
        expect(typeof actuator.escalateDiagnosis).toBe('undefined');
        expect(actuator.calls.applyHeal).toHaveLength(1);
    });

    test('threads the injected clock into every heal call', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  evidenceGatherer: async () => [walStall()],
                  recoveryActuator: actuator
              });

        await service.gatherAndDiagnose();

        expect(actuator.calls.applyHeal[0].now).toBe(OBSERVED_AT);
    });

    test('fail-closed: a missing evidenceGatherer throws', async () => {
        const service = createService({recoveryActuator: fakeActuator()});

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/evidenceGatherer is required/);
    });

    test('fail-closed: a recoveryActuator without applyHeal throws', async () => {
        const service = createService({
            evidenceGatherer: async () => [clean()],
            recoveryActuator: {}
        });

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/recoveryActuator with applyHeal/);
    });
});
