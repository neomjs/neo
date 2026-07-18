import {setup} from '../../../../setup.mjs';

const appName = 'CommunityBatchAdmissionServiceTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../src/core/_export.mjs';
import fs                     from 'fs';
import path                   from 'path';
import {BATCH_SCHEMA_VERSION} from '../../../../../../ai/services/memory-core/communityBatchContract.mjs';

/**
 * @summary Admission witnesses: the epoch fence and the digest-keyed idempotency contract.
 *
 * The two that matter most are the conflict paths — a same-id/different-digest batch must never
 * silently overwrite durable history, and a stale or revoked registration epoch must never admit.
 */
test.describe('Neo.ai.services.memory-core.CommunityBatchAdmissionService', () => {
    let AdmissionService, SourceRegistryService, originalEnv, testDbPath;

    const
        SUBJECT = 'local-subject',

        source = {
            provider             : 'github',
            canonicalProviderHost: 'github.com',
            resourceKind         : 'repository',
            providerResourceId   : 'neomjs/neo',
            displayLocator       : 'neomjs/neo'
        },

        occurrence = (id, over = {}) => ({
            providerEntityId: id,
            occurrenceKind  : 'issue.opened',
            occurredAt      : '2026-07-18T10:00:00Z',
            ...over
        }),

        batch = (sourceInstanceId, over = {}) => ({
            schemaVersion    : BATCH_SCHEMA_VERSION,
            batchId          : 'batch-1',
            sourceInstanceId,
            registrationEpoch: 2,
            partition        : 'issues',
            coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true},
            occurrences      : [occurrence('e1'), occurrence('e2')],
            ...over
        }),

        /** Registers a source and drives it to ACTIVE@2, returning its id. */
        activeSource = () => {
            SourceRegistryService.localSubjectId = SUBJECT;

            const {sourceInstanceId} = SourceRegistryService.register(source);

            SourceRegistryService.transitionLifecycle(sourceInstanceId, 'PROVISIONED', {expectedState: 'REQUESTED', expectedEpoch: 1});
            SourceRegistryService.transitionLifecycle(sourceInstanceId, 'ACTIVE',      {expectedState: 'PROVISIONED', expectedEpoch: 2});

            return sourceInstanceId
        },

        receiptCount = () => AdmissionService.db.prepare('SELECT count(*) AS c FROM mc_community_batch_receipt').get().c;

    test.beforeAll(async () => {
        originalEnv = {
            NEO_MEMORY_DB_PATH_TEST: process.env.NEO_MEMORY_DB_PATH_TEST,
            UNIT_TEST_MODE         : process.env.UNIT_TEST_MODE
        };

        const tmpDir = path.resolve(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, {recursive: true});

        testDbPath = path.join(tmpDir, `mc-batch-admission-test-${process.pid}-${Date.now()}.sqlite`);
        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        process.env.UNIT_TEST_MODE          = 'true';
        process.env.NEO_MEMORY_DB_PATH_TEST = testDbPath;

        SourceRegistryService = (await import('../../../../../../ai/services/memory-core/SourceRegistryService.mjs')).default;
        AdmissionService      = (await import('../../../../../../ai/services/memory-core/CommunityBatchAdmissionService.mjs')).default;

        await SourceRegistryService.initAsync();
        await AdmissionService.initAsync();
    });

    test.afterAll(() => {
        Object.entries(originalEnv).forEach(([k, v]) => {
            v === undefined ? delete process.env[k] : (process.env[k] = v);
        });
    });

    test.beforeEach(() => {
        AdmissionService.db.exec('DELETE FROM mc_community_batch_receipt;');
        SourceRegistryService.db.exec('DELETE FROM mc_source_registration;');
        SourceRegistryService.localSubjectId = SUBJECT;
    });

    test('a valid batch on an ACTIVE source at the current epoch is admitted with a receipt', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batch(id));

        expect(result.status).toBe('accepted');
        expect(result.receipt.admittedSequence).toBe(1);
        expect(result.receipt.occurrenceCount).toBe(2);
        expect(result.receipt.digest).toBe(result.digest);
    });

    test('the same batchId with the same digest is an idempotent retry — no second receipt', () => {
        const id    = activeSource(),
              first = AdmissionService.admitBatch(batch(id));

        // Same payload, occurrences deliberately reordered: still the same batch.
        const retry = AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e2'), occurrence('e1')]}));

        expect(retry.status).toBe('idempotent');
        expect(retry.receipt.receiptId).toBe(first.receipt.receiptId);
        expect(retry.receipt.admittedSequence).toBe(1);
        expect(receiptCount(), 'a retry must not mint a second receipt').toBe(1);
    });

    test('the same batchId with a DIFFERENT digest is an integrity conflict, never an overwrite', () => {
        const id    = activeSource(),
              first = AdmissionService.admitBatch(batch(id));

        const conflicting = AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1', {occurrenceKind: 'issue.closed'})]}));

        expect(conflicting.status).toBe('conflict');
        expect(conflicting.reason).toBe('DIGEST_MISMATCH');
        expect(receiptCount()).toBe(1);
        expect(AdmissionService.getReceipt(id, 'batch-1').digest, 'durable history is preserved')
            .toBe(first.digest);
    });

    test('a stale registration epoch cannot admit', () => {
        const id = activeSource(), // ACTIVE@2
              result = AdmissionService.admitBatch(batch(id, {registrationEpoch: 1}));

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('REGISTRATION_NOT_ADMISSIBLE');
        expect(receiptCount()).toBe(0);
    });

    test('a revoked source cannot admit, even at its last-active epoch', () => {
        const id = activeSource();

        SourceRegistryService.transitionLifecycle(id, 'REVOKED', {expectedState: 'ACTIVE', expectedEpoch: 2});

        const result = AdmissionService.admitBatch(batch(id));

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('REGISTRATION_NOT_ADMISSIBLE');
        expect(receiptCount()).toBe(0);
    });

    test('a schema-invalid batch is refused and writes nothing', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1', {title: 'prose'})]}));

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('SCHEMA_INVALID');
        expect(result.errors).toContain('OCCURRENCE_0_CARRIES_PROSE_TITLE');
        expect(receiptCount()).toBe(0);
    });

    test('admitted sequence is monotonic across distinct batches', () => {
        const id = activeSource();

        expect(AdmissionService.admitBatch(batch(id, {batchId: 'batch-1'})).receipt.admittedSequence).toBe(1);
        expect(AdmissionService.admitBatch(batch(id, {batchId: 'batch-2'})).receipt.admittedSequence).toBe(2);
        expect(AdmissionService.admitBatch(batch(id, {batchId: 'batch-3'})).receipt.admittedSequence).toBe(3);
    });

    // ---------------------------------------------------------------- the occurrence ledger

    test('the ledger commits with its receipt and carries a distinct occurrence identity', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batch(id)),
              ledger = AdmissionService.listOccurrences(id);

        expect(ledger).toHaveLength(2);
        expect(ledger[0].receiptId, 'each occurrence names the receipt that admitted it').toBe(result.receipt.receiptId);
        expect(ledger[0].admittedSequence).toBe(result.receipt.admittedSequence);

        // The four identities stay separable — that separation IS the contract.
        const [first] = ledger;
        expect(first.occurrenceId).not.toBe(first.providerEntityId);
        expect(first.occurrenceId).not.toBe(first.receiptId);
        expect(first.occurrenceId).not.toBe(String(first.admittedSequence));
        expect(new Set(ledger.map(o => o.occurrenceId)).size, 'occurrence ids are unique per fact').toBe(2);
    });

    test('an idempotent retry does NOT duplicate ledger rows', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id));
        AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e2'), occurrence('e1')]}));

        expect(AdmissionService.listOccurrences(id), 'a retry must not double durable history').toHaveLength(2);
    });

    test('a rejected batch writes no ledger rows', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {registrationEpoch: 1}));                              // fenced
        AdmissionService.admitBatch(batch(id, {batchId: 'b2', occurrences: [occurrence('e1', {title: 'p'})]})); // invalid

        expect(AdmissionService.listOccurrences(id)).toHaveLength(0);
    });

    test('a revision is a NEW occurrence — the row it revises is never mutated', () => {
        const id       = activeSource(),
              admitted = AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1')]})),
              original = AdmissionService.listOccurrences(id, {providerEntityId: 'e1'})[0];

        AdmissionService.admitBatch(batch(id, {
            batchId    : 'batch-2',
            occurrences: [occurrence('e1', {occurrenceKind: 'issue.edited', revisionOf: original.occurrenceId})]
        }));

        const history = AdmissionService.listOccurrences(id, {providerEntityId: 'e1'});

        expect(history, 'both the original and its revision are durable').toHaveLength(2);
        expect(history[0].occurrenceId).toBe(original.occurrenceId);
        expect(history[0].occurrenceKind, 'the original is untouched').toBe('issue.opened');
        expect(history[1].revisionOf).toBe(original.occurrenceId);
        expect(history[1].admittedSequence).toBeGreaterThan(history[0].admittedSequence);
        expect(admitted.status).toBe('accepted');
    });

    test('an evidenced absence disposition is persisted verbatim', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1', {absence: 'deleted'})]}));

        expect(AdmissionService.listOccurrences(id)[0].absence).toBe('deleted');
    });
});
