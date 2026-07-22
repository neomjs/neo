import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {name: 'PullRequestReconciliationServiceTest'}
});

import {test, expect}                        from '@playwright/test';
import Neo                                   from '../../../../../../src/Neo.mjs';
import * as core                             from '../../../../../../src/core/_export.mjs';
import PullRequestReconciliationService      from '../../../../../../ai/services/github-workflow/PullRequestReconciliationService.mjs';
import {canonicalBatchDigest, validateBatch} from '../../../../../../ai/services/memory-core/communityBatchContract.mjs';

/**
 * @summary End-to-end orchestration witness using fake GraphQL, REST, registry, and admission
 * seams. Proves literal reuse of PR-history child exhaustion, REST two-pass verification, neutral
 * batch validity, checkpoint discipline, and fail-closed absence handling.
 */
test.describe('PullRequestReconciliationService.reconcile', () => {
    const updatedAt         = '2026-07-01T15:00:00Z',
          timelineUpdatedAt = '2026-07-01T14:30:00Z';

    const edit = (id, editedAt, login=null) => ({
        id,
        editedAt,
        editor: login ? {login, __typename: 'User'} : null
    });

    const editConnection = (nodes=[]) => ({
        totalCount: nodes.length,
        nodes,
        pageInfo  : {hasNextPage: false, endCursor: nodes.length ? `EDIT_${nodes.at(-1).id}` : null}
    });

    const comment = id => ({
        id,
        createdAt          : '2026-07-01T10:00:00Z',
        updatedAt          : id === 'IC_1' ? '2026-07-01T10:10:00Z' : '2026-07-01T10:00:00Z',
        lastEditedAt       : id === 'IC_1' ? '2026-07-01T10:10:00Z' : null,
        includesCreatedEdit: id === 'IC_1',
        userContentEdits   : editConnection(id === 'IC_1' ? [
            edit('UCE_IC_CREATED', '2026-07-01T10:00:00Z', 'commenter'),
            edit('UCE_IC_1', '2026-07-01T10:05:00Z'),
            edit('UCE_IC_2', '2026-07-01T10:10:00Z', 'maintainer')
        ] : []),
        authorAssociation: 'CONTRIBUTOR',
        author           : {login: 'commenter', __typename: 'User'},
        editor           : null
    });

    const review = id => ({
        id,
        createdAt          : '2026-07-01T11:00:00Z',
        updatedAt          : '2026-07-01T11:05:00Z',
        submittedAt        : '2026-07-01T11:05:00Z',
        lastEditedAt       : id === 'R_1' ? '2026-07-01T11:04:00Z' : null,
        includesCreatedEdit: id === 'R_1',
        userContentEdits   : editConnection(id === 'R_1' ? [
            edit('UCE_R_CREATED', '2026-07-01T11:00:00Z', 'reviewer'),
            edit('UCE_R_1', '2026-07-01T11:02:00Z', 'reviewer'),
            edit('UCE_R_2', '2026-07-01T11:04:00Z', 'review-editor')
        ] : []),
        state            : 'APPROVED',
        authorAssociation: 'MEMBER',
        author           : {login: 'reviewer', __typename: 'User'},
        editor           : null
    });

    const event = (id, typename, createdAt) => ({
        id,
        __typename: typename,
        createdAt,
        actor     : {login: 'maintainer', __typename: 'User'}
    });

    const rootNode = () => ({
        id                 : 'PR_9',
        number             : 9,
        state              : 'MERGED',
        createdAt          : '2026-07-01T09:00:00Z',
        updatedAt,
        lastEditedAt       : '2026-07-01T09:30:00Z',
        includesCreatedEdit: true,
        userContentEdits   : editConnection([
            edit('UCE_PR_CREATED', '2026-07-01T09:00:00Z', 'author'),
            edit('UCE_PR_1', '2026-07-01T09:15:00Z', 'author'),
            edit('UCE_PR_2', '2026-07-01T09:30:00Z', 'maintainer')
        ]),
        authorAssociation: 'CONTRIBUTOR',
        author           : {login: 'author', __typename: 'User'},
        editor           : null,
        comments         : {
            totalCount: 2,
            nodes     : [comment('IC_1')],
            pageInfo  : {hasNextPage: true, endCursor: 'C1'}
        },
        reviews: {
            totalCount: 2,
            nodes     : [review('R_1')],
            pageInfo  : {hasNextPage: true, endCursor: 'R1'}
        },
        timelineItems: {
            filteredCount: 2,
            updatedAt    : timelineUpdatedAt,
            nodes        : [event('CE_1', 'ClosedEvent', '2026-07-01T12:00:00Z')],
            pageInfo     : {hasNextPage: true, endCursor: 'T1'}
        }
    });

    const inlineComment = (overrides={}) => ({
        id                    : 101,
        node_id               : 'PRRC_101',
        pull_request_review_id: 201,
        user                  : {login: 'inline-reviewer', type: 'User'},
        author_association    : 'COLLABORATOR',
        body                  : 'prose stays outside admitted observations',
        created_at            : '2026-07-01T13:00:00Z',
        updated_at            : '2026-07-01T13:10:00Z',
        html_url              : 'https://example.invalid/comment/101',
        pull_request_url      : 'https://api.github.com/repos/neomjs/neo/pulls/9',
        in_reply_to_id        : null,
        ...overrides
    });

    const makeGraphql = (overrides={}) => {
        const calls   = [];
        const service = {
            calls,
            query: async (queryString, variables) => {
                calls.push({queryString, variables});

                if (queryString.includes('ReconcilePullRequests')) {
                    return {repository: {pullRequests: {
                        totalCount: 1,
                        nodes     : [rootNode()],
                        pageInfo  : {hasNextPage: false, endCursor: 'ROOT_END'}
                    }}}
                }

                if (queryString.includes('ReconcilePullRequestChildren')) {
                    const continuation = variables.commentsCursor || variables.reviewsCursor;

                    return {repository: {pullRequest: {
                        updatedAt,
                        comments: continuation ? {
                            totalCount: 2,
                            nodes     : [comment('IC_2')],
                            pageInfo  : {hasNextPage: false, endCursor: 'C2'}
                        } : {
                            totalCount: 2,
                            nodes     : [comment('IC_1')],
                            pageInfo  : {hasNextPage: true, endCursor: 'C1'}
                        },
                        reviews: continuation ? {
                            totalCount: 2,
                            nodes     : [review('R_2')],
                            pageInfo  : {hasNextPage: false, endCursor: 'R2'}
                        } : {
                            totalCount: 2,
                            nodes     : [review('R_1')],
                            pageInfo  : {hasNextPage: true, endCursor: 'R1'}
                        }
                    }}}
                }

                if (queryString.includes('ReconcilePullRequestTimeline')) {
                    return {node: {
                        updatedAt,
                        timelineItems: {
                            filteredCount: 2,
                            updatedAt    : timelineUpdatedAt,
                            nodes        : [event('ME_1', 'MergedEvent', '2026-07-01T14:00:00Z')],
                            pageInfo     : {hasNextPage: false, endCursor: 'T2'}
                        }
                    }}
                }

                if (queryString.includes('ReconcilePullRequestContentEditHeads')) {
                    const inline = inlineComment(),
                          heads  = new Map([
                              ['PR_9', {...rootNode(), __typename: 'PullRequest'}],
                              ['IC_1', {...comment('IC_1'), __typename: 'IssueComment'}],
                              ['IC_2', {...comment('IC_2'), __typename: 'IssueComment'}],
                              ['R_1', {...review('R_1'), __typename: 'PullRequestReview'}],
                              ['R_2', {...review('R_2'), __typename: 'PullRequestReview'}],
                              ['PRRC_101', {
                                  id                 : inline.node_id,
                                  __typename         : 'PullRequestReviewComment',
                                  createdAt          : inline.created_at,
                                  updatedAt          : inline.updated_at,
                                  includesCreatedEdit: true,
                                  userContentEdits   : editConnection([
                                      edit('UCE_RC_CREATED', inline.created_at, 'inline-reviewer'),
                                      edit('UCE_RC_1', '2026-07-01T13:05:00Z'),
                                      edit('UCE_RC_2', inline.updated_at, 'inline-editor')
                                  ])
                              }]
                          ]);

                    return {nodes: variables.ids.map(id => heads.get(id) ?? null)}
                }

                if (queryString.includes('ReconcilePullRequestContentRevisions')) {
                    const revisions = new Map([
                        ['PR_9', {id: 'PR_9', __typename: 'PullRequest', updatedAt}],
                        ['IC_1', {id: 'IC_1', __typename: 'IssueComment', updatedAt: comment('IC_1').updatedAt}],
                        ['IC_2', {id: 'IC_2', __typename: 'IssueComment', updatedAt: comment('IC_2').updatedAt}],
                        ['R_1', {id: 'R_1', __typename: 'PullRequestReview', updatedAt: review('R_1').updatedAt}],
                        ['R_2', {id: 'R_2', __typename: 'PullRequestReview', updatedAt: review('R_2').updatedAt}],
                        ['PRRC_101', {id: 'PRRC_101', __typename: 'PullRequestReviewComment', updatedAt: inlineComment().updated_at}]
                    ]);

                    return {nodes: variables.ids.map(id => revisions.get(id) ?? null)}
                }

                if (queryString.includes('ReconcilePullRequestContentEdits')) {
                    throw new Error('unexpected edit continuation query')
                }

                if (queryString.includes('ReconcilePullRequestCensus')) {
                    return {repository: {pullRequests: {
                        totalCount: 1,
                        nodes     : [{
                            id           : 'PR_9', updatedAt,
                            timelineItems: {filteredCount: 2, updatedAt: timelineUpdatedAt}
                        }],
                        pageInfo  : {hasNextPage: false, endCursor: 'VERIFY_END'}
                    }}}
                }

                throw new Error('unexpected GraphQL query')
            },
            rest: async () => [inlineComment()],
            ...overrides
        };

        return service
    };

    const registryActive = {
        getRegistration: () => ({lifecycleState: 'ACTIVE', registrationEpoch: 3})
    };

    const makeAdmission = (overrides={}) => ({
        getCheckpoint   : () => null,
        listObservations: () => [],
        admitBatch(batch) {
            this.admitted = batch;
            return {status: 'accepted', receipt: {receiptId: 'receipt-pr'}}
        },
        ...overrides
    });

    const runSpec = {
        sourceInstanceId: 'source-pr',
        owner           : 'neomjs',
        repo            : 'neo',
        batchId         : 'batch-pr',
        observedAt      : '2026-07-01T16:00:00Z'
    };

    test('exhausts GraphQL and REST axes and admits a valid deterministic pulls batch', async () => {
        const admissionService = makeAdmission(),
              graphqlService   = makeGraphql(),
              receipt          = await PullRequestReconciliationService.reconcile({
                  ...runSpec, admissionService, graphqlService, registryService: registryActive
              }),
              batch            = admissionService.admitted,
              countKind        = kind => batch.observations.filter(observation => observation.occurrenceKind === kind).length;

        expect(receipt.status).toBe('accepted');
        expect(validateBatch(batch)).toEqual({valid: true, errors: []});
        expect(batch.resourceFamily).toBe('pulls');
        expect(batch.adapterSchemaVersion).toBe('github-pull-request.v1');
        expect(countKind('pull_request.opened')).toBe(1);
        expect(countKind('pull_request.edited')).toBe(2);
        expect(countKind('pull_request.comment')).toBe(2);
        expect(countKind('pull_request.comment-edited')).toBe(2);
        expect(countKind('pull_request.review-created')).toBe(2);
        expect(countKind('pull_request.review-submitted')).toBe(2);
        expect(countKind('pull_request.review-edited')).toBe(2);
        expect(countKind('pull_request.review-comment')).toBe(1);
        expect(countKind('pull_request.review-comment-edited')).toBe(2);
        expect(countKind('pull_request.closed')).toBe(1);
        expect(countKind('pull_request.merged')).toBe(1);
        expect(batch.observations.find(observation => observation.occurrenceKind === 'pull_request.review-comment'))
            .toMatchObject({
                actorKind: 'user', sourceAssociation: 'COLLABORATOR', parentProviderEntityId: 'PR_9'
            });
        expect(batch.observations.find(observation => observation.occurrenceKind === 'pull_request.review-submitted'))
            .toMatchObject({providerState: 'APPROVED', parentProviderEntityId: 'PR_9'});
        expect(graphqlService.calls.filter(call => call.queryString.includes('ReconcilePullRequestChildren'))).toHaveLength(1);
        expect(graphqlService.calls.filter(call => call.queryString.includes('ReconcilePullRequestContentEditHeads'))).toHaveLength(1);
        expect(graphqlService.calls.filter(call => call.queryString.includes('ReconcilePullRequestContentRevisions'))).toHaveLength(1)
    });

    test('205 roots batch edit-head and final-revision reads as 100, 100, 5 with no per-PR REST floor', async () => {
        const scaleRoots = Array.from({length: 205}, (_, index) => {
                  const id = `PR_SCALE_${index + 1}`;

                  return {
                      id,
                      number           : 10_000 + index,
                      state            : 'OPEN',
                      createdAt        : '2026-07-01T09:00:00Z',
                      updatedAt        : '2026-07-01T15:00:00Z',
                      lastEditedAt     : null,
                      authorAssociation: 'CONTRIBUTOR',
                      author           : {login: `author-${index + 1}`, __typename: 'User'},
                      comments         : {totalCount: 0, nodes: [], pageInfo: {hasNextPage: false, endCursor: null}},
                      reviews          : {totalCount: 0, nodes: [], pageInfo: {hasNextPage: false, endCursor: null}},
                      timelineItems    : {
                          filteredCount: 0,
                          updatedAt    : '2026-07-01T15:00:00Z',
                          nodes        : [],
                          pageInfo     : {hasNextPage: false, endCursor: null}
                      }
                  }
              }),
              rootsById = new Map(scaleRoots.map(root => [root.id, root])),
              calls = [],
              restPaths = [],
              graphqlService = {
                  query: async (queryString, variables) => {
                      calls.push({queryString, variables});

                      if (queryString.includes('ReconcilePullRequests')) {
                          return {repository: {pullRequests: {
                              totalCount: scaleRoots.length,
                              nodes     : scaleRoots,
                              pageInfo  : {hasNextPage: false, endCursor: 'ROOT_SCALE'}
                          }}}
                      }

                      if (queryString.includes('ReconcilePullRequestContentEditHeads')) {
                          return {nodes: variables.ids.map(id => {
                              const root = rootsById.get(id);

                              return {
                                  id,
                                  __typename         : 'PullRequest',
                                  createdAt          : root.createdAt,
                                  updatedAt          : root.updatedAt,
                                  includesCreatedEdit: false,
                                  userContentEdits   : editConnection()
                              }
                          })}
                      }

                      if (queryString.includes('ReconcilePullRequestContentRevisions')) {
                          return {nodes: variables.ids.map(id => ({
                              id, __typename: 'PullRequest', updatedAt: rootsById.get(id).updatedAt
                          }))}
                      }

                      if (queryString.includes('ReconcilePullRequestCensus')) {
                          return {repository: {pullRequests: {
                              totalCount: scaleRoots.length,
                              nodes     : scaleRoots.map(root => ({
                                  id           : root.id,
                                  updatedAt    : root.updatedAt,
                                  timelineItems: {
                                      filteredCount: root.timelineItems.filteredCount,
                                      updatedAt    : root.timelineItems.updatedAt
                                  }
                              })),
                              pageInfo: {hasNextPage: false, endCursor: 'VERIFY_SCALE'}
                          }}}
                      }

                      throw new Error('unexpected scale query')
                  },
                  rest: async (method, requestPath) => {
                      expect(method).toBe('GET');
                      restPaths.push(requestPath);
                      return []
                  }
              },
              admissionService = makeAdmission();

        await PullRequestReconciliationService.reconcile({
            ...runSpec,
            batchId        : 'batch-pr-scale',
            admissionService,
            graphqlService,
            registryService: registryActive
        });

        const editHeadCalls = calls.filter(call => call.queryString.includes('ReconcilePullRequestContentEditHeads')),
              revisionCalls = calls.filter(call => call.queryString.includes('ReconcilePullRequestContentRevisions'));
        const opened = admissionService.admitted.observations.filter(
            observation => observation.occurrenceKind === 'pull_request.opened'
        );

        expect(editHeadCalls.map(call => call.variables.ids.length)).toEqual([100, 100, 5]);
        expect(revisionCalls.map(call => call.variables.ids.length)).toEqual([100, 100, 5]);
        expect(restPaths).toHaveLength(2);
        expect(restPaths.every(requestPath => requestPath.startsWith('/repos/neomjs/neo/pulls/comments?'))).toBe(true);
        expect(opened).toHaveLength(205)
    });

    test('the same base and provider truth reproduce the canonical batch digest', async () => {
        const runOnce = async () => {
            const admissionService = makeAdmission();

            await PullRequestReconciliationService.reconcile({
                ...runSpec,
                admissionService,
                graphqlService : makeGraphql(),
                registryService: registryActive
            });

            return admissionService.admitted
        };

        expect(canonicalBatchDigest(await runOnce())).toBe(canonicalBatchDigest(await runOnce()))
    });

    test('a later checkpoint still re-enumerates every known root and child family from genesis', async () => {
        let   checkpoint   = null,
              observations = [];
        const admittedBatches  = [],
              admissionService = {
                  getCheckpoint   : () => checkpoint,
                  listObservations: () => observations,
                  admitBatch(batch) {
                      admittedBatches.push(batch);
                      observations = batch.observations;
                      checkpoint = {
                          checkpointVersion: batch.baseCheckpointVersion + 1,
                          inventoryHash    : batch.nextInventoryHash
                      };
                      return {status: 'accepted'}
                  }
              },
              graphqlService = makeGraphql();

        await PullRequestReconciliationService.reconcile({
            ...runSpec, batchId: 'batch-pr-pass-1', admissionService, graphqlService, registryService: registryActive
        });
        await PullRequestReconciliationService.reconcile({
            ...runSpec, batchId: 'batch-pr-pass-2', admissionService, graphqlService, registryService: registryActive
        });

        const rootCalls  = graphqlService.calls.filter(call => call.queryString.includes('ReconcilePullRequests')),
              childCalls = graphqlService.calls.filter(call => call.queryString.includes('ReconcilePullRequestChildren'));

        expect(rootCalls).toHaveLength(2);
        expect(rootCalls.map(call => call.variables.after)).toEqual([null, null]);
        expect(childCalls).toHaveLength(2);
        expect(admittedBatches[1]).toMatchObject({baseCheckpointVersion: 1});
        expect(admittedBatches[1].observations.some(observation => (
            observation.occurrenceKind === 'pull_request.opened' && observation.providerEntityId === 'PR_9'
        ))).toBe(true)
    });

    test('a REST verification mismatch becomes a gap and no mixed PR snapshot is admitted', async () => {
        let   restPass       = 0;
        const graphqlService = makeGraphql({
                  rest: async () => [inlineComment({updated_at: ++restPass === 1
                      ? '2026-07-01T13:00:00Z'
                      : '2026-07-01T13:01:00Z'})]
              }),
              admissionService = makeAdmission();

        await PullRequestReconciliationService.reconcile({
            ...runSpec, admissionService, graphqlService, registryService: registryActive
        });

        const batch = admissionService.admitted;

        expect(batch.observations).toHaveLength(0);
        expect(batch.coverage.complete).toBe(false);
        expect(batch.coverage.gaps.some(gap => (
            gap.axis === 'inline-review-comments' && gap.reason.includes('mutated during verification')
        ))).toBe(true);
        expect(batch.nextInventoryHash).not.toBe(null)
    });

    test('an admission conflict is returned without a service-side checkpoint advance', async () => {
        const admissionService = makeAdmission({
            admitBatch: () => ({status: 'conflict', reason: 'STALE_BASIS'})
        });

        const receipt = await PullRequestReconciliationService.reconcile({
            ...runSpec,
            admissionService,
            graphqlService : makeGraphql(),
            registryService: registryActive
        });

        expect(receipt).toEqual({status: 'conflict', reason: 'STALE_BASIS'})
    });

    test('an evidenced vanished root becomes a deletion while an unevidenced root stays an access gap', async () => {
        const graphqlService = makeGraphql({
                  query: async queryString => queryString.includes('ReconcilePullRequestCensus')
                      ? {repository: {pullRequests: {totalCount: 0, nodes: [], pageInfo: {hasNextPage: false, endCursor: 'VERIFY_EMPTY'}}}}
                      : queryString.includes('ReconcilePullRequests')
                          ? {repository: {pullRequests: {totalCount: 0, nodes: [], pageInfo: {hasNextPage: false, endCursor: 'ROOT_EMPTY'}}}}
                          : (() => { throw new Error('unexpected child query') })()
              }),
              admissionService = makeAdmission({
                  listObservations: () => [
                      {occurrenceKind: 'pull_request.opened', providerEntityId: 'PR_gone'},
                      {occurrenceKind: 'pull_request.opened', providerEntityId: 'PR_hidden'}
                  ]
              });

        await PullRequestReconciliationService.reconcile({
            ...runSpec,
            admissionService,
            graphqlService,
            registryService        : registryActive,
            acquireDeletionEvidence: async ids => ids.includes('PR_gone')
                ? {PR_gone: {tombstoneId: 't-pr', deletedAt: '2026-07-01T15:30:00Z'}}
                : {}
        });

        const batch = admissionService.admitted;

        expect(batch.observations.find(observation => observation.providerEntityId === 'PR_gone'))
            .toMatchObject({occurrenceKind: 'pull_request.deleted', absence: 'deleted'});
        expect(batch.observations.some(observation => observation.providerEntityId === 'PR_hidden')).toBe(false);
        expect(batch.coverage.gaps).toContainEqual({axis: 'inventory-access', providerEntityId: 'PR_hidden'})
    });

    test('an inactive source is refused before acquisition', async () => {
        const graphqlService = makeGraphql();

        await expect(PullRequestReconciliationService.reconcile({
            ...runSpec,
            admissionService: makeAdmission(),
            graphqlService,
            registryService : {getRegistration: () => ({lifecycleState: 'REVOKED', registrationEpoch: 4})}
        })).rejects.toThrow('PULL_REQUEST_RECONCILIATION_SOURCE_NOT_ACTIVE');

        expect(graphqlService.calls).toHaveLength(0)
    })
});
