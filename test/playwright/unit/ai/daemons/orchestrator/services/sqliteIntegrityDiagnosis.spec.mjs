import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../../src/core/_export.mjs';
import {buildSqliteIntegrityDiagnosis} from '../../../../../../../ai/daemons/orchestrator/services/sqliteIntegrityDiagnosis.mjs';

// Pure detect-producer (no I/O). Turns a Chroma SQLite quick_check/integrity_check audit into a
// data-integrity recovery-diagnosis when the store's SQLite integrity is broken (a malformed
// FTS5 index — the corruption-incident forensic shape); returns null when every check passes.

test.describe('buildSqliteIntegrityDiagnosis — data-integrity SQLite-integrity detect-producer', () => {
    test('a failed integrity check -> a data-integrity recovery-diagnosis', () => {
        const diag = buildSqliteIntegrityDiagnosis({
            sqliteResult: {checks: [
                {pragma: 'quick_check',     ok: false, output: 'malformed inverted index for FTS5 table main.embedding_fulltext_search'},
                {pragma: 'integrity_check', ok: false, output: 'malformed inverted index for FTS5 table main.embedding_fulltext_search'}
            ]},
            observedAt: 1000,
            serviceId : 'memory-core'
        });
        expect(diag).toMatchObject({
            diagnosisId   : 'data-integrity:memory-core:sqlite-integrity:1000',
            type          : 'recovery-diagnosis',
            recoveryClass : 'data-integrity',
            confidence    : 1,
            targetIdentity: {kind: 'compose-service', id: 'memory-core'},
            source        : 'data-integrity-sqlite-integrity-monitor',
            details       : {reasonCode: 'data-integrity-sqlite-integrity-failure', failedPragmas: ['quick_check', 'integrity_check']}
        });
        expect(diag.details.actionClass).toBeUndefined(); // raw evidence for the autonomous classifier — the producer no longer escalates
        expect(diag.evidenceFacts[0]).toMatchObject({type: 'sqlite-integrity-failure', pragma: 'quick_check'});
        expect(diag.evidenceFacts[0].detail).toContain('malformed inverted index');
    });

    test('diagnosisId is target-scoped — two services failing at the same instant get distinct ids (no graph-node collision)', () => {
        const args = {sqliteResult: {checks: [{pragma: 'integrity_check', ok: false, output: 'malformed'}]}, observedAt: 1000},
              a    = buildSqliteIntegrityDiagnosis({...args, serviceId: 'memory-core'}),
              b    = buildSqliteIntegrityDiagnosis({...args, serviceId: 'knowledge-base'});

        expect(a.diagnosisId).toBe('data-integrity:memory-core:sqlite-integrity:1000');
        expect(b.diagnosisId).toBe('data-integrity:knowledge-base:sqlite-integrity:1000');
        expect(a.diagnosisId).not.toBe(b.diagnosisId);
    });

    test('clean integrity (all checks ok) -> null (no false positive)', () => {
        expect(buildSqliteIntegrityDiagnosis({
            sqliteResult: {checks: [
                {pragma: 'quick_check',     ok: true, output: 'ok'},
                {pragma: 'integrity_check', ok: true, output: 'ok'}
            ]},
            observedAt: 1000,
            serviceId : 'memory-core'
        })).toBeNull();
    });

    test('only the failed pragma is carried in evidence + failedPragmas (partial failure)', () => {
        const diag = buildSqliteIntegrityDiagnosis({
            sqliteResult: {checks: [
                {pragma: 'quick_check',     ok: true,  output: 'ok'},
                {pragma: 'integrity_check', ok: false, error: 'database disk image is malformed'}
            ]},
            observedAt: 1, serviceId: 'mc'
        });
        expect(diag.details.failedPragmas).toEqual(['integrity_check']);
        expect(diag.evidenceFacts).toHaveLength(1);
        expect(diag.evidenceFacts[0]).toMatchObject({pragma: 'integrity_check', detail: 'database disk image is malformed'});
    });

    test('bounds the evidence detail snippet (never unbounded SQLite output)', () => {
        const diag = buildSqliteIntegrityDiagnosis({
            sqliteResult: {checks: [{pragma: 'integrity_check', ok: false, output: 'x'.repeat(5000)}]},
            observedAt  : 1, serviceId: 'mc'
        });
        expect(diag.evidenceFacts[0].detail.length).toBeLessThanOrEqual(280);
    });

    test('empty / absent checks -> null', () => {
        expect(buildSqliteIntegrityDiagnosis({sqliteResult: {checks: []}, observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildSqliteIntegrityDiagnosis({sqliteResult: {}, observedAt: 1, serviceId: 'mc'})).toBeNull();
        expect(buildSqliteIntegrityDiagnosis({observedAt: 1, serviceId: 'mc'})).toBeNull();
    });

    test('emits data-integrity, which validates against RECOVERY_CLASSES (else createRecoveryDiagnosisEvent throws)', () => {
        const diag = buildSqliteIntegrityDiagnosis({
            sqliteResult: {checks: [{pragma: 'integrity_check', ok: false, output: 'malformed'}]},
            observedAt  : 1, serviceId: 'mc'
        });
        expect(diag.recoveryClass).toBe('data-integrity');
    });

    test('rejects missing serviceId / non-finite observedAt', () => {
        expect(() => buildSqliteIntegrityDiagnosis({sqliteResult: {checks: []}, observedAt: 1})).toThrow('serviceId');
        expect(() => buildSqliteIntegrityDiagnosis({sqliteResult: {checks: []}, serviceId: 'mc'})).toThrow('observedAt');
    });
});
