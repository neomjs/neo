import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'GithubPullRequestReconciliationTest'}
});

import {test, expect}                 from '@playwright/test';
import Neo                            from '../../../../../../../src/Neo.mjs';
import * as core                      from '../../../../../../../src/core/_export.mjs';
import {reconcilePullRequestActivity} from '../../../../../../../ai/services/github-workflow/community/githubPullRequestReconciliation.mjs';

/**
 * @summary Witnesses all-state root enumeration, independent child/edit-axis completion, timeline
 * mutation/count evidence, content revision verification, and adapter-owned unsupported gaps.
 */
test.describe('reconcilePullRequestActivity runner', () => {
    const editConnection = (nodes=[], overrides={}) => ({
        totalCount: nodes.length,
        nodes,
        pageInfo  : {hasNextPage: false, endCursor: null},
        ...overrides
    });

    const emptyConnection = () => ({nodes: [], pageInfo: {hasNextPage: false, endCursor: null}});

    const contentEntity = (spec={}) => ({
        updatedAt          : spec.createdAt,
        lastEditedAt       : null,
        includesCreatedEdit: false,
        userContentEdits   : editConnection(),
        ...spec
    });

    const pullRequest = ({id, number, timeline}) => {
        const createdAt = `2026-07-0${number}T09:00:00Z`,
              updatedAt = `2026-07-0${number}T15:00:00Z`;

        return contentEntity({
            id,
            number,
            createdAt,
            updatedAt,
            authorAssociation: 'CONTRIBUTOR',
            author           : {login: `author-${number}`, __typename: 'User'},
            comments         : {...emptyConnection(), totalCount: 0},
            reviews          : {...emptyConnection(), totalCount: 0},
            timeline         : timeline ?? {
                filteredCount: 0,
                updatedAt,
                ...emptyConnection()
            }
        })
    };

    const pr1 = pullRequest({
        id      : 'PR_1',
        number  : 1,
        timeline: {
            filteredCount: 2,
            updatedAt    : '2026-07-01T14:30:00Z',
            nodes        : [{id: 'CE_1', __typename: 'ClosedEvent', createdAt: '2026-07-01T12:00:00Z', actor: {login: 'maintainer', __typename: 'User'}}],
            pageInfo     : {hasNextPage: true, endCursor: 'T1'}
        }
    });
    const pr2 = pullRequest({id: 'PR_2', number: 2});

    const censusRevision = (root, overrides={}) => ({
        id       : root.id,
        updatedAt: root.updatedAt,
        timeline : {
            filteredCount: root.timeline.filteredCount,
            updatedAt    : root.timeline.updatedAt
        },
        ...overrides
    });

    const buildSeams = (overrides={}) => ({
        fetchPullRequestsPage: async ({cursor}) => cursor === null
            ? {pullRequests: [pr1], totalCount: 2, pageInfo: {hasNextPage: true, endCursor: 'ROOT_1'}}
            : {pullRequests: [pr2], totalCount: 2, pageInfo: {hasNextPage: false, endCursor: 'ROOT_2'}},
        exhaustConversation: async ({pullRequest: root}) => root.id === 'PR_1'
            ? {
                comments: [
                    contentEntity({id: 'IC_1', createdAt: '2026-07-01T10:00:00Z', authorAssociation: 'CONTRIBUTOR', author: {login: 'commenter', __typename: 'User'}}),
                    contentEntity({id: 'IC_2', createdAt: '2026-07-01T10:05:00Z', authorAssociation: 'NONE', author: {login: 'bot', __typename: 'Bot'}})
                ],
                reviews: [contentEntity({
                    id   : 'R_1', createdAt: '2026-07-01T11:00:00Z', submittedAt: '2026-07-01T11:05:00Z',
                    state: 'APPROVED', authorAssociation: 'MEMBER', author: {login: 'reviewer', __typename: 'User'}
                })]
            }
            : {comments: [], reviews: []},
        fetchTimelinePage: async ({pullRequestId, cursor}) => {
            expect(pullRequestId).toBe('PR_1');
            expect(cursor).toBe('T1');
            return {
                rootUpdatedAt      : pr1.updatedAt,
                connectionUpdatedAt: pr1.timeline.updatedAt,
                filteredCount      : 2,
                events             : [{id: 'ME_1', __typename: 'MergedEvent', createdAt: '2026-07-01T14:00:00Z', actor: {login: 'maintainer', __typename: 'User'}}],
                pageInfo           : {hasNextPage: false, endCursor: 'T2'}
            }
        },
        fetchReviewCommentSnapshot: async () => ({
            reviewCommentsByPullRequestNumber: new Map([[1, [contentEntity({
                id               : 'RC_1', nodeId: 'PRRC_1', createdAt: '2026-07-01T13:00:00Z',
                authorAssociation: 'COLLABORATOR', author: {login: 'inline', __typename: 'User'}
            })]]]),
            failuresByPullRequestNumber: new Map()
        }),
        fetchContentEditHeads: async ({entities}) => entities.map(value => ({status: 'fulfilled', value})),
        fetchContentEditsPage: async () => { throw new Error('no edit continuation expected') },
        verifyContentEntities: async ({entities}) => entities.map(value => ({status: 'fulfilled', value})),
        fetchCensusPage      : async ({cursor}) => cursor === null
            ? {pullRequests: [censusRevision(pr1)], totalCount: 2, pageInfo: {hasNextPage: true, endCursor: 'VERIFY_1'}}
            : {pullRequests: [censusRevision(pr2)], totalCount: 2, pageInfo: {hasNextPage: false, endCursor: 'VERIFY_2'}},
        ...overrides
    });

    const countKind = (observations, kind) => observations.filter(observation => observation.occurrenceKind === kind).length;

    test('exhausts all roots and child axes, then verifies the root census', async () => {
        const result = await reconcilePullRequestActivity(buildSeams());

        expect(result.currentInventory).toEqual(['PR_1', 'PR_2']);
        expect(countKind(result.observations, 'pull_request.opened')).toBe(2);
        expect(countKind(result.observations, 'pull_request.comment')).toBe(2);
        expect(countKind(result.observations, 'pull_request.review-created')).toBe(1);
        expect(countKind(result.observations, 'pull_request.review-submitted')).toBe(1);
        expect(countKind(result.observations, 'pull_request.review-comment')).toBe(1);
        expect(countKind(result.observations, 'pull_request.closed')).toBe(1);
        expect(countKind(result.observations, 'pull_request.merged')).toBe(1);
        expect(result.coverage).toMatchObject({fromBasis: 'genesis', toBasis: 'ROOT_2', complete: false});
        expect(result.nextProviderState).toEqual({pullRequestsCursor: 'ROOT_2', rootCount: 2})
    });

    test('a timeline cap emits partial evidence plus an explicit gap', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            fetchTimelinePage: async () => { throw new Error('cap must stop before continuation') }
        }), {maxTimelinePagesPerPullRequest: 1});

        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(countKind(result.observations, 'pull_request.merged')).toBe(0);
        expect(result.coverage.complete).toBe(false);
        expect(result.coverage.gaps).toContainEqual({axis: 'timeline', pullRequestId: 'PR_1', reason: 'page-cap'})
    });

    test('a child verification failure admits no mixed snapshot but retains the live root inventory', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            fetchReviewCommentSnapshot: async () => ({
                reviewCommentsByPullRequestNumber: new Map(),
                failuresByPullRequestNumber      : new Map([[1, 'review comments mutated during verification']])
            })
        }));

        expect(result.currentInventory).toEqual(['PR_1', 'PR_2']);
        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'inline-review-comments',
            pullRequestId: 'PR_1',
            reason       : 'review comments mutated during verification'
        })
    });

    test('a final root mutation rejects that PR snapshot and degrades coverage', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            verifyContentEntities: async ({entities}) => entities.map(entity => ({
                status: 'fulfilled',
                value : {
                    ...entity,
                    updatedAt: entity.id === 'PR_1' ? '2026-07-01T16:00:00Z' : entity.updatedAt
                }
            }))
        }));

        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'pull-request-snapshot',
            pullRequestId: 'PR_1',
            reason       : 'PULL_REQUEST_RECONCILIATION_CONTENT_MUTATED:PR_1'
        })
    });

    test('one rejected batched edit head invalidates only its owning PR', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            fetchContentEditHeads: async ({entities}) => entities.map(entity => entity.id === 'PR_1'
                ? {status: 'rejected', reason: 'head unavailable'}
                : {status: 'fulfilled', value: entity})
        }));

        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(result.observations.some(observation => observation.providerEntityId === 'PR_2')).toBe(true);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'content-edits',
            pullRequestId: 'PR_1',
            reason       : 'head unavailable'
        })
    });

    test('a changed second-pass census becomes an honest verification gap', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            fetchCensusPage: async ({cursor}) => cursor === null
                ? {pullRequests: [censusRevision(pr1, {updatedAt: '2026-07-01T16:00:00Z'})], totalCount: 2, pageInfo: {hasNextPage: true, endCursor: 'VERIFY_1'}}
                : {pullRequests: [censusRevision(pr2)], totalCount: 2, pageInfo: {hasNextPage: false, endCursor: 'VERIFY_2'}}
        }));

        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(result.observations.some(observation => observation.providerEntityId === 'PR_2')).toBe(true);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'pull-request-census-verification',
            pullRequestId: 'PR_1',
            reason       : 'PULL_REQUEST_RECONCILIATION_ROOT_MUTATED:PR_1'
        })
    });

    test('a timeline-only second-pass mutation rejects only that PR snapshot', async () => {
        const result = await reconcilePullRequestActivity(buildSeams({
            fetchCensusPage: async ({cursor}) => cursor === null
                ? {
                    pullRequests: [censusRevision(pr1, {timeline: {
                        filteredCount: pr1.timeline.filteredCount,
                        updatedAt    : '2026-07-01T14:31:00Z'
                    }})],
                    totalCount: 2,
                    pageInfo  : {hasNextPage: true, endCursor: 'VERIFY_1'}
                }
                : {
                    pullRequests: [censusRevision(pr2)],
                    totalCount  : 2,
                    pageInfo    : {hasNextPage: false, endCursor: 'VERIFY_2'}
                }
        }));

        expect(result.observations.some(observation => observation.providerEntityId === 'PR_1')).toBe(false);
        expect(result.observations.some(observation => observation.providerEntityId === 'PR_2')).toBe(true);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'pull-request-census-verification',
            pullRequestId: 'PR_1',
            reason       : 'PULL_REQUEST_RECONCILIATION_TIMELINE_MUTATED:PR_1'
        })
    });

    test('every stable edit revision is exhausted with independent cursor progress', async () => {
        const firstEdit = {id: 'UCE_1', editedAt: '2026-07-02T10:00:00Z', editor: {login: 'author-2', __typename: 'User'}},
              lastEdit  = {id: 'UCE_2', editedAt: '2026-07-02T11:00:00Z', editor: {login: 'maintainer', __typename: 'User'}},
              editedPr  = {
                  ...pr2,
                  lastEditedAt    : lastEdit.editedAt,
                  userContentEdits: editConnection([firstEdit], {
                      totalCount: 2,
                      pageInfo  : {hasNextPage: true, endCursor: 'EDIT_1'}
                  })
              },
              seams = buildSeams({
                  fetchPullRequestsPage: async () => ({
                      pullRequests: [editedPr], totalCount: 1, pageInfo: {hasNextPage: false, endCursor: 'ROOT_EDIT'}
                  }),
                  exhaustConversation       : async () => ({comments: [], reviews: []}),
                  fetchReviewCommentSnapshot: async () => ({
                      reviewCommentsByPullRequestNumber: new Map(), failuresByPullRequestNumber: new Map()
                  }),
                  fetchContentEditsPage: async ({entityNodeId, cursor}) => {
                      expect({entityNodeId, cursor}).toEqual({entityNodeId: 'PR_2', cursor: 'EDIT_1'});
                      return {
                          id                 : 'PR_2',
                          createdAt          : editedPr.createdAt,
                          updatedAt          : editedPr.updatedAt,
                          includesCreatedEdit: false,
                          userContentEdits   : editConnection([lastEdit], {
                              totalCount: 2,
                              pageInfo  : {hasNextPage: false, endCursor: 'EDIT_2'}
                          })
                      }
                  },
                  fetchCensusPage: async () => ({
                      pullRequests: [censusRevision(editedPr)],
                      totalCount  : 1,
                      pageInfo    : {hasNextPage: false, endCursor: 'VERIFY_EDIT'}
                  })
              }),
              result = await reconcilePullRequestActivity(seams),
              edits  = result.observations.filter(observation => observation.occurrenceKind === 'pull_request.edited');

        expect(edits).toHaveLength(2);
        expect(edits.map(edit => edit.occurrenceCoordinate)).toEqual(['UCE_1', 'UCE_2']);
        expect(edits.map(edit => edit.revisionOf)).toEqual(['PR_2:opened', 'PR_2:opened'])
    });

    test('a duplicate edit id degrades the PR instead of admitting a collapsed revision history', async () => {
        const edit     = {id: 'UCE_DUP', editedAt: '2026-07-02T10:00:00Z', editor: null},
              editedPr = {
                  ...pr2,
                  lastEditedAt    : edit.editedAt,
                  userContentEdits: editConnection([edit], {
                      totalCount: 2,
                      pageInfo  : {hasNextPage: true, endCursor: 'EDIT_DUP_1'}
                  })
              },
              result = await reconcilePullRequestActivity(buildSeams({
                  fetchPullRequestsPage: async () => ({
                      pullRequests: [editedPr], totalCount: 1, pageInfo: {hasNextPage: false, endCursor: 'ROOT_DUP'}
                  }),
                  exhaustConversation       : async () => ({comments: [], reviews: []}),
                  fetchReviewCommentSnapshot: async () => ({
                      reviewCommentsByPullRequestNumber: new Map(), failuresByPullRequestNumber: new Map()
                  }),
                  fetchContentEditsPage: async () => ({
                      id                 : editedPr.id,
                      createdAt          : editedPr.createdAt,
                      updatedAt          : editedPr.updatedAt,
                      includesCreatedEdit: false,
                      userContentEdits   : editConnection([edit], {
                          totalCount: 2,
                          pageInfo  : {hasNextPage: false, endCursor: 'EDIT_DUP_2'}
                      })
                  }),
                  fetchCensusPage: async () => ({
                      pullRequests: [censusRevision(editedPr)],
                      totalCount  : 1,
                      pageInfo    : {hasNextPage: false, endCursor: 'VERIFY_DUP'}
                  })
              }));

        expect(result.observations).toHaveLength(0);
        expect(result.coverage.gaps).toContainEqual({
            axis         : 'content-edits',
            pullRequestId: 'PR_2',
            reason       : 'PULL_REQUEST_RECONCILIATION_DUPLICATE_EDIT_ID:UCE_DUP'
        })
    });

    test('missing timeline pageInfo and filtered-count mismatches fail closed', async () => {
        const malformed       = {...pr2, timeline: {filteredCount: 0, updatedAt: pr2.updatedAt, nodes: []}},
              malformedResult = await reconcilePullRequestActivity(buildSeams({
                  fetchPullRequestsPage: async () => ({
                      pullRequests: [malformed], totalCount: 1, pageInfo: {hasNextPage: false, endCursor: 'ROOT_BAD'}
                  }),
                  exhaustConversation       : async () => ({comments: [], reviews: []}),
                  fetchReviewCommentSnapshot: async () => ({
                      reviewCommentsByPullRequestNumber: new Map(), failuresByPullRequestNumber: new Map()
                  }),
                  fetchCensusPage: async () => ({
                      pullRequests: [censusRevision(malformed)], totalCount: 1,
                      pageInfo    : {hasNextPage: false, endCursor: 'VERIFY_BAD'}
                  })
              })),
              countResult = await reconcilePullRequestActivity(buildSeams({
                  fetchTimelinePage: async () => ({
                      rootUpdatedAt      : pr1.updatedAt,
                      connectionUpdatedAt: pr1.timeline.updatedAt,
                      filteredCount      : 2,
                      events             : [],
                      pageInfo           : {hasNextPage: false, endCursor: 'T2'}
                  })
              }));

        expect(malformedResult.coverage.gaps).toContainEqual({
            axis: 'timeline', pullRequestId: 'PR_2', reason: 'PULL_REQUEST_RECONCILIATION_TIMELINE_PAGE_INVALID'
        });
        expect(countResult.coverage.gaps).toContainEqual({
            axis: 'timeline', pullRequestId: 'PR_1', reason: 'PULL_REQUEST_RECONCILIATION_TIMELINE_COUNT_MISMATCH'
        })
    });

    test('unsupported deletion histories are adapter-owned and cannot be caller-suppressed', async () => {
        const result = await reconcilePullRequestActivity(buildSeams(), {unsupportedHistoryGaps: []});

        expect(result.coverage.complete).toBe(false);
        expect(result.coverage.gaps.map(gap => gap.axis)).toEqual(expect.arrayContaining([
            'comment-deletion-correlation',
            'review-deletions', 'inline-review-comment-deletions'
        ]))
    });

    test('duplicate provider root ids fail loud', async () => {
        const seams = buildSeams({
            fetchPullRequestsPage: async () => ({
                pullRequests: [pr1, pr1],
                totalCount  : 2,
                pageInfo    : {hasNextPage: false, endCursor: 'END'}
            })
        });

        await expect(reconcilePullRequestActivity(seams))
            .rejects.toThrow('PULL_REQUEST_RECONCILIATION_DUPLICATE_ROOT_ID:PR_1')
    })
});
