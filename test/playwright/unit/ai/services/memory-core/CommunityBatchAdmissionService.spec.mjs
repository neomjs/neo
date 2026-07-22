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
import RequestContextService  from '../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs';

/**
 * @summary Admission witnesses for the full v1 contract: the folded serialized transaction, the epoch
 * fence inside the boundary, partition-scoped receipts, observation-identity dedup, and the base→next
 * checkpoint CAS. The four reviewer boundary probes appear as the last five cases.
 */
test.describe('Neo.ai.services.memory-core.CommunityBatchAdmissionService', () => {
    let AdmissionService, SourceRegistryService,
        admissionDb, registryDb,
        originalAdmissionDb, originalAttentionPolicy, originalEnv, originalLocalSubjectId, originalRegistryDb,
        testDbPath;

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
            responseBearingKinds     : [
                'issue.opened',
                'issue.comment',
                'pull_request.opened',
                'pull_request.comment',
                'pull_request.review-submitted',
                'pull_request.review-comment'
            ],
            rosteredActorIds         : ['neo-opus-ada', 'neo-gpt'],
            recordedActorDispositions: {}
        },

        observation = (entityId, over = {}) => ({
            providerEntityId    : entityId,
            occurrenceKind      : 'issue.opened',
            occurrenceCoordinate: `${entityId}:create`,
            occurredAt          : '2026-07-18T10:00:00Z',
            actorId             : 'external-human',
            actorKind           : 'user',
            ...over
        }),

        // A v1 batch declaring an explicit checkpoint basis (default: the initial 0/null).
        batchAt = (sourceInstanceId, {batchId = 'batch-1', resourceFamily = 'issues', baseCheckpointVersion = 0,
                                       baseInventoryHash = null, observations, ...over} = {}) => ({
            schemaVersion             : BATCH_SCHEMA_VERSION,
            sourceInstanceId,
            resourceFamily,
            adapterSchemaVersion      : 'github-issue.v1',
            providerStateSchemaVersion: 'gh-state.v1',
            registrationEpoch         : 2,
            baseCheckpointVersion,
            baseInventoryHash,
            batchId,
            observations              : observations || [observation('e1'), observation('e2')],
            nextProviderState         : {cursor: batchId},
            nextInventoryHash         : `inv-${batchId}`,
            coverage                  : {fromBasis: 'c1', toBasis: 'c9', complete: true},
            ...over
        }),

        // Chains a follow-on batch onto the basis a prior receipt established.
        chained = (sourceInstanceId, priorReceipt, over = {}) => batchAt(sourceInstanceId, {
            baseCheckpointVersion: priorReceipt.nextCheckpointVersion,
            baseInventoryHash    : priorReceipt.nextInventoryHash,
            ...over
        }),

        hostedEnvelope = (over = {}) => {
            const {sourceInstanceId, registrationEpoch, ...batch} = batchAt('server-resolved');

            return {
                source: {
                    canonicalProviderHost: source.canonicalProviderHost,
                    resourceKind         : source.resourceKind,
                    providerResourceId   : source.providerResourceId
                },
                batch,
                ...over
            }
        },

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

        const Database = (await import('better-sqlite3')).default;

        SourceRegistryService = (await import('../../../../../../ai/services/memory-core/SourceRegistryService.mjs')).default;
        AdmissionService      = (await import('../../../../../../ai/services/memory-core/CommunityBatchAdmissionService.mjs')).default;

        await SourceRegistryService.ready();
        await AdmissionService.ready();

        originalRegistryDb      = SourceRegistryService.db;
        originalAdmissionDb     = AdmissionService.db;
        originalLocalSubjectId  = SourceRegistryService.localSubjectId;
        originalAttentionPolicy = AdmissionService.attentionPolicy;

        registryDb  = new Database(testDbPath, {verbose: null});
        admissionDb = new Database(testDbPath, {verbose: null});

        registryDb.pragma('journal_mode = WAL');
        registryDb.pragma('busy_timeout = 5000');
        admissionDb.pragma('busy_timeout = 5000');

        SourceRegistryService.set({db: registryDb});
        AdmissionService.set({db: admissionDb});
        SourceRegistryService.ensureSchema();
        AdmissionService.ensureSchema();
    });

    test.afterAll(() => {
        SourceRegistryService.set({
            db            : originalRegistryDb,
            localSubjectId: originalLocalSubjectId
        });
        AdmissionService.set({
            db             : originalAdmissionDb,
            attentionPolicy: originalAttentionPolicy
        });

        registryDb.close();
        admissionDb.close();

        for (const suffix of ['', '-wal', '-shm']) {
            try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (e) {}
        }

        Object.entries(originalEnv).forEach(([k, v]) => {
            v === undefined ? delete process.env[k] : (process.env[k] = v);
        });
    });

    test.beforeEach(() => {
        AdmissionService.db.exec('DELETE FROM mc_community_batch_receipt; DELETE FROM mc_community_observation; DELETE FROM mc_community_checkpoint;');
        SourceRegistryService.db.exec('DELETE FROM mc_source_registration_audit; DELETE FROM mc_source_registration;');
        SourceRegistryService.localSubjectId = SUBJECT;
        AdmissionService.attentionPolicy      = ATTENTION_POLICY;
    });

    // ---------------------------------------------------------------- admission + fence

    test('a valid batch on an ACTIVE source admits, receipts, and advances the checkpoint in one step', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batchAt(id));

        expect(result.status).toBe('accepted');
        expect(result.receipt.admittedSequence).toBe(1);
        expect(result.receipt.observationCount).toBe(2);
        expect(result.receipt.nextCheckpointVersion).toBe(1);
        expect(result.checkpoint.checkpointVersion, 'the partition advanced atomically with the receipt').toBe(1);
        expect(result.checkpoint.inventoryHash).toBe('inv-batch-1');
    });

    test('an idempotent retry repairs legacy nullable projections without reminting receipt or sequence', () => {
        const id            = activeSource(),
              legacyPayload = observation('e1', {
                  parentProviderEntityId: 'pull-42',
                  providerState         : 'CHANGES_REQUESTED',
                  sourceAssociation     : 'MEMBER'
              }),
              first  = AdmissionService.admitBatch(batchAt(id, {observations: [legacyPayload, observation('e2')]})),
              before = AdmissionService.listObservations(id, {providerEntityId: 'e1'})[0];

        AdmissionService.db.prepare(
            `UPDATE mc_community_observation
             SET parent_provider_entity_id = NULL, provider_state = NULL, source_association = NULL
             WHERE observation_row_id = ?`
        ).run(before.observationRowId);

        const retry = AdmissionService.admitBatch(batchAt(id, {observations: [observation('e2'), legacyPayload]})),
              after = AdmissionService.listObservations(id, {providerEntityId: 'e1'})[0];

        expect(retry.status).toBe('idempotent');
        expect(retry.receipt.receiptId).toBe(first.receipt.receiptId);
        expect(after).toMatchObject({
            observationRowId      : before.observationRowId,
            receiptId             : before.receiptId,
            admittedSequence      : before.admittedSequence,
            parentProviderEntityId: 'pull-42',
            providerState         : 'CHANGES_REQUESTED',
            sourceAssociation     : 'MEMBER'
        });
        expect(receiptCount()).toBe(1);
        expect(AdmissionService.getCheckpoint(id, 'issues').checkpointVersion).toBe(1);
    });

    test('the same batchId + a DIFFERENT digest is an integrity conflict, never an overwrite', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id));

        const conflict = AdmissionService.admitBatch(batchAt(id, {observations: [observation('e1', {occurrenceKind: 'issue.closed'})]}));

        expect(conflict.status).toBe('conflict');
        expect(conflict.reason).toBe('DIGEST_MISMATCH');
        expect(receiptCount()).toBe(1);
    });

    test('a stale registration epoch cannot admit (fence is inside the transaction)', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batchAt(id, {registrationEpoch: 1}));

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('REGISTRATION_NOT_ADMISSIBLE');
        expect(receiptCount()).toBe(0);
        expect(AdmissionService.getCheckpoint(id, 'issues'), 'no partial checkpoint advance').toBeNull();
    });

    test('a revoked source cannot admit, even at its last-active epoch', () => {
        const id = activeSource();

        SourceRegistryService.transitionLifecycle(id, 'REVOKED', {expectedState: 'ACTIVE', expectedEpoch: 2});

        // The fence is step 1 of the transaction, so a rejected registration writes NOTHING —
        // no receipt, no observations, no checkpoint advance (full atomicity of the gate).
        const result = AdmissionService.admitBatch(batchAt(id));
        expect(result.reason).toBe('REGISTRATION_NOT_ADMISSIBLE');
        expect(receiptCount()).toBe(0);
        expect(AdmissionService.listObservations(id)).toHaveLength(0);
        expect(AdmissionService.getCheckpoint(id, 'issues')).toBeNull();
    });

    test('the fence reads the registration through the admission connection, inside the transaction', () => {
        const id = activeSource();

        // A revoke committed through a SEPARATE connection to the same database (standing in for the
        // registry connection or any concurrent lifecycle writer). If the fence read through a cached
        // or foreign connection outside the admission transaction, it could admit under this revoke —
        // exactly the two-connection interleaving that produced an accepted batch under REVOKED truth.
        const Database = AdmissionService.db.constructor,
              probe    = new Database(testDbPath);

        probe.pragma('busy_timeout = 5000');
        probe.prepare(
            `UPDATE mc_source_registration SET lifecycle_state = 'REVOKED', updated_at = 1
             WHERE source_instance_id = ?`
        ).run(id);
        probe.close();

        const result = AdmissionService.admitBatch(batchAt(id));

        expect(result.reason, 'the fence sees the cross-connection committed revoke').toBe('REGISTRATION_NOT_ADMISSIBLE');
        expect(receiptCount()).toBe(0);
        expect(AdmissionService.getCheckpoint(id, 'issues')).toBeNull();
    });

    test('an epoch bump from reprovisioning fences a batch declaring the old epoch', () => {
        const id = activeSource();   // ACTIVE@2

        AdmissionService.admitBatch(batchAt(id, {batchId: 'b1'}));   // valid at epoch 2

        SourceRegistryService.transitionLifecycle(id, 'REVOKED',     {expectedState: 'ACTIVE', expectedEpoch: 2});
        SourceRegistryService.transitionLifecycle(id, 'PROVISIONED', {expectedState: 'REVOKED', expectedEpoch: 2});   // epoch -> 3
        SourceRegistryService.transitionLifecycle(id, 'ACTIVE',      {expectedState: 'PROVISIONED', expectedEpoch: 3});

        // A batch still claiming epoch 2 is fenced even though the source is ACTIVE again at epoch 3.
        expect(AdmissionService.admitBatch(batchAt(id, {batchId: 'b2', registrationEpoch: 2, observations: [observation('e9')]})).reason)
            .toBe('REGISTRATION_NOT_ADMISSIBLE');
    });

    test('a schema-invalid batch is refused and writes nothing', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batchAt(id, {observations: [observation('e1', {title: 'prose'})]}));

        expect(result.status).toBe('conflict');
        expect(result.reason).toBe('SCHEMA_INVALID');
        expect(result.errors).toContain('OBSERVATION_0_CARRIES_PROSE_TITLE');
        expect(receiptCount()).toBe(0);
    });

    // ---------------------------------------------------------------- checkpoint CAS (folded)

    test('a chained batch advances; a stale base is refused without regressing', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1'})).receipt;

        const good = AdmissionService.admitBatch(chained(id, r1, {batchId: 'b2', observations: [observation('e3')]}));
        expect(good.status).toBe('accepted');
        expect(good.checkpoint.checkpointVersion).toBe(2);

        // A connector still on the original basis 0 must not clobber the advanced cursor.
        const stale = AdmissionService.admitBatch(batchAt(id, {batchId: 'b3', baseCheckpointVersion: 0, observations: [observation('e4')]}));
        expect(stale.status).toBe('conflict');
        expect(stale.reason).toBe('STALE_BASIS');
        expect(AdmissionService.getCheckpoint(id, 'issues').checkpointVersion, 'unadvanced').toBe(2);
    });

    test('the receipt binds the exact transition it established (a receipt for c1 to c9 cannot advance elsewhere)', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1'})).receipt;

        // The receipt persisted base 0 -> next 1 with next inventory inv-b1; any batch claiming a base
        // other than exactly (1, inv-b1) is refused, so the transition is not free-floating.
        expect(AdmissionService.admitBatch(batchAt(id, {batchId: 'b2', baseCheckpointVersion: 1, baseInventoryHash: 'inv-WRONG', observations: [observation('e3')]})).reason).toBe('STALE_BASIS');
        expect(r1.baseCheckpointVersion).toBe(0);
        expect(r1.nextCheckpointVersion).toBe(1);
    });

    test('admitted sequence is monotonic across chained batches', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1'})).receipt,
              r2 = AdmissionService.admitBatch(chained(id, r1, {batchId: 'b2', observations: [observation('e3')]})).receipt,
              r3 = AdmissionService.admitBatch(chained(id, r2, {batchId: 'b3', observations: [observation('e4')]})).receipt;

        expect([r1.admittedSequence, r2.admittedSequence, r3.admittedSequence]).toEqual([1, 2, 3]);
    });

    test('checkpoints are per resource family — a sibling family is independently unset', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id, {resourceFamily: 'issues'}));

        expect(AdmissionService.getCheckpoint(id, 'pulls')).toBeNull();
    });

    test('the same batchId in two resource families does not collide (receipts are partition-scoped)', () => {
        const id = activeSource();

        expect(AdmissionService.admitBatch(batchAt(id, {batchId: 'shared', resourceFamily: 'issues'})).status).toBe('accepted');
        expect(AdmissionService.admitBatch(batchAt(id, {batchId: 'shared', resourceFamily: 'pulls', observations: [observation('p1', {occurrenceKind: 'pull.opened'})]})).status).toBe('accepted');
        expect(receiptCount()).toBe(2);
    });

    // ---------------------------------------------------------------- observation ledger (dedup / revision)

    test('overlapping observations across different batchIds dedup by identity + digest', () => {
        const id      = activeSource(),
              payload = observation('e1', {sourceAssociation: 'MEMBER'}),
              r1      = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1', observations: [payload]})).receipt,
              before  = AdmissionService.listObservations(id, {providerEntityId: 'e1'})[0];

        AdmissionService.db.prepare(
            `UPDATE mc_community_observation SET source_association = NULL WHERE observation_row_id = ?`
        ).run(before.observationRowId);

        // b2 carries the SAME observation (same identity + digest) plus a new one.
        const replay = AdmissionService.admitBatch(chained(id, r1, {
            batchId     : 'b2',
            observations: [payload, observation('e2')]
        }));

        const rows    = AdmissionService.listObservations(id),
              deduped = rows.find(row => row.providerEntityId === 'e1');

        expect(replay.status).toBe('accepted');
        expect(replay.receipt.admittedSequence).toBe(2);
        expect(rows, 'e1 admitted once despite arriving in two batches').toHaveLength(2);
        expect(rows.filter(r => r.providerEntityId === 'e1')).toHaveLength(1);
        expect(deduped).toMatchObject({
            observationRowId : before.observationRowId,
            receiptId        : before.receiptId,
            admittedSequence : before.admittedSequence,
            sourceAssociation: 'MEMBER'
        })
    });

    test('the same occurrence identity with a different digest is an integrity conflict', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1', observations: [observation('e1')]})).receipt;

        // Same coordinate (identity) but mutated content -> different observation digest -> conflict.
        const conflict = AdmissionService.admitBatch(chained(id, r1, {batchId: 'b2', observations: [observation('e1', {occurredAt: '2099-01-01T00:00:00Z'})]}));

        expect(conflict.status).toBe('conflict');
        expect(conflict.reason).toBe('OBSERVATION_DIGEST_MISMATCH');
        expect(AdmissionService.listObservations(id), 'the conflicting batch rolled back entirely').toHaveLength(1);
        expect(receiptCount(), 'no receipt for the aborted batch').toBe(1);
    });

    test('a genuine revision (new coordinate) is a new immutable fact, leaving the original untouched', () => {
        const id = activeSource(),
              r1 = AdmissionService.admitBatch(batchAt(id, {batchId: 'b1', observations: [observation('e1')]})).receipt;

        AdmissionService.admitBatch(chained(id, r1, {batchId: 'b2', observations: [
            observation('e1', {occurrenceKind: 'issue.edited', occurrenceCoordinate: 'e1:edit-1', revisionOf: 'e1:create'})
        ]}));

        const history = AdmissionService.listObservations(id, {providerEntityId: 'e1'});
        expect(history).toHaveLength(2);
        expect(history[0].occurrenceKind).toBe('issue.opened');
        expect(history[1].occurrenceKind, 'the original is not overwritten').toBe('issue.edited');
        expect(history[1].revisionOf).toBe('e1:create');
    });

    test('provider-neutral parent, state, and association metadata survive the admission round trip', () => {
        const id = activeSource();

        const result = AdmissionService.admitBatch(batchAt(id, {observations: [observation('review-7', {
            parentProviderEntityId: 'pull-42',
            occurrenceKind        : 'pull.review.submitted',
            providerState         : 'CHANGES_REQUESTED',
            sourceAssociation     : 'MEMBER'
        })]}));

        expect(result.status).toBe('accepted');
        expect(AdmissionService.listObservations(id)).toEqual([
            expect.objectContaining({
                providerEntityId      : 'review-7',
                parentProviderEntityId: 'pull-42',
                providerState         : 'CHANGES_REQUESTED',
                sourceAssociation     : 'MEMBER'
            })
        ])
    });

    test('ensureSchema adds nullable observation metadata columns to an existing ledger', () => {
        const Database  = AdmissionService.db.constructor,
              legacyDb  = new Database(':memory:'),
              currentDb = AdmissionService.db;

        legacyDb.exec(`
            CREATE TABLE mc_community_observation (
                observation_row_id    TEXT    PRIMARY KEY,
                tenant_id             TEXT    NOT NULL,
                source_instance_id    TEXT    NOT NULL,
                occurrence_identity   TEXT    NOT NULL,
                occurrence_digest     TEXT    NOT NULL,
                provider_entity_id    TEXT    NOT NULL,
                occurrence_kind       TEXT    NOT NULL,
                occurrence_coordinate TEXT    NOT NULL,
                occurred_at           TEXT    NOT NULL,
                actor_id              TEXT,
                actor_kind            TEXT    NOT NULL,
                revision_of           TEXT,
                absence               TEXT,
                deletion_evidence     TEXT,
                attention_disposition TEXT    NOT NULL,
                attention_reason      TEXT    NOT NULL,
                receipt_id            TEXT    NOT NULL,
                admitted_sequence     INTEGER NOT NULL,
                admitted_at           INTEGER NOT NULL
            )
        `);

        try {
            AdmissionService.set({db: legacyDb});
            AdmissionService.ensureSchema();
            AdmissionService.ensureSchema();

            const columns = new Set(legacyDb.prepare(`PRAGMA table_info(mc_community_observation)`).all()
                .map(column => column.name));

            expect(columns.has('parent_provider_entity_id')).toBe(true);
            expect(columns.has('provider_state')).toBe(true);
            expect(columns.has('source_association')).toBe(true)
        } finally {
            AdmissionService.set({db: currentDb});
            legacyDb.close()
        }
    });

    // ---------------------------------------------------------------- attention (§2.1)

    test('an external response-bearing occurrence is attention-eligible', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id, {observations: [observation('e1')]}));

        const [row] = AdmissionService.listObservations(id);
        expect(row.attentionDisposition).toBe('eligible');
        expect(row.attentionReason).toBe('external-response-bearing');
    });

    test('PR/review output inherits response-bearing eligibility without promoting state context', () => {
        const id = activeSource();

        const occurrences = [
            observation('pull-1', {occurrenceKind: 'pull_request.opened'}),
            observation('comment-1', {occurrenceKind: 'pull_request.comment'}),
            observation('review-1', {occurrenceKind: 'pull_request.review-submitted'}),
            observation('inline-1', {occurrenceKind: 'pull_request.review-comment'}),
            observation('close-1', {occurrenceKind: 'pull_request.closed'}),
            observation('internal-review-1', {
                actorId       : 'neo-gpt',
                occurrenceKind: 'pull_request.review-submitted'
            })
        ];

        expect(AdmissionService.admitBatch(batchAt(id, {
            resourceFamily: 'pulls',
            observations  : occurrences
        })).status).toBe('accepted');

        const rows = new Map(AdmissionService.listObservations(id)
            .map(row => [row.providerEntityId, row]));

        ['pull-1', 'comment-1', 'review-1', 'inline-1'].forEach(providerEntityId => {
            expect(rows.get(providerEntityId)).toMatchObject({
                attentionDisposition: 'eligible',
                attentionReason     : 'external-response-bearing'
            })
        });

        expect(rows.get('close-1')).toMatchObject({
            attentionDisposition: 'ineligible',
            attentionReason     : 'not-response-bearing'
        });
        expect(rows.get('internal-review-1')).toMatchObject({
            attentionDisposition: 'ineligible',
            attentionReason     : 'rostered-actor'
        })
    });

    test('a bot is not attention-eligible in v1', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id, {observations: [observation('e1', {actorId: 'dependabot', actorKind: 'bot'})]}));

        expect(AdmissionService.listObservations(id)[0].attentionReason).toBe('bot-not-attention-eligible-v1');
    });

    test('a non-human actor kind fails closed — absent-from-any-list is NOT external-human eligibility', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id, {observations: [
            observation('e1', {actorId: 'an-org', actorKind: 'organization'}),
            observation('e2', {actorId: 'a-bot-account', actorKind: 'unknown'})
        ]}));

        expect(AdmissionService.listObservations(id).every(r => r.attentionReason === 'actor-kind-not-reviewed-fail-closed')).toBe(true);
    });

    test('a rostered actor updates an item WITHOUT minting new attention', () => {
        const id = activeSource();

        AdmissionService.admitBatch(batchAt(id, {observations: [
            observation('e1'),
            observation('e1', {occurrenceKind: 'issue.comment', occurrenceCoordinate: 'e1:c1', actorId: 'neo-opus-ada'})
        ]}));

        const rows = AdmissionService.listObservations(id, {providerEntityId: 'e1'});
        expect(rows.filter(r => r.attentionDisposition === 'eligible')).toHaveLength(1);
        expect(rows.find(r => r.actorId === 'neo-opus-ada').attentionReason).toBe('rostered-actor');
    });

    test('popularity telemetry cannot be admitted at all', () => {
        const id     = activeSource(),
              result = AdmissionService.admitBatch(batchAt(id, {observations: [observation('e1', {occurrenceKind: 'repository.starred'})]}));

        expect(result.status).toBe('conflict');
        expect(result.errors).toContain('OBSERVATION_0_POPULARITY_TELEMETRY_OUT_OF_SCOPE');
        expect(AdmissionService.listObservations(id)).toHaveLength(0);
    });

    test('deleted requires provider evidence; an evidenced deletion persists it', () => {
        const id = activeSource();

        expect(AdmissionService.admitBatch(batchAt(id, {batchId: 'no-ev', observations: [observation('e1', {absence: 'deleted'})]})).reason).toBe('SCHEMA_INVALID');

        AdmissionService.admitBatch(batchAt(id, {observations: [observation('e9', {absence: 'deleted', deletionEvidence: {tombstoneId: 't1', deletedAt: '2026-07-18T11:00:00Z'}})]}));
        expect(AdmissionService.listObservations(id)[0].deletionEvidence.tombstoneId).toBe('t1');
    });

    // ---------------------------------------------------------------- ingress parity + fail-loud

    test('local and hosted ingress admit byte-equivalent canonical batches and converge on one receipt', async () => {
        const id    = activeSource(),
              local = AdmissionService.admitBatch(batchAt(id));

        SourceRegistryService.localSubjectId = null;
        const remote = await RequestContextService.run({userId: SUBJECT}, () =>
            AdmissionService.admitHostedBatch(hostedEnvelope()));

        expect(remote.status).toBe('idempotent');
        expect(remote.receipt.receiptId).toBe(local.receipt.receiptId);
        expect(remote.digest).toBe(local.digest);
        expect(remote.health).toMatchObject({ready: true, code: 'COMMUNITY_SOURCE_READY'});
        expect(remote.health.lastReceipt.receiptId).toBe(local.receipt.receiptId);
    });

    test('hosted callers cannot stamp authority fields and a refusal writes nothing', async () => {
        activeSource();
        SourceRegistryService.localSubjectId = null;

        const forged = hostedEnvelope();
        forged.batch.registrationEpoch = 2;

        const result = await RequestContextService.run({userId: SUBJECT}, () =>
            AdmissionService.admitHostedBatch(forged));

        expect(result.code).toBe('COMMUNITY_BATCH_ENVELOPE_INVALID');
        expect(result.errors).toContain('HOSTED_AUTHORITY_FIELDS_FORBIDDEN');
        expect(receiptCount()).toBe(0);
    });

    test('wrong-tenant lookup is indistinguishable from an unknown source and fails before mutation', async () => {
        activeSource();
        SourceRegistryService.localSubjectId = null;

        const result = await RequestContextService.run({userId: 'other-tenant'}, () =>
            AdmissionService.admitHostedBatch(hostedEnvelope()));

        expect(result).toMatchObject({
            status: 'conflict',
            reason: 'REGISTRATION_NOT_ADMISSIBLE',
            code  : 'COMMUNITY_SOURCE_NOT_FOUND'
        });
        expect(receiptCount()).toBe(0);
    });

    test('a hosted push resolves but cannot admit after operator revocation', async () => {
        const id = activeSource();

        SourceRegistryService.transitionLifecycle(id, 'REVOKED', {
            expectedState: 'ACTIVE',
            expectedEpoch: 2
        });
        SourceRegistryService.localSubjectId = null;

        const result = await RequestContextService.run({userId: SUBJECT}, () =>
            AdmissionService.admitHostedBatch(hostedEnvelope()));

        expect(result).toMatchObject({
            status: 'conflict',
            reason: 'REGISTRATION_NOT_ADMISSIBLE',
            health: {ready: false, code: 'COMMUNITY_SOURCE_REVOKED'}
        });
        expect(receiptCount()).toBe(0);
    });

    test('hosted work-volume refusal is structured and happens before source mutation', async () => {
        activeSource();
        SourceRegistryService.localSubjectId = null;

        const result = await RequestContextService.run({userId: SUBJECT}, () =>
            AdmissionService.admitHostedBatch(hostedEnvelope(), {maxBytes: 1024 * 1024, maxObservations: 1}));

        expect(result.code).toBe('COMMUNITY_BATCH_VOLUME_EXCEEDED');
        expect(result.volume.observations).toBe(2);
        expect(result.limits.maxObservations).toBe(1);
        expect(receiptCount()).toBe(0);
    });

    test('an auth failure cannot partially admit', () => {
        const id = activeSource();

        SourceRegistryService.localSubjectId = null;
        expect(() => AdmissionService.admitBatch(batchAt(id))).toThrow('BATCH_ADMISSION_NO_TENANT');

        SourceRegistryService.localSubjectId = SUBJECT;
        expect(receiptCount()).toBe(0);
    });

    test('admission fails loud without an injected attention policy', () => {
        const id = activeSource();

        AdmissionService.attentionPolicy = null;
        expect(() => AdmissionService.admitBatch(batchAt(id))).toThrow('ATTENTION_POLICY_NOT_CONFIGURED');
        expect(AdmissionService.listObservations(id)).toHaveLength(0);
    });
});
