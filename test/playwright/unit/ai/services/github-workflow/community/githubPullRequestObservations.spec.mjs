import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'GithubPullRequestObservationsTest'}
});

import {test, expect}                                            from '@playwright/test';
import Neo                                                       from '../../../../../../../src/Neo.mjs';
import * as core                                                 from '../../../../../../../src/core/_export.mjs';
import {BATCH_SCHEMA_VERSION, occurrenceIdentity, validateBatch} from '../../../../../../../ai/services/memory-core/communityBatchContract.mjs';
import {pullRequestToObservations}                               from '../../../../../../../ai/services/github-workflow/community/githubPullRequestObservations.mjs';

/**
 * @summary Witnesses metadata-only, stable PR/review occurrence identity, provider-backed
 * dismissal/deletion evidence, editor-only edit attribution, and popularity refusal.
 */
test.describe('githubPullRequestObservations normalizer', () => {
    const fullPullRequest = {
        id               : 'PR_1',
        number           : 1,
        createdAt        : '2026-07-01T09:00:00Z',
        updatedAt        : '2026-07-01T15:00:00Z',
        lastEditedAt     : '2026-07-01T09:30:00Z',
        authorAssociation: 'CONTRIBUTOR',
        author           : {login: 'author', __typename: 'User'},
        contentEdits     : [
            {id: 'UCE_PR_1', editedAt: '2026-07-01T09:20:00Z', editor: {login: 'author', __typename: 'User'}},
            {id: 'UCE_PR_2', editedAt: '2026-07-01T09:30:00Z', editor: {login: 'maintainer', __typename: 'User'}}
        ],
        comments         : [{
            id               : 'IC_1',
            createdAt        : '2026-07-01T10:00:00Z',
            lastEditedAt     : '2026-07-01T10:05:00Z',
            authorAssociation: 'FIRST_TIME_CONTRIBUTOR',
            author           : {login: 'commenter', __typename: 'User'},
            contentEdits     : [{id: 'UCE_IC_1', editedAt: '2026-07-01T10:05:00Z', editor: null}]
        }],
        reviews: [{
            id               : 'R_1',
            createdAt        : '2026-07-01T11:00:00Z',
            submittedAt      : '2026-07-01T11:05:00Z',
            lastEditedAt     : '2026-07-01T11:10:00Z',
            state            : 'APPROVED',
            authorAssociation: 'MEMBER',
            author           : {login: 'reviewer', __typename: 'User'},
            contentEdits     : [{id: 'UCE_R_1', editedAt: '2026-07-01T11:10:00Z', editor: {login: 'review-editor', __typename: 'User'}}]
        }],
        reviewComments: [{
            id               : 'RC_1',
            createdAt        : '2026-07-01T12:00:00Z',
            updatedAt        : '2026-07-01T12:05:00Z',
            authorAssociation: 'COLLABORATOR',
            author           : {login: 'inline-reviewer', __typename: 'User'},
            contentEdits     : [{id: 'UCE_RC_1', editedAt: '2026-07-01T12:05:00Z', editor: null}]
        }],
        timeline: [
            {id: 'CE_1', __typename: 'ClosedEvent', createdAt: '2026-07-01T12:30:00Z', actor: {login: 'maintainer', __typename: 'User'}},
            {id: 'RE_1', __typename: 'ReopenedEvent', createdAt: '2026-07-01T13:00:00Z', actor: {login: 'maintainer', __typename: 'User'}},
            {id: 'ME_1', __typename: 'MergedEvent', createdAt: '2026-07-01T13:30:00Z', actor: {login: 'maintainer', __typename: 'User'}},
            {id: 'RD_1', __typename: 'ReviewDismissedEvent', createdAt: '2026-07-01T13:45:00Z', actor: {login: 'maintainer', __typename: 'User'}, review: {id: 'R_1'}, previousReviewState: 'APPROVED'},
            {id: 'CD_1', __typename: 'CommentDeletedEvent', createdAt: '2026-07-01T14:00:00Z', actor: {login: 'maintainer', __typename: 'User'}, deletedCommentAuthor: {login: 'commenter', __typename: 'User'}},
            {id: 'STAR_1', __typename: 'StarredEvent', createdAt: '2026-07-01T14:30:00Z', actor: {login: 'fan', __typename: 'User'}}
        ]
    };

    const batchAround = observations => ({
        schemaVersion             : BATCH_SCHEMA_VERSION,
        sourceInstanceId          : 'src-pr',
        resourceFamily            : 'pulls',
        adapterSchemaVersion      : 'github-pull-request.v1',
        providerStateSchemaVersion: 'github-pull-request-state.v1',
        registrationEpoch         : 1,
        baseCheckpointVersion     : 0,
        baseInventoryHash         : null,
        batchId                   : 'batch-pr',
        observations,
        nextProviderState         : {pullRequestsCursor: 'end', rootCount: 1},
        nextInventoryHash         : 'inv-pr',
        coverage                  : {fromBasis: 'genesis', toBasis: 'end', complete: true}
    });

    test('emits every supported occurrence family as a valid metadata-only batch', () => {
        const observations = pullRequestToObservations(fullPullRequest),
              kinds        = observations.map(observation => observation.occurrenceKind);

        expect(kinds).toEqual([
            'pull_request.opened',
            'pull_request.edited',
            'pull_request.edited',
            'pull_request.comment',
            'pull_request.comment-edited',
            'pull_request.review-created',
            'pull_request.review-submitted',
            'pull_request.review-edited',
            'pull_request.review-comment',
            'pull_request.review-comment-edited',
            'pull_request.closed',
            'pull_request.reopened',
            'pull_request.merged',
            'pull_request.review-dismissed',
            'pull_request.comment-deleted',
            'pull_request.observed-snapshot-change'
        ]);
        expect(validateBatch(batchAround(observations))).toEqual({valid: true, errors: []});
        expect(JSON.stringify(observations)).not.toContain('StarredEvent')
    });

    test('source association stays separate from actor kind and response families keep their actors', () => {
        const observations = pullRequestToObservations(fullPullRequest),
              root         = observations.find(observation => observation.occurrenceKind === 'pull_request.opened'),
              review       = observations.find(observation => observation.occurrenceKind === 'pull_request.review-submitted'),
              inline       = observations.find(observation => observation.occurrenceKind === 'pull_request.review-comment');

        expect(root).toMatchObject({actorId: 'author', actorKind: 'user', sourceAssociation: 'CONTRIBUTOR'});
        expect(review).toMatchObject({actorId: 'reviewer', actorKind: 'user', sourceAssociation: 'MEMBER'});
        expect(review).toMatchObject({providerState: 'APPROVED', parentProviderEntityId: 'PR_1'});
        expect(inline).toMatchObject({
            actorId: 'inline-reviewer', actorKind: 'user', sourceAssociation: 'COLLABORATOR', parentProviderEntityId: 'PR_1'
        })
    });

    test('edits use provider editor evidence only and never reuse the original author', () => {
        const observations = pullRequestToObservations(fullPullRequest),
              rootEdits    = observations.filter(observation => observation.occurrenceKind === 'pull_request.edited'),
              commentEdit  = observations.find(observation => observation.occurrenceKind === 'pull_request.comment-edited'),
              reviewEdit   = observations.find(observation => observation.occurrenceKind === 'pull_request.review-edited'),
              inlineEdit   = observations.find(observation => observation.occurrenceKind === 'pull_request.review-comment-edited');

        expect(rootEdits).toHaveLength(2);
        expect(rootEdits[1]).toMatchObject({
            actorId: 'maintainer', actorKind: 'user', occurrenceCoordinate: 'UCE_PR_2', revisionOf: 'PR_1:opened'
        });
        expect(reviewEdit).toMatchObject({actorId: 'review-editor', actorKind: 'user'});

        for (const unattributed of [commentEdit, inlineEdit]) {
            expect(unattributed).toMatchObject({
                actorId  : null,
                actorKind: 'unknown'
            })
        }
    });

    test('dismissal and deletion evidence are immutable provider events, not mutable snapshot state', () => {
        const approved  = pullRequestToObservations(fullPullRequest),
              dismissed = pullRequestToObservations({
                  ...fullPullRequest,
                  reviews: [{...fullPullRequest.reviews[0], state: 'DISMISSED'}]
              }),
              dismissal = approved.find(observation => observation.occurrenceKind === 'pull_request.review-dismissed'),
              deletion  = approved.find(observation => observation.occurrenceKind === 'pull_request.comment-deleted');

        expect(dismissal).toMatchObject({
            providerEntityId      : 'R_1',
            parentProviderEntityId: 'PR_1',
            providerState         : 'DISMISSED',
            occurrenceCoordinate  : 'RD_1'
        });
        expect(deletion).toMatchObject({
            providerEntityId: 'PR_1',
            deletionEvidence: {eventId: 'CD_1', deletedCommentAuthorId: 'commenter'}
        });
        expect(dismissed).toEqual(approved);
        expect(dismissed.map(observation => occurrenceIdentity('src-pr', observation)))
            .toEqual(approved.map(observation => occurrenceIdentity('src-pr', observation)))
    });

    test('a mutable DISMISSED review without matching provider dismissal evidence fails closed', () => {
        expect(() => pullRequestToObservations({
            ...fullPullRequest,
            reviews : [{...fullPullRequest.reviews[0], state: 'DISMISSED'}],
            timeline: fullPullRequest.timeline.filter(event => event.__typename !== 'ReviewDismissedEvent')
        })).toThrow('PULL_REQUEST_OBSERVATIONS_DISMISSED_REVIEW_WITHOUT_EVENT')
    });

    test('missing stable ids fail loud at each entity boundary', () => {
        expect(() => pullRequestToObservations(null)).toThrow('PULL_REQUEST_OBSERVATIONS_REQUIRE_NODE_ID');
        expect(() => pullRequestToObservations({id: 'PR', createdAt: 't', comments: [{createdAt: 't'}]}))
            .toThrow('PULL_REQUEST_OBSERVATIONS_REQUIRE_COMMENT_ID');
        expect(() => pullRequestToObservations({id: 'PR', createdAt: 't', reviews: [{createdAt: 't'}]}))
            .toThrow('PULL_REQUEST_OBSERVATIONS_REQUIRE_REVIEW_ID');
        expect(() => pullRequestToObservations({id: 'PR', createdAt: 't', timeline: [{__typename: 'ClosedEvent', createdAt: 't'}]}))
            .toThrow('PULL_REQUEST_OBSERVATIONS_REQUIRE_EVENT_ID')
    })
});
