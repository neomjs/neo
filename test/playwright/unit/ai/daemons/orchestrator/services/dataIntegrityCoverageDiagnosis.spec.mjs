import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../../src/core/_export.mjs';
import {buildDataIntegrityCoverageDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityCoverageDiagnosis.mjs';

// Pure detect-producer (no I/O). Turns a Chroma vector-coverage audit into a data-integrity
// recovery-diagnosis when a collection is "up but data-gutted"; returns null when clean.

test.describe('buildDataIntegrityCoverageDiagnosis — data-integrity coverage-drift detect-producer', () => {
    test('drift (a collection with ok:false) -> a data-integrity recovery-diagnosis', () => {
        const diag = buildDataIntegrityCoverageDiagnosis({
            coverageResult: {collections: [
                {name: 'neo-agent-memory',   ok: false, missingFromVectorCount: 10, extraInVectorCount: 0},
                {name: 'neo-knowledge-base', ok: true,  missingFromVectorCount: 0,  extraInVectorCount: 0}
            ]},
            observedAt: 1000,
            serviceId : 'memory-core'
        });
        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:coverage-drift:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-coverage-monitor',
            details       : {reasonCode: 'data-integrity-coverage-drift', driftedCollections: ['neo-agent-memory']}
        });
        expect(diag.details.actionClass).toBeUndefined(); // raw evidence for the autonomous classifier — the producer no longer escalates
        expect(diag.evidenceFacts).toEqual([
            {type: 'vector-coverage-drift', collection: 'neo-agent-memory', missingFromVectorCount: 10, extraInVectorCount: 0}
        ]);
    });

    test('diagnosisId is target-scoped — two services drifting at the same instant get distinct ids (no graph-node collision)', () => {
        const args = {coverageResult: {collections: [{name: 'c', ok: false}]}, observedAt: 1000},
              a    = buildDataIntegrityCoverageDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildDataIntegrityCoverageDiagnosis({...args, serviceId: 'knowledge-base'});

        expect(a.diagnosisId).toBe('data-integrity:memory-core:coverage-drift:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:coverage-drift:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('clean coverage (all ok:true) -> null (no false positive)', () => {
        expect(buildDataIntegrityCoverageDiagnosis({
            coverageResult: {collections: [{name: 'neo-agent-memory', ok: true}]},
            observedAt    : 1000,
            serviceId     : 'memory-core'
        })).toBeNull();
    });

    test('empty / absent coverage -> null', () => {
        expect(buildDataIntegrityCoverageDiagnosis({coverageResult: {collections: []}, observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildDataIntegrityCoverageDiagnosis({coverageResult: {}, observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildDataIntegrityCoverageDiagnosis({observedAt: 1, serviceId: 'mc'})).toBeNull();
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildDataIntegrityCoverageDiagnosis({
            coverageResult: {collections: [{name: 'c', ok: false}]},
            observedAt    : 1,
            serviceId     : 'mc'
        });
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildDataIntegrityCoverageDiagnosis({coverageResult: {collections: []}, observedAt: 1})).toThrow('serviceId');
        expect(() => buildDataIntegrityCoverageDiagnosis({coverageResult: {collections: []}, serviceId: 'mc'})).toThrow('observedAt');
    });
});
