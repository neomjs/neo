import {setup} from '../../../../../setup.mjs';

const appName = 'AssembleIssueBatchTest';

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

import {test, expect}                      from '@playwright/test';
import Neo                                 from '../../../../../../../src/Neo.mjs';
import * as core                           from '../../../../../../../src/core/_export.mjs';
import {validateBatch}                     from '../../../../../../../ai/services/memory-core/communityBatchContract.mjs';
import {assembleIssueBatch, inventoryHash} from '../../../../../../../ai/services/github-workflow/community/assembleIssueBatch.mjs';

/**
 * @summary Witnesses that the batch assembler produces a valid v1 envelope, folds evidenced
 * deletions into observations while keeping access-indeterminate absences OUT of observations (they
 * only degrade coverage), and computes an order-insensitive inventory hash.
 */
test.describe('assembleIssueBatch', () => {
    const observation = entityId => ({
        providerEntityId    : entityId,
        occurrenceKind      : 'issue.opened',
        occurrenceCoordinate: `${entityId}:opened`,
        occurredAt          : '2026-07-18T10:00:00Z',
        actorKind           : 'user',
        sourceAssociation   : 'OWNER'
    });

    const runnerResult = {
        observations     : [observation('I_a'), observation('I_b')],
        coverage         : {fromBasis: 'c1', toBasis: 'c9', complete: true},
        nextProviderState: {issuesCursor: '9'}
    };

    const base = (over = {}) => ({
        sourceInstanceId     : 'src-1',
        registrationEpoch    : 2,
        baseCheckpointVersion: 0,
        baseInventoryHash    : null,
        runnerResult,
        currentInventory     : ['I_a', 'I_b'],
        batchId              : 'batch-1',
        observedAt           : '2026-07-18T13:00:00Z',
        ...over
    });

    test('a straightforward assembly validates as v1 and carries the runner cursor through', () => {
        const batch = assembleIssueBatch(base());

        expect(validateBatch(batch)).toEqual({valid: true, errors: []});
        expect(batch.nextProviderState, 'the cursor passes through untouched').toEqual({issuesCursor: '9'});
        expect(batch.nextInventoryHash).toBe(inventoryHash(['I_a', 'I_b']))
    });

    test('an evidenced deletion becomes a deleted observation and the batch still validates', () => {
        const batch = assembleIssueBatch(base({
            absences: {deleted: [{providerEntityId: 'I_gone', deletionEvidence: {tombstoneId: 't-1', deletedAt: '2026-07-18T12:00:00Z'}}], accessIndeterminate: []}
        }));

        const del = batch.observations.find(o => o.providerEntityId === 'I_gone');

        expect(del.absence).toBe('deleted');
        expect(validateBatch(batch)).toEqual({valid: true, errors: []})
    });

    test('an access-indeterminate absence is NOT an observation — it degrades coverage as a gap', () => {
        const batch = assembleIssueBatch(base({
            absences: {deleted: [], accessIndeterminate: ['I_hidden']}
        }));

        expect(batch.observations.some(o => o.providerEntityId === 'I_hidden'), 'never fabricated as an observation').toBe(false);
        expect(batch.coverage.complete, 'access loss lowers completeness').toBe(false);
        expect(batch.coverage.gaps).toEqual(expect.arrayContaining([{axis: 'inventory-access', providerEntityId: 'I_hidden'}]));
        expect(validateBatch(batch), 'incomplete-with-gaps is a valid coverage shape').toEqual({valid: true, errors: []})
    });

    test('inventory hash is order-insensitive and dedupes', () => {
        expect(inventoryHash(['I_a', 'I_b'])).toBe(inventoryHash(['I_b', 'I_a']));
        expect(inventoryHash(['I_a', 'I_a', 'I_b'])).toBe(inventoryHash(['I_a', 'I_b']));
        expect(inventoryHash(['I_a'])).not.toBe(inventoryHash(['I_a', 'I_b']))
    });
});
