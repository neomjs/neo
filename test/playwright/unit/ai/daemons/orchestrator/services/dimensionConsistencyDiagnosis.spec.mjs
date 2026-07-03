import {test, expect}                       from '@playwright/test';
import Neo                                  from '../../../../../../../src/Neo.mjs';
import * as core                            from '../../../../../../../src/core/_export.mjs';
import {buildDimensionConsistencyDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/dimensionConsistencyDiagnosis.mjs';

// Pure detect-producer (no I/O). A stored vector whose dimension ≠ the configured embedding dimension is
// unambiguous corruption → a data-integrity recovery-diagnosis; all-matching samples → null.

test.describe('buildDimensionConsistencyDiagnosis — embedding-dimension consistency detect-producer', () => {
    test('a collection holding mismatched-dimension vectors -> a data-integrity recovery-diagnosis', () => {
        const diag = buildDimensionConsistencyDiagnosis({
            samples: [
                {collection: 'neo-agent-memory',   expectedDimension: 4096, mismatchedVectorCount: 12},
                {collection: 'neo-agent-sessions', expectedDimension: 4096, mismatchedVectorCount: 0}
            ],
            observedAt: 1000,
            serviceId : 'memory-core'
        });

        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:dimension-mismatch:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-dimension-monitor',
            details       : {reasonCode: 'data-integrity-dimension-mismatch', mismatchedCollections: ['neo-agent-memory']}
        });
        expect(diag.details.actionClass).toBeUndefined(); // raw evidence for the autonomous classifier — the producer no longer escalates
        expect(diag.evidenceFacts).toEqual([
            {type: 'vector-dimension-mismatch', collection: 'neo-agent-memory', expectedDimension: 4096, mismatchedVectorCount: 12}
        ]);
    });

    test('diagnosisId is target+instant scoped — two services mismatching at the same instant get distinct ids', () => {
        const args = {samples: [{collection: 'c', expectedDimension: 4096, mismatchedVectorCount: 1}], observedAt: 1000},
              a    = buildDimensionConsistencyDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildDimensionConsistencyDiagnosis({...args, serviceId: 'knowledge-base'});

        expect(a.diagnosisId).toBe('data-integrity:memory-core:dimension-mismatch:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:dimension-mismatch:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('all-matching samples (mismatchedVectorCount 0) -> null (no false positive)', () => {
        expect(buildDimensionConsistencyDiagnosis({
            samples: [
                {collection: 'neo-agent-memory',   expectedDimension: 4096, mismatchedVectorCount: 0},
                {collection: 'neo-agent-sessions', expectedDimension: 4096, mismatchedVectorCount: 0}
            ],
            observedAt: 1000,
            serviceId : 'memory-core'
        })).toBeNull();
    });

    test('empty / absent samples -> null', () => {
        expect(buildDimensionConsistencyDiagnosis({samples: [], observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildDimensionConsistencyDiagnosis({observedAt: 1, serviceId: 'mc'})).toBeNull();
    });

    test('samples with a non-finite or absent mismatchedVectorCount are ignored — an unread collection is not corruption', () => {
        expect(buildDimensionConsistencyDiagnosis({
            samples: [
                {collection: 'unread',   expectedDimension: 4096},                            // count not yet audited
                {collection: 'unknown',  expectedDimension: 4096, mismatchedVectorCount: null}
            ],
            observedAt: 1,
            serviceId : 'mc'
        })).toBeNull();
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildDimensionConsistencyDiagnosis({
            samples: [{collection: 'c', expectedDimension: 4096, mismatchedVectorCount: 1}], observedAt: 1, serviceId: 'mc'
        });
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildDimensionConsistencyDiagnosis({samples: [], observedAt: 1})).toThrow('serviceId');
        expect(() => buildDimensionConsistencyDiagnosis({samples: [], serviceId: 'mc'})).toThrow('observedAt');
    });
});
