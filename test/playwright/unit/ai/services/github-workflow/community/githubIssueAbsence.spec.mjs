import {setup} from '../../../../../setup.mjs';

const appName = 'GithubIssueAbsenceTest';

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

import {test, expect}                            from '@playwright/test';
import Neo                                       from '../../../../../../../src/Neo.mjs';
import * as core                                 from '../../../../../../../src/core/_export.mjs';
import {BATCH_SCHEMA_VERSION, validateBatch}     from '../../../../../../../ai/services/memory-core/communityBatchContract.mjs';
import {classifyAbsences, deletionToObservation} from '../../../../../../../ai/services/github-workflow/community/githubIssueAbsence.mjs';

/**
 * @summary Witnesses the absence security invariant: a vanished entity is a deletion only with
 * explicit provider evidence; a vanish without evidence is an access/permission loss and is never
 * shaped into a deletion. Also confirms a produced deletion observation satisfies the v1 contract.
 */
test.describe('githubIssueAbsence classification', () => {
    const evidence = (over = {}) => ({tombstoneId: 't-1', deletedAt: '2026-07-18T12:00:00Z', actor: {login: 'author', __typename: 'User'}, ...over});

    // ------------------------------------------------------------------ the security invariant

    test('a still-present entity is neither deleted nor indeterminate', () => {
        const {deleted, accessIndeterminate} = classifyAbsences(['A', 'B'], ['A', 'B'], {});

        expect(deleted).toEqual([]);
        expect(accessIndeterminate).toEqual([])
    });

    test('a vanished entity WITH provider evidence is a deletion', () => {
        const {deleted, accessIndeterminate} = classifyAbsences(['A', 'GONE'], ['A'], {GONE: evidence()});

        expect(deleted).toEqual([{providerEntityId: 'GONE', deletionEvidence: evidence()}]);
        expect(accessIndeterminate).toEqual([])
    });

    test('a vanished entity WITHOUT evidence is access-indeterminate — NEVER a deletion (permission-loss ≠ deletion)', () => {
        const {deleted, accessIndeterminate} = classifyAbsences(['A', 'HIDDEN'], ['A'], {});

        expect(deleted, 'no evidence, so no deletion is manufactured').toEqual([]);
        expect(accessIndeterminate).toEqual(['HIDDEN'])
    });

    test('a mixed vanish splits cleanly — evidenced deleted, unevidenced indeterminate', () => {
        const {deleted, accessIndeterminate} = classifyAbsences(
            ['keep', 'del', 'lost'], ['keep'], {del: evidence({tombstoneId: 't-del'})}
        );

        expect(deleted.map(d => d.providerEntityId)).toEqual(['del']);
        expect(accessIndeterminate).toEqual(['lost'])
    });

    // ------------------------------------------------------------------ the deletion observation is admissible

    test('a deletion observation carries its evidence and validates in a v1 batch', () => {
        const [deletion]  = classifyAbsences(['GONE'], [], {GONE: evidence()}).deleted,
              observation = deletionToObservation(deletion, {occurrenceKind: 'issue.deleted', observedAt: '2026-07-18T13:00:00Z'});

        expect(observation.absence).toBe('deleted');
        expect(observation.deletionEvidence.tombstoneId).toBe('t-1');
        expect(observation.occurredAt, 'dated evidence wins over the fallback').toBe('2026-07-18T12:00:00Z');

        const batch = {
            schemaVersion             : BATCH_SCHEMA_VERSION,
            sourceInstanceId          : 'src-1',
            resourceFamily            : 'issues',
            adapterSchemaVersion      : 'github-issue.v1',
            providerStateSchemaVersion: 'gh-state.v1',
            registrationEpoch         : 2,
            baseCheckpointVersion     : 0,
            baseInventoryHash         : null,
            batchId                   : 'batch-1',
            observations              : [observation],
            nextProviderState         : {cursor: 'x'},
            nextInventoryHash         : 'inv-1',
            coverage                  : {fromBasis: 'c1', toBasis: 'c9', complete: true}
        };

        expect(validateBatch(batch)).toEqual({valid: true, errors: []})
    });

    test('an undated evidence falls back to the reconciliation observedAt; actor kind fails closed', () => {
        const observation = deletionToObservation(
            {providerEntityId: 'X', deletionEvidence: {tombstoneId: 't-x'}},
            {occurrenceKind: 'issue.comment-deleted', observedAt: '2026-07-18T14:00:00Z'}
        );

        expect(observation.occurredAt).toBe('2026-07-18T14:00:00Z');
        expect(observation.actorKind, 'no actor on the evidence → unknown').toBe('unknown');
        expect(observation.actorId).toBe(null)
    });
});
