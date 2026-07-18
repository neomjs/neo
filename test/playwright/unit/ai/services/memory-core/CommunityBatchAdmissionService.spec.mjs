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

        ATTENTION_POLICY = {
            responseBearingKinds   : ['issue.opened', 'issue.comment', 'pull.opened', 'discussion.created'],
            rosteredActorIds       : ['neo-opus-ada', 'neo-gpt'],
            botActorIds            : ['dependabot'],
            recordedBotDispositions: {}
        },

        occurrence = (id, over = {}) => ({
            providerEntityId: id,
            occurrenceKind  : 'issue.opened',
            occurredAt      : '2026-07-18T10:00:00Z',
            actorId         : 'external-human',
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
        AdmissionService.db.exec('DELETE FROM mc_community_occurrence; DELETE FROM mc_community_checkpoint;');
        SourceRegistryService.db.exec('DELETE FROM mc_source_registration;');
        SourceRegistryService.localSubjectId = SUBJECT;
        AdmissionService.attentionPolicy     = ATTENTION_POLICY;
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

    // ---------------------------------------------------------------- checkpoint CAS

    test('a checkpoint claims an unset partition only on a durably-accepted receipt', () => {
        const id      = activeSource(),
              receipt = AdmissionService.admitBatch(batch(id)).receipt,
              result  = AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: receipt.receiptId});

        expect(result.status).toBe('advanced');
        expect(result.checkpoint.basis).toBe('c9');
        expect(result.checkpoint.lastReceiptId).toBe(receipt.receiptId);
    });

    test('a checkpoint never advances on a receipt that is not durable', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id));

        const result = AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: 'no-such-receipt'});

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('RECEIPT_NOT_DURABLE');
        expect(AdmissionService.getCheckpoint(id, 'issues'), 'nothing was written').toBeNull();
    });

    test('advancing from the current basis succeeds; a STALE basis conflicts without regressing', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batch(id, {batchId: 'b1'})).receipt,
              r2 = AdmissionService.admitBatch(batch(id, {batchId: 'b2'})).receipt;

        AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: r1.receiptId});

        const good = AdmissionService.advanceCheckpoint(id, 'issues', {expectedBasis: 'c9', toBasis: 'c14', receiptId: r2.receiptId});
        expect(good.status).toBe('advanced');
        expect(good.checkpoint.basis).toBe('c14');

        // A writer still holding the pre-advance view must not drag the cursor backwards.
        const stale = AdmissionService.advanceCheckpoint(id, 'issues', {expectedBasis: 'c9', toBasis: 'c11', receiptId: r2.receiptId});

        expect(stale.status).toBe('conflict');
        expect(stale.reason).toBe('BASIS_MISMATCH');
        expect(stale.checkpoint.basis, 'the conflict returns current server state, unadvanced').toBe('c14');
    });

    test('two writers racing from the same observed basis — exactly one advances', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batch(id, {batchId: 'b1'})).receipt,
              r2 = AdmissionService.admitBatch(batch(id, {batchId: 'b2'})).receipt;

        AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: r1.receiptId});

        const winner = AdmissionService.advanceCheckpoint(id, 'issues', {expectedBasis: 'c9', toBasis: 'c20', receiptId: r2.receiptId}),
              loser  = AdmissionService.advanceCheckpoint(id, 'issues', {expectedBasis: 'c9', toBasis: 'c30', receiptId: r2.receiptId});

        expect([winner.status, loser.status]).toEqual(['advanced', 'conflict']);
        expect(AdmissionService.getCheckpoint(id, 'issues').basis, 'the loser did not overwrite the winner').toBe('c20');
    });

    test('a second claimant on an unset partition conflicts rather than clobbering', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batch(id, {batchId: 'b1'})).receipt,
              r2 = AdmissionService.admitBatch(batch(id, {batchId: 'b2'})).receipt;

        expect(AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: r1.receiptId}).status).toBe('advanced');

        const second = AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c99', receiptId: r2.receiptId});

        expect(second.status).toBe('conflict');
        expect(second.checkpoint.basis).toBe('c9');
    });

    test('checkpoints are per-partition, not per-source', () => {
        const id      = activeSource(),
              receipt = AdmissionService.admitBatch(batch(id)).receipt;

        AdmissionService.advanceCheckpoint(id, 'issues', {toBasis: 'c9', receiptId: receipt.receiptId});

        expect(AdmissionService.getCheckpoint(id, 'pulls'), 'a sibling partition is independently unset').toBeNull();
    });

    // ---------------------------------------------------------------- attention eligibility

    test('popularity telemetry cannot be admitted at all', () => {
        const id = activeSource();

        ['repository.starred', 'repository.forked', 'repository.watched'].forEach((kind, i) => {
            const result = AdmissionService.admitBatch(batch(id, {
                batchId    : `pop-${i}`,
                occurrences: [occurrence('e1', {occurrenceKind: kind})]
            }));

            expect(result.status).toBe('conflict');
            expect(result.errors).toContain('OCCURRENCE_0_POPULARITY_TELEMETRY_OUT_OF_SCOPE');
        });

        expect(AdmissionService.listOccurrences(id), 'no popularity row ever becomes durable history').toHaveLength(0);
    });

    test('an external response-bearing occurrence is attention-eligible', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1')]}));

        const [row] = AdmissionService.listOccurrences(id);
        expect(row.attentionDisposition).toBe('eligible');
        expect(row.attentionReason).toBe('external-response-bearing');
    });

    test('a rostered actor updates an item WITHOUT minting new attention', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {occurrences: [
            occurrence('e1', {actorId: 'external-human'}),
            occurrence('e1', {actorId: 'neo-opus-ada', occurrenceKind: 'issue.comment'})
        ]}));

        const rows = AdmissionService.listOccurrences(id, {providerEntityId: 'e1'});

        expect(rows, 'the rostered occurrence is still durable history').toHaveLength(2);
        expect(rows.filter(r => r.attentionDisposition === 'eligible')).toHaveLength(1);
        expect(rows.find(r => r.actorId === 'neo-opus-ada').attentionReason).toBe('rostered-actor');
    });

    test('an unrecorded external bot is UNDETERMINED, never inferred either way', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1', {actorId: 'dependabot'})]}));

        const [row] = AdmissionService.listOccurrences(id);
        expect(row.attentionDisposition).toBe('undetermined');
        expect(row.attentionReason).toBe('bot-disposition-not-recorded');
    });

    test('a non-response-bearing kind is ineligible', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batch(id, {occurrences: [occurrence('e1', {occurrenceKind: 'issue.labeled'})]}));

        expect(AdmissionService.listOccurrences(id)[0].attentionReason).toBe('not-response-bearing');
    });

    test('admission fails loud without an injected attention policy — never dispositionless history', () => {
        const id = activeSource();

        AdmissionService.attentionPolicy = null;

        expect(() => AdmissionService.admitBatch(batch(id))).toThrow('ATTENTION_POLICY_NOT_CONFIGURED');
        expect(AdmissionService.listOccurrences(id)).toHaveLength(0);
    });
});
