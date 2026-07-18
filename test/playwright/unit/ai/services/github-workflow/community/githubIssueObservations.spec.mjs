import {setup} from '../../../../../setup.mjs';

const appName = 'GithubIssueObservationsTest';

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

import {test, expect}                                            from '@playwright/test';
import Neo                                                       from '../../../../../../../src/Neo.mjs';
import * as core                                                 from '../../../../../../../src/core/_export.mjs';
import {BATCH_SCHEMA_VERSION, validateBatch, occurrenceIdentity} from '../../../../../../../ai/services/memory-core/communityBatchContract.mjs';
import {actorKindFromTypename, issueToObservations}              from '../../../../../../../ai/services/github-workflow/community/githubIssueObservations.mjs';

/**
 * @summary Witnesses that the GitHub issue normalizer emits observations the shipped
 * community-activity-batch.v1 contract accepts — admissible, prose-free, stably-identified,
 * and popularity-refusing by construction — with no attention decision taken in the producer.
 */
test.describe('githubIssueObservations normalizer', () => {
    const fullIssue = {
        id          : 'I_root',
        createdAt   : '2026-07-18T09:00:00Z',
        lastEditedAt: '2026-07-18T09:30:00Z',
        author      : {login: 'octo-human', __typename: 'User'},
        comments    : [
            {id: 'IC_1', createdAt: '2026-07-18T10:00:00Z', author: {login: 'replier', __typename: 'User'}},
            {id: 'IC_2', createdAt: '2026-07-18T10:05:00Z', lastEditedAt: '2026-07-18T10:07:00Z', author: {login: 'dependabot', __typename: 'Bot'}}
        ],
        timeline    : [
            {id: 'CE_1', __typename: 'ClosedEvent',   createdAt: '2026-07-18T11:00:00Z', actor: {login: 'maintainer', __typename: 'User'}},
            {id: 'RE_1', __typename: 'ReopenedEvent', createdAt: '2026-07-18T11:30:00Z', actor: {login: 'maintainer', __typename: 'User'}},
            {id: 'LE_1', __typename: 'LabeledEvent',  createdAt: '2026-07-18T11:31:00Z', actor: {login: 'maintainer', __typename: 'User'}}
        ]
    };

    const batchAround = observations => ({
        schemaVersion             : BATCH_SCHEMA_VERSION,
        sourceInstanceId          : 'src-1',
        resourceFamily            : 'issues',
        adapterSchemaVersion      : 'github-issue.v1',
        providerStateSchemaVersion: 'gh-state.v1',
        registrationEpoch         : 2,
        baseCheckpointVersion     : 0,
        baseInventoryHash         : null,
        batchId                   : 'batch-1',
        observations,
        nextProviderState         : {cursor: 'x'},
        nextInventoryHash         : 'inv-1',
        coverage                  : {fromBasis: 'c1', toBasis: 'c9', complete: true}
    });

    // ------------------------------------------------------------------ actor kind axis

    test('actor kind is read from the provider typename; absent/unknown fails closed', () => {
        expect(actorKindFromTypename('User')).toBe('user');
        expect(actorKindFromTypename('Bot')).toBe('bot');
        expect(actorKindFromTypename('Organization')).toBe('organization');
        expect(actorKindFromTypename('Mannequin')).toBe('mannequin');
        expect(actorKindFromTypename('EnterpriseUserAccount')).toBe('enterprise-user');
        expect(actorKindFromTypename(undefined), 'a deleted/ghost actor').toBe('unknown');
        expect(actorKindFromTypename('SomethingNew'), 'an unrecognized kind').toBe('unknown')
    });

    // ------------------------------------------------------------------ the emitted shape is admissible

    test('a fully-populated issue yields observations that form a VALID v1 batch', () => {
        const observations = issueToObservations(fullIssue);

        expect(validateBatch(batchAround(observations))).toEqual({valid: true, errors: []})
    });

    test('the root, an edit, comments, comment-edit, and whitelisted events each become a distinct occurrence', () => {
        const kinds = issueToObservations(fullIssue).map(o => o.occurrenceKind);

        expect(kinds).toEqual([
            'issue.opened', 'issue.edited',
            'issue.comment', 'issue.comment', 'issue.comment-edited',
            'issue.closed', 'issue.reopened', 'issue.labeled'
        ])
    });

    // ------------------------------------------------------------------ stable, revision-distinct identity

    test('a revision is coordinate-distinct from the create, and identity is stable across re-runs', () => {
        const first  = issueToObservations(fullIssue),
              second = issueToObservations(fullIssue),
              open   = first.find(o => o.occurrenceKind === 'issue.opened'),
              edit   = first.find(o => o.occurrenceKind === 'issue.edited');

        expect(occurrenceIdentity('src-1', open), 'edit is not the open')
            .not.toBe(occurrenceIdentity('src-1', edit));
        // Re-reconciling the same node reproduces byte-identical identity for every occurrence.
        expect(second.map(o => occurrenceIdentity('src-1', o)))
            .toEqual(first.map(o => occurrenceIdentity('src-1', o)))
    });

    // ------------------------------------------------------------------ refusal by construction

    test('an unmapped timeline event (popularity or any unknown kind) produces no observation', () => {
        const withNoise = {
            ...fullIssue,
            timeline: [
                {id: 'X_1', __typename: 'StarredEvent',    createdAt: '2026-07-18T12:00:00Z', actor: {login: 'fan', __typename: 'User'}},
                {id: 'X_2', __typename: 'MentionedEvent',  createdAt: '2026-07-18T12:01:00Z', actor: {login: 'fan', __typename: 'User'}}
            ]
        };

        const kinds = issueToObservations(withNoise).map(o => o.occurrenceKind);

        expect(kinds).not.toContain('issue.starred');
        expect(kinds.filter(k => k.startsWith('issue.'))).toEqual(['issue.opened', 'issue.edited', 'issue.comment', 'issue.comment', 'issue.comment-edited'])
    });

    test('a deleted author on the root fails closed to unknown, actorId null', () => {
        const [root] = issueToObservations({id: 'I_ghost', createdAt: '2020-01-01T00:00:00Z', author: null});

        expect(root.actorKind).toBe('unknown');
        expect(root.actorId).toBe(null)
    });

    // ------------------------------------------------------------------ identity is mandatory (fail loud)

    test('a node or comment or event without a provider id is refused', () => {
        expect(() => issueToObservations(null)).toThrow('ISSUE_OBSERVATIONS_REQUIRE_NODE_ID');
        expect(() => issueToObservations({id: 'I', createdAt: 't', comments: [{createdAt: 't'}]})).toThrow('ISSUE_OBSERVATIONS_REQUIRE_COMMENT_ID');
        expect(() => issueToObservations({id: 'I', createdAt: 't', timeline: [{__typename: 'ClosedEvent', createdAt: 't'}]})).toThrow('ISSUE_OBSERVATIONS_REQUIRE_EVENT_ID')
    });
});
