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
        author      : {login: 'octo-human', __typename: 'User'}, authorAssociation: 'OWNER',
        comments    : [
            {id: 'IC_1', createdAt: '2026-07-18T10:00:00Z', author: {login: 'replier', __typename: 'User'}, authorAssociation: 'CONTRIBUTOR'},
            {id: 'IC_2', createdAt: '2026-07-18T10:05:00Z', lastEditedAt: '2026-07-18T10:07:00Z', author: {login: 'dependabot', __typename: 'Bot'}, authorAssociation: 'NONE'}
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

    test('source-relative trust is a SEPARATE field from actor kind, and orthogonal to it', () => {
        const obs        = issueToObservations(fullIssue),
              root       = obs.find(o => o.providerEntityId === 'I_root' && o.occurrenceKind === 'issue.opened'),
              botComment = obs.find(o => o.providerEntityId === 'IC_2' && o.occurrenceKind === 'issue.comment'),
              closed     = obs.find(o => o.occurrenceKind === 'issue.closed');

        expect(root.actorKind).toBe('user');
        expect(root.sourceAssociation, 'kind and association are distinct fields').toBe('OWNER');
        // Orthogonal axes: a bot may carry any association — here NONE — and the two never conflate.
        expect(botComment.actorKind).toBe('bot');
        expect(botComment.sourceAssociation).toBe('NONE');
        // A lifecycle event has no content authorship, so its association is explicitly null, not guessed.
        expect(closed.sourceAssociation).toBe(null)
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

    test('a stray IssueComment on the timeline is ignored — the comments axis owns comments (no double-count)', () => {
        const withStray = {
            ...fullIssue,
            timeline: [
                {id: 'IC_x', __typename: 'IssueComment', createdAt: '2026-07-18T12:00:00Z', author: {login: 'replier', __typename: 'User'}},
                {id: 'CE_x', __typename: 'ClosedEvent',   createdAt: '2026-07-18T12:01:00Z', actor: {login: 'maintainer', __typename: 'User'}}
            ]
        };

        const timelineComments = issueToObservations(withStray)
            .filter(o => o.occurrenceKind === 'issue.comment' && o.providerEntityId === 'IC_x');

        expect(timelineComments, 'a timeline IssueComment produces no observation').toHaveLength(0)
    });

    test('a deleted author on the root fails closed to unknown, actorId null', () => {
        const [root] = issueToObservations({id: 'I_ghost', createdAt: '2020-01-01T00:00:00Z', author: null});

        expect(root.actorKind).toBe('unknown');
        expect(root.actorId).toBe(null)
    });

    // ------------------------------------------------------------------ AC4 — honest snapshot-only change

    test('an updatedAt newer than every explained occurrence emits a null-actor snapshot-change marker', () => {
        const changed = {
            id      : 'I_s', createdAt: '2026-07-18T09:00:00Z', updatedAt: '2026-07-18T15:00:00Z',
            author  : {login: 'a', __typename: 'User'}, authorAssociation: 'OWNER',
            timeline: [{id: 'CE', __typename: 'ClosedEvent', createdAt: '2026-07-18T10:00:00Z', actor: {login: 'm', __typename: 'User'}}]
        };

        const marker = issueToObservations(changed).find(o => o.occurrenceKind === 'issue.observed-snapshot-change');

        expect(marker, 'the unexplained change is recorded').toBeTruthy();
        expect(marker.actorId, 'no actor is fabricated').toBe(null);
        expect(marker.actorKind).toBe('unknown');
        expect(marker.lossMarker).toBe('snapshot-without-granular-event');
        expect(validateBatch(batchAround(issueToObservations(changed)))).toEqual({valid: true, errors: []})
    });

    test('an updatedAt explained by a captured occurrence emits NO snapshot-change marker', () => {
        const explained = {
            id      : 'I_e', createdAt: '2026-07-18T09:00:00Z', updatedAt: '2026-07-18T10:00:00Z',
            author  : {login: 'a', __typename: 'User'}, authorAssociation: 'OWNER',
            timeline: [{id: 'CE', __typename: 'ClosedEvent', createdAt: '2026-07-18T10:00:00Z', actor: {login: 'm', __typename: 'User'}}]
        };

        expect(issueToObservations(explained).some(o => o.occurrenceKind === 'issue.observed-snapshot-change')).toBe(false)
    });

    // ------------------------------------------------------------------ RA2 — edits are unattributed

    test('an edit is NOT attributed to the original author — lastEditedAt proves when, never who', () => {
        const edited = {
            id      : 'I_x', createdAt: '2026-07-18T09:00:00Z', lastEditedAt: '2026-07-18T12:00:00Z',
            author  : {login: 'original-author', __typename: 'User'}, authorAssociation: 'OWNER',
            comments: [{id: 'IC_x', createdAt: '2026-07-18T10:00:00Z', lastEditedAt: '2026-07-18T13:00:00Z', author: {login: 'commenter', __typename: 'User'}, authorAssociation: 'CONTRIBUTOR'}]
        };

        const obs         = issueToObservations(edited),
              issueEdit   = obs.find(o => o.occurrenceKind === 'issue.edited'),
              commentEdit = obs.find(o => o.occurrenceKind === 'issue.comment-edited');

        for (const revision of [issueEdit, commentEdit]) {
            expect(revision.actorId, 'no editor identity is fabricated').toBe(null);
            expect(revision.actorKind).toBe('unknown');
            expect(revision.sourceAssociation).toBe(null);
            expect(revision.lossMarker).toBe('editor-unattributed')
        }

        // the CREATE still carries the real author — only the edit is unattributed
        expect(obs.find(o => o.occurrenceKind === 'issue.opened').actorId).toBe('original-author');
        expect(validateBatch(batchAround(obs))).toEqual({valid: true, errors: []})
    });

    // ------------------------------------------------------------------ identity is mandatory (fail loud)

    test('a node or comment or event without a provider id is refused', () => {
        expect(() => issueToObservations(null)).toThrow('ISSUE_OBSERVATIONS_REQUIRE_NODE_ID');
        expect(() => issueToObservations({id: 'I', createdAt: 't', comments: [{createdAt: 't'}]})).toThrow('ISSUE_OBSERVATIONS_REQUIRE_COMMENT_ID');
        expect(() => issueToObservations({id: 'I', createdAt: 't', timeline: [{__typename: 'ClosedEvent', createdAt: 't'}]})).toThrow('ISSUE_OBSERVATIONS_REQUIRE_EVENT_ID')
    });
});
