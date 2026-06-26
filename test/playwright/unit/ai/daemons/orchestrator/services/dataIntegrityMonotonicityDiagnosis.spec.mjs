import {test, expect}                            from '@playwright/test';
import Neo                                       from '../../../../../../../src/Neo.mjs';
import * as core                                 from '../../../../../../../src/core/_export.mjs';
import {buildDataIntegrityMonotonicityDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/dataIntegrityMonotonicityDiagnosis.mjs';

// Pure detect-producer (no I/O). Compares current-vs-previous per-collection vector counts; an append-mostly
// DECREASE → a data-integrity recovery-diagnosis (escalate); flat/rising or missing-prior → null (the class's 2nd leaf).

test.describe('buildDataIntegrityMonotonicityDiagnosis — vector-count monotonicity detect-producer', () => {
    test('a count decrease -> a data-integrity/escalate recovery-diagnosis with per-collection regression evidence', () => {
        const diag = buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {'neo-agent-memory': 22636, 'neo-agent-sessions': 1408},
            currentCounts : {'neo-agent-memory': 8583,  'neo-agent-sessions': 1408},  // memory dropped ~14k (the recovery-incident shape)
            observedAt    : 1000,
            serviceId     : 'memory-core'
        });
        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:vector-count-regression:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-monotonicity-monitor',
            details       : {actionClass: 'escalate', reasonCode: 'data-integrity-vector-count-regression', regressedCollections: ['neo-agent-memory']}
        });
        expect(diag.evidenceFacts).toEqual([
            {type: 'vector-count-regression', collection: 'neo-agent-memory', previousCount: 22636, currentCount: 8583, delta: -14053}
        ]);
    });

    test('flat or rising counts -> null (append-mostly growth is healthy, never a false escalation)', () => {
        expect(buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {'neo-agent-memory': 22636},
            currentCounts : {'neo-agent-memory': 22640},  // rising
            observedAt    : 1000,
            serviceId     : 'memory-core'
        })).toBeNull();
        expect(buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {'neo-agent-memory': 22636},
            currentCounts : {'neo-agent-memory': 22636},  // flat
            observedAt    : 1000,
            serviceId     : 'memory-core'
        })).toBeNull();
    });

    test('no prior sample for a collection -> null (no false escalation on first run)', () => {
        expect(buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {},                              // first run — nothing to compare
            currentCounts : {'neo-agent-memory': 22636},
            observedAt    : 1000,
            serviceId     : 'memory-core'
        })).toBeNull();
        // A newly-appearing collection (present now, absent before) is not a regression.
        expect(buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {'neo-agent-memory': 22636},
            currentCounts : {'neo-agent-memory': 22636, 'neo-agent-sessions': 1408},
            observedAt    : 1000,
            serviceId     : 'memory-core'
        })).toBeNull();
    });

    test('diagnosisId is target-scoped — two services regressing at the same instant get distinct ids', () => {
        const args = {previousCounts: {c: 10}, currentCounts: {c: 5}, observedAt: 1000},
              a    = buildDataIntegrityMonotonicityDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildDataIntegrityMonotonicityDiagnosis({...args, serviceId: 'knowledge-base'});

        expect(a.diagnosisId).toBe('data-integrity:memory-core:vector-count-regression:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:vector-count-regression:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildDataIntegrityMonotonicityDiagnosis({
            previousCounts: {c: 10}, currentCounts: {c: 5}, observedAt: 1, serviceId: 'mc'
        });
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildDataIntegrityMonotonicityDiagnosis({previousCounts: {}, currentCounts: {}, observedAt: 1})).toThrow('serviceId');
        expect(() => buildDataIntegrityMonotonicityDiagnosis({previousCounts: {}, currentCounts: {}, serviceId: 'mc'})).toThrow('observedAt');
    });
});
