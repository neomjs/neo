import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../../src/core/_export.mjs';
import {DataIntegrityDiagnosisService} from '../../../../../../../ai/daemons/orchestrator/services/DataIntegrityDiagnosisService.mjs';

const OBSERVED_AT = 1710000000000;

/**
 * Records every actuator surface reached so a test can assert detect-only behavior:
 * `escalateDiagnosis` is expected; `apply` (the privileged path) must never be called.
 */
function fakeActuator() {
    const calls = {escalate: [], apply: []};

    return {
        calls,
        async escalateDiagnosis(diagnosisEvent, options) {
            calls.escalate.push({diagnosisEvent, options});
            return {
                status        : 'escalated',
                reasonCode    : diagnosisEvent.details?.reasonCode || 'diagnosis-escalation',
                targetIdentity: diagnosisEvent.targetIdentity
            };
        },
        async apply(...args) {
            calls.apply.push(args);
            return {status: 'actioned'};
        }
    };
}

function coverage({ok}) {
    return {
        collections: [{
            name                  : 'neo-agent-memory',
            ok,
            missingFromVectorCount: ok ? 0 : 2000,
            extraInVectorCount    : 0
        }],
        failedCollections       : ok ? 0 : 1,
        duplicateCollectionNames: []
    };
}

/**
 * Per-collection dimension samples in the `auditCollectionVectorDimensions` shape the producer consumes.
 * `mismatched: true` reports a wrong-dimension vector (corruption → escalate); `false` is clean.
 */
function dimensionSamples({mismatched}) {
    return [{
        collection           : 'neo-agent-memory',
        expectedDimension    : 4096,
        mismatchedVectorCount: mismatched ? 5 : 0
    }];
}

function createService(config = {}) {
    return Neo.create(DataIntegrityDiagnosisService, {
        serviceId: 'memory-core',
        nowFn    : () => OBSERVED_AT,
        ...config
    });
}

test.describe('Neo.ai.daemons.services.DataIntegrityDiagnosisService', () => {
    test('clean coverage → healthy decision, nothing escalated', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => coverage({ok: true}),
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({
            recordType: 'data-integrity-diagnosis-decision',
            serviceId : 'memory-core',
            observedAt: OBSERVED_AT,
            status    : 'healthy'
        });
        expect(decision.diagnoses).toHaveLength(0);
        expect(decision.escalations).toHaveLength(0);
        expect(actuator.calls.escalate).toHaveLength(0);
        expect(actuator.calls.apply).toHaveLength(0);
    });

    test('coverage drift → routes a data-integrity/escalate diagnosis to escalateDiagnosis', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => coverage({ok: false}),
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('escalated');
        expect(decision.diagnoses).toHaveLength(1);
        expect(decision.diagnoses[0]).toMatchObject({
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            details       : {actionClass: 'escalate'}
        });
        expect(decision.diagnoses[0].evidenceFacts).toContainEqual(
            expect.objectContaining({type: 'vector-coverage-drift', collection: 'neo-agent-memory'})
        );

        expect(actuator.calls.escalate).toHaveLength(1);
        expect(actuator.calls.escalate[0].diagnosisEvent.recoveryClass).toBe('data-integrity');
        expect(decision.escalations[0]).toMatchObject({status: 'escalated'});
    });

    test('detect-only: never reaches the privileged apply path, even on drift', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => coverage({ok: false}),
                  recoveryActuator: actuator
              });

        await service.gatherAndDiagnose();

        expect(actuator.calls.apply).toHaveLength(0);
        expect(actuator.calls.escalate).toHaveLength(1);
    });

    test('probe-unavailable: a failing gatherer escalates NOTHING (failed probe ≠ drift signal)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => { throw new Error('Chroma unreachable'); },
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision).toMatchObject({
            status    : 'probe-unavailable',
            probeError: 'Chroma unreachable'
        });
        expect(decision.diagnoses).toHaveLength(0);
        expect(actuator.calls.escalate).toHaveLength(0);
        expect(actuator.calls.apply).toHaveLength(0);
    });

    test('threads the injected clock into the diagnosis id and the escalate call', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => coverage({ok: false}),
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.diagnoses[0].diagnosisId).toBe(`data-integrity:memory-core:coverage-drift:${OBSERVED_AT}`);
        expect(decision.diagnoses[0].observedAt).toBe(OBSERVED_AT);
        expect(actuator.calls.escalate[0].options).toMatchObject({now: OBSERVED_AT});
    });

    test('fail-closed: a missing coverageGatherer throws', async () => {
        const service = createService({recoveryActuator: fakeActuator()});

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/coverageGatherer is required/);
    });

    test('fail-closed: a recoveryActuator without escalateDiagnosis throws', async () => {
        const service = createService({
            coverageGatherer: async () => coverage({ok: true}),
            recoveryActuator: {}
        });

        await expect(service.gatherAndDiagnose()).rejects.toThrow(/recoveryActuator with escalateDiagnosis/);
    });

    test('dimension mismatch → routes a data-integrity dimension diagnosis to escalateDiagnosis', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer : async () => coverage({ok: true}),
                  dimensionGatherer: async () => dimensionSamples({mismatched: true}),
                  recoveryActuator : actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('escalated');
        expect(decision.diagnoses).toHaveLength(1);
        expect(decision.diagnoses[0]).toMatchObject({
            recoveryClass : 'data-integrity',
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            details       : {actionClass: 'escalate', reasonCode: 'data-integrity-dimension-mismatch'}
        });
        expect(decision.diagnoses[0].diagnosisId).toBe(`data-integrity:memory-core:dimension-mismatch:${OBSERVED_AT}`);
        expect(decision.diagnoses[0].evidenceFacts).toContainEqual(
            expect.objectContaining({type: 'vector-dimension-mismatch', collection: 'neo-agent-memory', mismatchedVectorCount: 5})
        );
        expect(actuator.calls.escalate).toHaveLength(1);
        expect(actuator.calls.apply).toHaveLength(0);
    });

    test('clean dimension samples → no dimension diagnosis (never a false escalation)', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer : async () => coverage({ok: true}),
                  dimensionGatherer: async () => dimensionSamples({mismatched: false}),
                  recoveryActuator : actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('healthy');
        expect(decision.diagnoses).toHaveLength(0);
        expect(actuator.calls.escalate).toHaveLength(0);
    });

    test('coverage drift AND dimension mismatch → both diagnoses escalated', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer : async () => coverage({ok: false}),
                  dimensionGatherer: async () => dimensionSamples({mismatched: true}),
                  recoveryActuator : actuator
              });

        const decision = await service.gatherAndDiagnose();

        expect(decision.status).toBe('escalated');
        expect(decision.diagnoses).toHaveLength(2);
        expect(decision.escalations).toHaveLength(2);
        expect(actuator.calls.escalate).toHaveLength(2);
        expect(decision.diagnoses.map(diagnosis => diagnosis.details.reasonCode))
            .toContain('data-integrity-dimension-mismatch');
    });

    test('a throwing dimension gatherer is skipped — coverage still runs, never probe-unavailable', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer : async () => coverage({ok: false}),
                  dimensionGatherer: async () => { throw new Error('Chroma read failed'); },
                  recoveryActuator : actuator
              });

        const decision = await service.gatherAndDiagnose();

        // The secondary dimension probe failing must NOT suppress the primary coverage signal.
        expect(decision.status).toBe('escalated');
        expect(decision.diagnoses).toHaveLength(1);
        expect(decision.diagnoses[0].evidenceFacts).toContainEqual(
            expect.objectContaining({type: 'vector-coverage-drift'})
        );
    });

    test('absent dimension gatherer → dimension skipped (backward-compatible), coverage unaffected', async () => {
        const actuator = fakeActuator(),
              service  = createService({
                  coverageGatherer: async () => coverage({ok: true}),
                  recoveryActuator: actuator
              });

        const decision = await service.gatherAndDiagnose();

        // No dimensionGatherer injected (the live-Chroma binding not wired) → no dimension diagnosis, no error.
        expect(decision.status).toBe('healthy');
        expect(decision.diagnoses).toHaveLength(0);
    });
});
