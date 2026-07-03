import {test, expect}             from '@playwright/test';
import Neo                        from '../../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../../src/core/_export.mjs';
import {buildStoreBloatDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/storeBloatDiagnosis.mjs';

// Pure detect-producer (no I/O). Turns a store-size measurement + thresholds into a data-integrity
// recovery-diagnosis when the store is over its absolute budget OR grew too fast since the previous sample;
// null when within budget.

const THRESHOLDS = {absoluteBytes: 2_000_000_000, growthRatio: 0.25};  // 2GB absolute, 25% growth

test.describe('buildStoreBloatDiagnosis — data-integrity store-size bloat detect-producer', () => {
    test('over the absolute budget -> a data-integrity recovery-diagnosis', () => {
        const diag = buildStoreBloatDiagnosis({
            storeSizeBytes: 2_500_000_000,  // 2.5GB > 2GB
            thresholds    : THRESHOLDS,
            observedAt    : 1000,
            serviceId     : 'memory-core'
        });
        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:store-bloat:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-store-bloat-monitor',
            details       : {reasonCode: 'data-integrity-store-bloat', triggeredSignals: ['absolute']}
        });
        expect(diag.details.actionClass).toBeUndefined(); // raw evidence for the autonomous classifier — the producer no longer escalates
        expect(diag.evidenceFacts).toEqual([
            {type: 'store-bloat', signal: 'absolute', storeSizeBytes: 2_500_000_000, thresholdBytes: 2_000_000_000}
        ]);
    });

    test('grew faster than the growth-ratio budget -> a growth-signal diagnosis (even under the absolute budget)', () => {
        const diag = buildStoreBloatDiagnosis({
            storeSizeBytes   : 1_400_000_000,  // under 2GB absolute
            previousSizeBytes: 1_000_000_000, // +40% > 25%
            thresholds       : THRESHOLDS,
            observedAt       : 1000,
            serviceId        : 'memory-core'
        });
        expect(diag.details.triggeredSignals).toEqual(['growth']);
        expect(diag.evidenceFacts[0]).toMatchObject({
            type: 'store-bloat', signal: 'growth', storeSizeBytes: 1_400_000_000, previousSizeBytes: 1_000_000_000, thresholdRatio: 0.25
        });
        expect(diag.evidenceFacts[0].observedGrowth).toBeCloseTo(0.4, 5);
    });

    test('both absolute + growth crossed -> both signals carried', () => {
        const diag = buildStoreBloatDiagnosis({
            storeSizeBytes   : 3_000_000_000,  // over 2GB
            previousSizeBytes: 2_000_000_000, // +50% > 25%
            thresholds       : THRESHOLDS, observedAt: 1, serviceId: 'mc'
        });
        expect(diag.details.triggeredSignals).toEqual(['absolute', 'growth']);
        expect(diag.evidenceFacts).toHaveLength(2);
    });

    test('within budget (absolute + growth both under) -> null (no false positive)', () => {
        expect(buildStoreBloatDiagnosis({
            storeSizeBytes   : 1_100_000_000,  // under 2GB
            previousSizeBytes: 1_000_000_000, // +10% < 25%
            thresholds       : THRESHOLDS, observedAt: 1000, serviceId: 'memory-core'
        })).toBeNull();
    });

    test('missing previousSizeBytes -> absolute-only (growth sub-signal disabled)', () => {
        const overAbsolute  = buildStoreBloatDiagnosis({storeSizeBytes: 2_500_000_000, thresholds: THRESHOLDS, observedAt: 1, serviceId: 'mc'}),
              underAbsolute = buildStoreBloatDiagnosis({storeSizeBytes: 1_000_000_000, thresholds: THRESHOLDS, observedAt: 1, serviceId: 'mc'});

        expect(overAbsolute.details.triggeredSignals).toEqual(['absolute']);
        expect(underAbsolute).toBeNull();  // no previous sample → no growth signal → within absolute budget → null
    });

    test('a non-finite threshold disables its sub-signal (graceful)', () => {
        // Only a growth threshold configured → an over-absolute store does NOT fire (absolute disabled).
        expect(buildStoreBloatDiagnosis({
            storeSizeBytes: 9_000_000_000, thresholds: {growthRatio: 0.25}, observedAt: 1, serviceId: 'mc'
        })).toBeNull();
    });

    test('non-finite storeSizeBytes (no measurement) -> null', () => {
        expect(buildStoreBloatDiagnosis({storeSizeBytes: undefined, thresholds: THRESHOLDS, observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildStoreBloatDiagnosis({thresholds: THRESHOLDS, observedAt: 1, serviceId: 'mc'})).toBeNull();
    });

    test('diagnosisId is target-scoped — two services bloating at the same instant get distinct ids', () => {
        const args = {storeSizeBytes: 3_000_000_000, thresholds: THRESHOLDS, observedAt: 1000},
              a    = buildStoreBloatDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildStoreBloatDiagnosis({...args, serviceId: 'knowledge-base'});
        expect(a.diagnosisId).toBe('data-integrity:memory-core:store-bloat:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:store-bloat:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildStoreBloatDiagnosis({storeSizeBytes: 3_000_000_000, thresholds: THRESHOLDS, observedAt: 1, serviceId: 'mc'});
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildStoreBloatDiagnosis({storeSizeBytes: 1, thresholds: THRESHOLDS, observedAt: 1})).toThrow('serviceId');
        expect(() => buildStoreBloatDiagnosis({storeSizeBytes: 1, thresholds: THRESHOLDS, serviceId: 'mc'})).toThrow('observedAt');
    });
});
