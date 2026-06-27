import {test, expect}                          from '@playwright/test';
import Neo                                     from '../../../../../../../src/Neo.mjs';
import * as core                               from '../../../../../../../src/core/_export.mjs';
import {buildVectorCountMonotonicityDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/vectorCountMonotonicityDiagnosis.mjs';

// Pure detect-producer (no I/O). Memory Core collections are append-mostly, so a vector-count DECREASE
// between samples is a near-unambiguous, threshold-free data-loss signal → a data-integrity
// recovery-diagnosis; monotonic samples → null.

test.describe('buildVectorCountMonotonicityDiagnosis — vector-count monotonicity detect-producer', () => {
    test('a collection whose vector count regressed -> a data-integrity recovery-diagnosis', () => {
        const diag = buildVectorCountMonotonicityDiagnosis({
            samples: [
                {collection: 'neo-agent-memory',   previousCount: 18835, currentCount: 7000},
                {collection: 'neo-agent-sessions', previousCount: 1408,  currentCount: 1408}
            ],
            observedAt: 1000,
            serviceId : 'memory-core'
        });

        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:vector-count-regression:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-monotonicity-monitor',
            details       : {reasonCode: 'data-integrity-vector-count-regression', regressedCollections: ['neo-agent-memory']}
        });
        expect(diag.details.actionClass).toBeUndefined(); // raw evidence for the autonomous classifier — the producer no longer escalates
        expect(diag.evidenceFacts).toEqual([
            {type: 'vector-count-regression', collection: 'neo-agent-memory', previousCount: 18835, currentCount: 7000, lost: 11835}
        ]);
    });

    test('diagnosisId is target+instant scoped — two services regressing at the same instant get distinct ids', () => {
        const args = {samples: [{collection: 'c', previousCount: 10, currentCount: 1}], observedAt: 1000},
              a    = buildVectorCountMonotonicityDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildVectorCountMonotonicityDiagnosis({...args, serviceId: 'knowledge-base'});

        expect(a.diagnosisId).toBe('data-integrity:memory-core:vector-count-regression:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:vector-count-regression:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('all-monotonic samples (current >= previous) -> null (no false positive)', () => {
        expect(buildVectorCountMonotonicityDiagnosis({
            samples: [
                {collection: 'neo-agent-memory',   previousCount: 100, currentCount: 100},  // equal — not a loss
                {collection: 'neo-agent-sessions', previousCount: 100, currentCount: 150}   // grew — append-mostly
            ],
            observedAt: 1000,
            serviceId : 'memory-core'
        })).toBeNull();
    });

    test('empty / absent samples -> null', () => {
        expect(buildVectorCountMonotonicityDiagnosis({samples: [], observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildVectorCountMonotonicityDiagnosis({observedAt: 1, serviceId: 'mc'})).toBeNull();
    });

    test('samples with a non-finite or missing count are ignored — a missing baseline is not a loss', () => {
        expect(buildVectorCountMonotonicityDiagnosis({
            samples: [
                {collection: 'fresh',   currentCount: 5},                        // no previousCount (first sample)
                {collection: 'unknown', previousCount: 10, currentCount: null}   // unread current count
            ],
            observedAt: 1,
            serviceId : 'mc'
        })).toBeNull();
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildVectorCountMonotonicityDiagnosis({
            samples: [{collection: 'c', previousCount: 2, currentCount: 1}], observedAt: 1, serviceId: 'mc'
        });
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildVectorCountMonotonicityDiagnosis({samples: [], observedAt: 1})).toThrow('serviceId');
        expect(() => buildVectorCountMonotonicityDiagnosis({samples: [], serviceId: 'mc'})).toThrow('observedAt');
    });
});
