import {setup} from '../../../../setup.mjs';

const appName = 'PullRequestHistoryServiceTest';

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

import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import PullRequestHistoryService, {
    exhaustRepositoryReviewComments,
    exhaustReviewComments,
    fetchResolvedPullRequestsForHistory,
    scanPullRequestCorpus,
    synthesizePullRequestHistory
}                     from '../../../../../../ai/services/github-workflow/PullRequestHistoryService.mjs';
import {
    FETCH_PULL_REQUEST_HISTORY_CHILDREN,
    FETCH_RELEASES_FOR_HISTORY,
    FETCH_RESOLVED_PULL_REQUEST_CENSUS_REVISION,
    FETCH_RESOLVED_PULL_REQUESTS_FOR_HISTORY
}                     from '../../../../../../ai/services/github-workflow/queries/pullRequestQueries.mjs';
import {synthesizeTemporalBirdView} from '../../../../../../ai/services/memory-core/helpers/temporalBirdViewSynthesizer.mjs';

const START_ISO = '2026-07-01T00:00:00.000Z',
      END_ISO   = '2026-07-08T00:00:00.000Z',
      START_MS  = Date.parse(START_ISO),
      END_MS    = Date.parse(END_ISO),
      NOW       = new Date('2026-07-13T12:00:00.000Z');

/**
 * @summary Creates one GitHub connection fixture with explicit completeness metadata.
 * @param {Object[]} nodes
 * @param {Object} [options]
 * @returns {Object}
 */
function connection(nodes, {totalCount = nodes.length, hasNextPage = false, endCursor = null} = {}) {
    return {totalCount, pageInfo: {hasNextPage, endCursor}, nodes}
}

/**
 * @summary Creates one terminal pull-request fixture accepted by the history source adapter.
 * @param {Object} options
 * @returns {Object}
 */
function pullRequest({
    number,
    mergedAt,
    closedAt = mergedAt,
    body = `Root body for PR ${number}`,
    updatedAt = '2026-07-07T12:00:00.000Z',
    comments = [],
    reviews = [],
    commentConnection,
    reviewConnection
}) {
    return {
        number,
        title    : `Pull request ${number}`,
        body,
        url      : `https://github.com/neomjs/neo/pull/${number}`,
        state    : 'CLOSED',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt,
        closedAt,
        mergedAt : mergedAt || null,
        author   : {login: 'tobiu'},
        comments : commentConnection || connection(comments),
        reviews  : reviewConnection || connection(reviews)
    }
}

/**
 * @summary Creates a one-page resolved-PR GraphQL search result.
 * @param {Object[]} nodes
 * @returns {Object}
 */
function searchPage(nodes) {
    return {
        search: {
            issueCount: nodes.length,
            pageInfo  : {hasNextPage: false, endCursor: null},
            nodes
        }
    }
}

/**
 * @summary Identifies either the evidence-bearing census or its lightweight revision verification pass.
 * @param {String} document
 * @returns {Boolean}
 */
function isCensusDocument(document) {
    return document === FETCH_RESOLVED_PULL_REQUESTS_FOR_HISTORY ||
        document === FETCH_RESOLVED_PULL_REQUEST_CENSUS_REVISION
}

/**
 * @summary Returns the complete local-corpus proof used when a test is about another source edge.
 * @returns {Object}
 */
function completeCorpus() {
    return {
        complete          : true,
        indexBypassed     : true,
        missingRoots      : [],
        missingIds        : [],
        corruptIds        : [],
        divergentIds      : [],
        projectionDriftIds: []
    }
}

/**
 * @summary Produces deterministic map/final inference JSON while retaining every prompt for assertions.
 * @param {Object} options
 * @returns {{generate: Function, prompts: String[]}}
 */
function inferenceFixture({sourceId, observation = {}, finalSourceIds, scopeObservationToPrompt = false} = {}) {
    const prompts = [];

    return {
        prompts,
        generate: async ({prompt}) => {
            prompts.push(prompt);

            if (prompt.startsWith('Compose a concise Bird View')) {
                return JSON.stringify({
                    sections: [{
                        text     : 'The resolved work converged around one evidence-backed outcome.',
                        sourceIds: finalSourceIds || [sourceId]
                    }]
                })
            }

            const scopedObservation = {...observation};

            if (scopeObservationToPrompt) {
                for (const key of ['commentId', 'reviewId', 'reviewCommentId']) {
                    if (scopedObservation[key] !== undefined && !prompt.includes(`"childId":"${scopedObservation[key]}"`)) {
                        delete scopedObservation[key]
                    }
                }
            }

            return JSON.stringify({
                observations: [{
                    category: 'notable_event',
                    summary : 'A cite-backed implementation outcome landed.',
                    sourceId,
                    ...scopedObservation
                }]
            })
        }
    }
}

/**
 * @summary Runs the service through the real temporal orchestrator with hermetic source seams.
 * @param {Object} options
 * @param {Function} query
 * @param {Function} rest
 * @param {Function} generate
 * @param {Function} [scanCorpus]
 * @param {Object} [paths]
 * @returns {Promise<Object>}
 */
function explore({
    options = {windowStart: START_ISO, windowEnd: END_ISO},
    query,
    rest = async () => [],
    generate,
    scanCorpus = async () => completeCorpus(),
    paths = {}
}) {
    return PullRequestHistoryService.explorePullRequestHistory(options, {
        runTemporal        : synthesizeTemporalBirdView,
        generate,
        now                : NOW,
        query,
        rest,
        owner              : 'neomjs',
        repo               : 'neo',
        pullsDir           : paths.pullsDir || '/unused/active-pulls',
        archiveRoot        : paths.archiveRoot || '/unused/archive',
        productNameDenylist: [],
        scanCorpus
    })
}

/**
 * @summary Creates a stable live-query seam for one or more complete PR snapshots.
 * @param {Object[]} pulls
 * @returns {Function}
 */
function stableHistoryQuery(pulls) {
    return async (document, variables) => {
        if (isCensusDocument(document)) return searchPage(pulls);

        expect(document).toBe(FETCH_PULL_REQUEST_HISTORY_CHILDREN);

        const pull = pulls.find(item => item.number === variables.prNumber);
        return {repository: {pullRequest: {updatedAt: pull.updatedAt}}}
    }
}

/**
 * @summary Captures a directory's relative files and byte content for the no-write invariant.
 * @param {String} root
 * @returns {Promise<Object>}
 */
async function snapshotTree(root) {
    const snapshot = {};

    async function visit(directory) {
        const entries = await fs.readdir(directory, {withFileTypes: true});

        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                await visit(absolute)
            } else {
                snapshot[path.relative(root, absolute)] = await fs.readFile(absolute, 'utf8')
            }
        }
    }

    await visit(root);
    return snapshot
}

/**
 * @summary Writes one minimal synced PR projection fixture under a temporary corpus root.
 * @param {String} filePath
 * @param {Number} number
 * @param {String} updatedAt
 * @returns {Promise<void>}
 */
async function writeCorpusPull(filePath, number, updatedAt = '2026-07-07T12:00:00.000Z') {
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, `---\nnumber: ${number}\nupdatedAt: ${updatedAt}\n---\n\n# PR ${number}\n`, 'utf8')
}

/**
 * @summary Contract coverage for the runtime resolved-PR Bird View: the live terminal census, complete
 * conversation exhaustion, active/archive corpus audit, evidence-bound synthesis, and no-durable-write rule.
 */
test.describe('Neo.ai.services.github-workflow.PullRequestHistoryService', () => {
    test('includes more than 50 resolved PRs without a hidden source cap', async () => {
        const pulls = Array.from({length: 51}, (_, index) => pullRequest({
                  number  : index + 1,
                  mergedAt: new Date(START_MS + (index + 1) * 60_000).toISOString()
              })),
              inference = inferenceFixture({sourceId: 'pull:1'});
        let searchCalls   = 0,
            restCalls     = 0,
            snapshotCalls = 0;

        const result = await explore({
            query: async (document, variables) => {
                if (isCensusDocument(document)) {
                    expect(variables.limit).toBe(100);
                    searchCalls++;
                    return searchPage(pulls)
                }

                expect(document).toBe(FETCH_PULL_REQUEST_HISTORY_CHILDREN);
                expect(variables.childLimit).toBe(1);
                snapshotCalls++;
                return {repository: {pullRequest: {updatedAt: pulls[variables.prNumber - 1].updatedAt}}}
            },
            rest    : async () => { restCalls++; return [] },
            generate: inference.generate
        });

        expect(searchCalls).toBe(2);
        expect(snapshotCalls).toBe(51);
        expect(restCalls).toBe(102);
        expect(result.coverage.totalResolved).toBe(51);
        expect(result.coverage.included).toBe(51);
        expect(result.coverage.excluded).toBe(0);
        expect(result.coverage.truncated).toBe(false);
        expect(result.coverage.search.queryExhausted).toBe(true);
        expect(result.coverage.search.candidatesFetched).toBe(51);
        expect(result.citations).toHaveLength(51);
        expect(result.synthesisAvailable).toBe(true)
    });

    test('applies exact half-open boundaries independently from merged vs closed-unmerged selection', async () => {
        const pulls = [
                  pullRequest({number: 1, mergedAt: START_ISO}),
                  pullRequest({number: 2, mergedAt: new Date(END_MS - 1).toISOString()}),
                  pullRequest({number: 3, mergedAt: END_ISO}),
                  pullRequest({number: 4, mergedAt: null, closedAt: '2026-07-04T12:00:00.000Z'}),
                  pullRequest({number: 5, mergedAt: null, closedAt: new Date(START_MS - 1).toISOString()})
              ],
              query = async document => {
                  expect(isCensusDocument(document)).toBe(true);
                  return searchPage(pulls)
              },
              window = {windowStart: START_MS, windowEnd: END_MS};

        const merged = await fetchResolvedPullRequestsForHistory({window, resolution: 'merged', query, owner: 'neomjs', repo: 'neo'}),
              closed = await fetchResolvedPullRequestsForHistory({window, resolution: 'closed_unmerged', query, owner: 'neomjs', repo: 'neo'}),
              all    = await fetchResolvedPullRequestsForHistory({window, resolution: 'all_resolved', query, owner: 'neomjs', repo: 'neo'});

        expect(merged.pullRequests.map(item => item.number)).toEqual([1, 2]);
        expect(closed.pullRequests.map(item => item.number)).toEqual([4]);
        expect(all.pullRequests.map(item => item.number)).toEqual([1, 4, 2]);
        expect(all.evidence.exactHalfOpen).toBe(true)
    });

    test('splits a search slice at exactly GitHub\'s 1,000-result cap instead of claiming it exhausted', async () => {
        const capNodes = Array.from({length: 1000}, (_, index) => pullRequest({
                  number  : index + 1,
                  mergedAt: new Date(START_MS + index + 1).toISOString()
              }));
        let calls = 0;

        const result = await fetchResolvedPullRequestsForHistory({
            window    : {windowStart: START_MS, windowEnd: END_MS},
            resolution: 'all_resolved',
            owner     : 'neomjs',
            repo      : 'neo',
            query     : async (document, variables) => {
                expect(isCensusDocument(document)).toBe(true);
                calls++;

                if (variables.query.includes(`closed:${START_ISO}..${END_ISO}`)) {
                    return {
                        search: {
                            issueCount: 1000,
                            pageInfo  : {hasNextPage: false, endCursor: null},
                            nodes     : capNodes
                        }
                    }
                }

                return searchPage([])
            }
        });

        expect(calls).toBeGreaterThan(1);
        expect(result.evidence.splitCount).toBe(1);
        expect(result.pullRequests).toEqual([])
    });

    test('rejects an issueCount mutation between search pages', async () => {
        const firstPage = Array.from({length: 100}, (_, index) => pullRequest({
                  number  : index + 1,
                  mergedAt: new Date(START_MS + index + 1).toISOString()
              })),
              finalNode = pullRequest({number: 101, mergedAt: new Date(START_MS + 101).toISOString()});

        await expect(fetchResolvedPullRequestsForHistory({
            window    : {windowStart: START_MS, windowEnd: END_MS},
            resolution: 'all_resolved',
            owner     : 'neomjs',
            repo      : 'neo',
            query     : async (document, variables) => {
                expect(isCensusDocument(document)).toBe(true);

                return variables.cursor === null ? {
                    search: {
                        issueCount: 101,
                        pageInfo  : {hasNextPage: true, endCursor: 'search-100'},
                        nodes     : firstPage
                    }
                } : {
                    search: {
                        issueCount: 102,
                        pageInfo  : {hasNextPage: false, endCursor: null},
                        nodes     : [finalNode]
                    }
                }
            }
        })).rejects.toThrow(/continuation|census|count|mutat/i)
    });

    test('rejects a null search node instead of silently reducing the resolved census', async () => {
        await expect(fetchResolvedPullRequestsForHistory({
            window    : {windowStart: START_MS, windowEnd: END_MS},
            resolution: 'all_resolved',
            owner     : 'neomjs',
            repo      : 'neo',
            query     : async () => ({
                search: {
                    issueCount: 1,
                    pageInfo  : {hasNextPage: false, endCursor: null},
                    nodes     : [null]
                }
            })
        })).rejects.toThrow(/invalid|null|node/i)
    });

    test('exhausts GraphQL comments/reviews and REST inline review comments before synthesis', async () => {
        const comments = Array.from({length: 100}, (_, index) => ({
                  id       : `C${index + 1}`, author: {login: 'tobiu'}, body: `issue-comment-${index + 1}`,
                  createdAt: '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z'
              })),
              reviews = Array.from({length: 100}, (_, index) => ({
                  id         : `R${index + 1}`, author: {login: 'neo-gpt'}, body: `review-body-${index + 1}`,
                  createdAt  : '2026-07-02T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z',
                  submittedAt: '2026-07-02T00:00:00.000Z', state: 'COMMENTED'
              })),
              pull = pullRequest({
                  number           : 500,
                  mergedAt         : '2026-07-06T12:00:00.000Z',
                  body             : 'ROOT-CONVERSATION-SENTINEL',
                  commentConnection: connection(comments, {totalCount: 101, hasNextPage: true, endCursor: 'C100'}),
                  reviewConnection : connection(reviews, {totalCount: 101, hasNextPage: true, endCursor: 'R100'})
              }),
              inference = inferenceFixture({
                  sourceId                : 'pull:500',
                  observation             : {reviewCommentId: '1101'},
                  scopeObservationToPrompt: true
              });
        let childCalls = 0,
            restCalls  = 0;

        const query = async (document, variables) => {
            if (isCensusDocument(document)) return searchPage([pull]);

            expect(document).toBe(FETCH_PULL_REQUEST_HISTORY_CHILDREN);

            if (variables.childLimit === 1) {
                return {repository: {pullRequest: {updatedAt: pull.updatedAt}}}
            }

            expect(variables.commentsCursor).toBe('C100');
            expect(variables.reviewsCursor).toBe('R100');
            childCalls++;

            return {
                repository: {
                    pullRequest: {
                        updatedAt: pull.updatedAt,
                        comments : connection([{
                            id       : 'C101', author: {login: 'tobiu'}, body: 'ISSUE-COMMENT-TAIL-SENTINEL',
                            createdAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z'
                        }]),
                        reviews: connection([{
                            id         : 'R101', author: {login: 'neo-gpt'}, body: 'REVIEW-TAIL-SENTINEL',
                            createdAt  : '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z',
                            submittedAt: '2026-07-03T00:00:00.000Z', state: 'APPROVED'
                        }])
                    }
                }
            }
        };

        const rest = async (method, requestPath) => {
            expect(method).toBe('GET');
            restCalls++;

            const page = Number(new URL(`https://api.github.test${requestPath}`).searchParams.get('page'));
            if (page === 1) {
                return Array.from({length: 100}, (_, index) => ({
                    id        : 1001 + index, pull_request_review_id: 77, user: {login: 'neo-opus-grace'},
                    body      : `inline-review-comment-${index + 1}`,
                    created_at: '2026-07-04T00:00:00.000Z', updated_at: '2026-07-04T00:00:00.000Z',
                    html_url  : `https://github.com/neomjs/neo/pull/500#discussion_r${1001 + index}`
                }))
            }

            return [{
                id        : 1101, pull_request_review_id: 77, user: {login: 'neo-opus-grace'},
                body      : 'INLINE-REVIEW-TAIL-SENTINEL',
                created_at: '2026-07-04T00:00:00.000Z', updated_at: '2026-07-04T00:00:00.000Z',
                html_url  : 'https://github.com/neomjs/neo/pull/500#discussion_r1101'
            }]
        };

        const result          = await explore({query, rest, generate: inference.generate}),
              evidencePrompts = inference.prompts.filter(prompt => !prompt.startsWith('Compose a concise Bird View')).join('\n');

        expect(childCalls).toBe(1);
        expect(restCalls).toBe(4);
        expect(result.coverage.childEvidence.comments).toEqual({expected: 101, fetched: 101, exhausted: true});
        expect(result.coverage.childEvidence.reviews).toEqual({expected: 101, fetched: 101, exhausted: true});
        expect(result.coverage.childEvidence.reviewComments).toEqual({
            fetched: 101, exhausted: true, snapshotsVerified: 1, validationPasses: 2
        });
        expect(result.coverage.childEvidence.graphqlPageQueries).toBe(1);
        expect(result.coverage.childEvidence.restPageQueries).toBe(4);
        expect(evidencePrompts).toContain('ROOT-CONVERSATION-SENTINEL');
        expect(evidencePrompts).toContain('ISSUE-COMMENT-TAIL-SENTINEL');
        expect(evidencePrompts).toContain('REVIEW-TAIL-SENTINEL');
        expect(evidencePrompts).toContain('INLINE-REVIEW-TAIL-SENTINEL');
        expect(result.synthesisDetails.notableEvents.find(item => item.citation.reviewCommentId === '1101').citation).toMatchObject({
            sourceId: 'pull:500', prNumber: 500, reviewCommentId: '1101'
        })
    });

    test('degrades when ordered REST review-comment content mutates between verification scans', async () => {
        const pull      = pullRequest({number: 501, mergedAt: '2026-07-06T12:00:00.000Z'}),
              inference = inferenceFixture({sourceId: 'pull:501'});
        let restCalls = 0;

        const result = await explore({
            query: stableHistoryQuery([pull]),
            rest : async () => {
                restCalls++;

                return [{
                    id        : 8001, pull_request_review_id: 88, user: {login: 'neo-opus-grace'},
                    body      : restCalls === 1 ? 'first-scan-body' : 'mutated-second-scan-body',
                    created_at: '2026-07-04T00:00:00.000Z', updated_at: '2026-07-04T00:00:00.000Z',
                    html_url  : 'https://github.com/neomjs/neo/pull/501#discussion_r8001'
                }]
            },
            generate: inference.generate
        });

        expect(restCalls).toBe(2);
        expect(result.coverage.degraded).toBe(true);
        expect(result.coverage.degradedReason).toBe('conversation-incomplete: 1/1');
        expect(result.coverage.childEvidence.failures).toHaveLength(1);
        expect(result.coverage.childEvidence.failures[0].reason).toMatch(/review comments?.*(mutat|mismatch|snapshot)/i);
        expect(result.synthesisAvailable).toBe(false)
    });

    test('keeps resolved-history review-comment revisions stable unless reconciliation opts into actor metadata', async () => {
        const pull = pullRequest({number: 502, mergedAt: '2026-07-06T12:00:00.000Z'}),
              rest = async () => [{
                  id                    : 8002,
                  node_id               : 'PRRC_8002',
                  pull_request_review_id: 89,
                  user                  : {login: 'external-reviewer', type: 'User'},
                  author_association    : 'CONTRIBUTOR',
                  body                  : 'metadata boundary',
                  created_at            : '2026-07-04T00:00:00.000Z',
                  updated_at            : '2026-07-04T00:00:00.000Z',
                  html_url              : 'https://github.com/neomjs/neo/pull/502#discussion_r8002'
              }],
              history = await exhaustReviewComments({pullRequest: pull, rest, owner: 'neomjs', repo: 'neo'}),
              reconciliation = await exhaustReviewComments({
                  pullRequest         : pull,
                  rest,
                  owner               : 'neomjs',
                  repo                : 'neo',
                  includeActorMetadata: true
              });

        expect(history.reviewComments[0].author).toEqual({login: 'external-reviewer'});
        expect(history.reviewComments[0]).not.toHaveProperty('authorAssociation');
        expect(reconciliation.reviewComments[0].author).toEqual({login: 'external-reviewer', __typename: 'User'});
        expect(reconciliation.reviewComments[0]).toMatchObject({
            nodeId: 'PRRC_8002', authorAssociation: 'CONTRIBUTOR'
        })
    });

    test('repository-wide review-comment verification scales with pages and groups 101 comments by PR', async () => {
        const paths         = [],
              reviewComment = (id, pullRequestNumber) => ({
                  id,
                  node_id               : `PRRC_${id}`,
                  pull_request_review_id: 700 + pullRequestNumber,
                  pull_request_url      : `https://api.github.com/repos/neomjs/neo/pulls/${pullRequestNumber}`,
                  user                  : {login: `reviewer-${pullRequestNumber}`, type: 'User'},
                  author_association    : 'MEMBER',
                  body                  : `comment-${id}`,
                  created_at            : '2026-07-04T00:00:00.000Z',
                  updated_at            : '2026-07-04T00:00:00.000Z',
                  html_url              : `https://github.com/neomjs/neo/pull/${pullRequestNumber}#discussion_r${id}`
              }),
              result = await exhaustRepositoryReviewComments({
                  owner               : 'neomjs',
                  repo                : 'neo',
                  includeActorMetadata: true,
                  rest                : async (method, requestPath) => {
                      expect(method).toBe('GET');
                      paths.push(requestPath);

                      const page = Number(new URL(`https://api.github.test${requestPath}`).searchParams.get('page'));

                      return page === 1
                          ? Array.from({length: 100}, (_, index) => reviewComment(index + 1, index % 2 ? 10 : 9))
                          : [reviewComment(101, 9)]
                  }
              });

        expect(paths).toHaveLength(4);
        expect(paths.map(requestPath => Number(
            new URL(`https://api.github.test${requestPath}`).searchParams.get('page')
        ))).toEqual([1, 2, 1, 2]);
        expect(paths.every(requestPath => requestPath.startsWith('/repos/neomjs/neo/pulls/comments?'))).toBe(true);
        expect(result.reviewCommentsByPullRequestNumber.get(9)).toHaveLength(51);
        expect(result.reviewCommentsByPullRequestNumber.get(10)).toHaveLength(50);
        expect(result.failuresByPullRequestNumber.size).toBe(0);
        expect(result.evidence).toMatchObject({fetched: 101, pageQueries: 4, snapshotVerified: true})
    });

    test('repository-wide verification isolates one PR comment mutation from stable sibling groups', async () => {
        let pass = 0;

        const reviewComment = (id, pullRequestNumber, updatedAt) => ({
                  id,
                  node_id               : `PRRC_${id}`,
                  pull_request_review_id: 700 + pullRequestNumber,
                  pull_request_url      : `https://api.github.com/repos/neomjs/neo/pulls/${pullRequestNumber}`,
                  user                  : {login: 'reviewer', type: 'User'},
                  author_association    : 'MEMBER',
                  body                  : `comment-${id}`,
                  created_at            : '2026-07-04T00:00:00.000Z',
                  updated_at            : updatedAt,
                  html_url              : `https://github.com/neomjs/neo/pull/${pullRequestNumber}#discussion_r${id}`
              }),
              result = await exhaustRepositoryReviewComments({
                  owner: 'neomjs',
                  repo : 'neo',
                  rest : async () => {
                      pass++;
                      return [
                          reviewComment(1, 9, pass === 1 ? '2026-07-04T00:00:00.000Z' : '2026-07-04T00:01:00.000Z'),
                          reviewComment(2, 10, '2026-07-04T00:00:00.000Z')
                      ]
                  }
              });

        expect(result.failuresByPullRequestNumber.has(9)).toBe(true);
        expect(result.reviewCommentsByPullRequestNumber.has(9)).toBe(false);
        expect(result.reviewCommentsByPullRequestNumber.get(10)).toHaveLength(1)
    });

    test('rejects a map observation that cites a child absent from that exact evidence batch', async () => {
        const sources = [{
                  id          : 'pull:600',
                  type        : 'pull_request',
                  number      : 600,
                  url         : 'https://github.com/neomjs/neo/pull/600',
                  resolution  : 'merged',
                  resolvedAt  : '2026-07-06T12:00:00.000Z',
                  conversation: {
                      title   : 'Multi-batch evidence',
                      body    : 'root',
                      author  : {login: 'tobiu'},
                      comments: [{
                          id: 'C-large', author: {login: 'tobiu'}, body: 'A'.repeat(90_000)
                      }, {
                          id: 'C-later', author: {login: 'tobiu'}, body: 'LATER-BATCH-EVIDENCE'
                      }],
                      reviews       : [],
                      reviewComments: [],
                      contentTrust  : {projected: true, quarantined: 0, signals: []}
                  }
              }],
              window = {
                  windowStartIso: START_ISO,
                  windowEndIso  : END_ISO
              };
        let absentBatchSeen = false;

        await expect(synthesizePullRequestHistory({
            window,
            sources,
            generate: async ({prompt}) => {
                if (prompt.startsWith('Compose a concise Bird View')) {
                    return JSON.stringify({sections: [{text: 'Should never finalize.', sourceIds: ['pull:600']}]})
                }

                const hasLaterChild = prompt.includes('"childId":"C-later"');
                if (!hasLaterChild) absentBatchSeen = true;

                return JSON.stringify({
                    observations: [{
                        category : 'friction',
                        summary  : 'Cross-batch citation attempt.',
                        sourceId : 'pull:600',
                        commentId: 'C-later'
                    }]
                })
            }
        })).rejects.toThrow(/batch|absent|evidence|cites|unknown child/i);

        expect(absentBatchSeen).toBe(true)
    });

    test('a child-exhaustion failure preserves the PR census and returns an explicit degraded gap', async () => {
        const pull = pullRequest({
                  number           : 501,
                  mergedAt         : '2026-07-06T13:00:00.000Z',
                  commentConnection: connection([{
                      id       : 'C1', author: {login: 'tobiu'}, body: 'only one of two expected comments',
                      createdAt: '2026-07-03T00:00:00.000Z', updatedAt: '2026-07-03T00:00:00.000Z'
                  }], {totalCount: 2})
              });
        let inferenceCalls = 0;

        const result = await explore({
            query: async document => {
                expect(isCensusDocument(document)).toBe(true);
                return searchPage([pull])
            },
            generate: async () => { inferenceCalls++; throw new Error('inference must be skipped') }
        });

        expect(result.coverage.totalResolved).toBe(1);
        expect(result.coverage.included).toBe(0);
        expect(result.coverage.excluded).toBe(1);
        expect(result.coverage.childEvidence).toMatchObject({
            attempted: 1,
            completed: 0,
            failures : [{sourceId: 'pull:501'}]
        });
        expect(result.coverage.childEvidence.failures[0].reason).toContain('child exhaustion mismatch');
        expect(result.coverage.degradedReason).toContain('conversation-incomplete: 1/1');
        expect(result.synthesisAvailable).toBe(false);
        expect(inferenceCalls).toBe(0)
    });

    test('scans active + archive trees without trusting stale _index.json, degrades on a missing projection, and writes nothing', async () => {
        const tempRoot    = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-pr-history-')),
              pullsDir    = path.join(tempRoot, 'pulls'),
              archiveRoot = path.join(tempRoot, 'archive');

        try {
            await writeCorpusPull(path.join(pullsDir, 'pr-1.md'), 1);
            await writeCorpusPull(path.join(archiveRoot, 'pulls', '2026', '07', 'pr-2.md'), 2);
            await fs.writeFile(path.join(pullsDir, '_index.json'), JSON.stringify({
                1: {path: '/definitely/stale/pr-1.md'},
                2: {path: '/definitely/stale/pr-2.md'},
                3: {path: '/definitely/stale/pr-3.md'}
            }), 'utf8');

            const pulls = [1, 2, 3].map(number => pullRequest({
                      number,
                      mergedAt: `2026-07-0${number + 1}T12:00:00.000Z`
                  })),
                  before = await snapshotTree(tempRoot);
            let inferenceCalls = 0;

            const result = await explore({
                query: async (document, variables) => {
                    if (isCensusDocument(document)) return searchPage(pulls);

                    expect(document).toBe(FETCH_PULL_REQUEST_HISTORY_CHILDREN);
                    return {repository: {pullRequest: {updatedAt: pulls.find(item => item.number === variables.prNumber).updatedAt}}}
                },
                generate  : async () => { inferenceCalls++; throw new Error('inference must be skipped') },
                scanCorpus: scanPullRequestCorpus,
                paths     : {pullsDir, archiveRoot}
            });

            expect(result.coverage.corpus.indexBypassed).toBe(true);
            expect(result.coverage.corpus.selectedActive).toBe(1);
            expect(result.coverage.corpus.selectedArchived).toBe(1);
            expect(result.coverage.corpus.missingIds).toEqual(['pull:3']);
            expect(result.coverage.degraded).toBe(true);
            expect(result.coverage.degradedReason).toContain('local-corpus-incomplete');
            expect(result.synthesisAvailable).toBe(false);
            expect(inferenceCalls).toBe(0);
            expect(await snapshotTree(tempRoot)).toEqual(before)
        } finally {
            await fs.rm(tempRoot, {recursive: true, force: true})
        }
    });

    test('treats stale and legacy timestamp-less corpus projections as incomplete', async () => {
        const tempRoot    = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-pr-history-drift-')),
              pullsDir    = path.join(tempRoot, 'pulls'),
              archiveRoot = path.join(tempRoot, 'archive');

        try {
            await writeCorpusPull(path.join(pullsDir, 'pr-701.md'), 701, '2026-07-01T00:00:00.000Z');
            await fs.mkdir(path.join(archiveRoot, 'pulls'), {recursive: true});
            await fs.writeFile(
                path.join(archiveRoot, 'pulls', 'pr-702.md'),
                '---\nnumber: 702\n---\n\n# Legacy PR 702\n',
                'utf8'
            );

            const corpus = await scanPullRequestCorpus({
                pullsDir,
                archiveRoot,
                sources: [{
                    id: 'pull:701', number: 701, updatedAt: '2026-07-07T12:00:00.000Z'
                }, {
                    id: 'pull:702', number: 702, updatedAt: '2026-07-07T12:00:00.000Z'
                }]
            });

            expect(corpus.projectionDriftIds).toEqual(['pull:701']);
            expect(corpus.legacyUnknownIds).toEqual(['pull:702']);
            expect(corpus.complete).toBe(false)
        } finally {
            await fs.rm(tempRoot, {recursive: true, force: true})
        }
    });

    test('content edits change the manifest revision while preserving an explicit drill-down target', async () => {
        async function run(body) {
            const pull      = pullRequest({number: 9, mergedAt: '2026-07-06T00:00:00.000Z', body}),
                  inference = inferenceFixture({sourceId: 'pull:9'});

            return explore({
                query   : stableHistoryQuery([pull]),
                generate: inference.generate
            })
        }

        const before = await run('Initial root conversation body'),
              after  = await run('Edited root conversation body');

        expect(before.citations[0].revision).not.toBe(after.citations[0].revision);
        expect(before.sourceManifestHash).not.toBe(after.sourceManifestHash);
        expect(after.citations[0].drillDown).toEqual({
            operation: 'get_conversation',
            arguments: {pr_number: 9}
        })
    });

    test('resolves a release preset as the exact previous-cut to selected-cut half-open window', async () => {
        const releases = [
                  {tagName: 'v13.2.0', publishedAt: '2026-06-01T10:00:00.000Z', createdAt: '2026-06-01T10:00:00.000Z', isDraft: false, isPrerelease: false},
                  {tagName: 'v13.0.0', publishedAt: '2026-04-01T10:00:00.000Z', createdAt: '2026-04-01T10:00:00.000Z', isDraft: false, isPrerelease: false},
                  {tagName: 'v13.1.0', publishedAt: '2026-05-01T10:00:00.000Z', createdAt: '2026-05-01T10:00:00.000Z', isDraft: false, isPrerelease: false}
              ],
              pull = pullRequest({number: 1320, mergedAt: '2026-05-15T12:00:00.000Z'}),
              inference = inferenceFixture({sourceId: 'pull:1320'});
        let searchExpression;

        const result = await explore({
            options: {preset: 'release', release: 'v13.2.0'},
            query  : async (document, variables) => {
                if (document === FETCH_RELEASES_FOR_HISTORY) {
                    return {
                        repository: {
                            releases: {
                                totalCount: releases.length,
                                pageInfo  : {hasNextPage: false, endCursor: null},
                                nodes     : releases
                            }
                        }
                    }
                }

                if (document === FETCH_PULL_REQUEST_HISTORY_CHILDREN) {
                    return {repository: {pullRequest: {updatedAt: pull.updatedAt}}}
                }

                expect(isCensusDocument(document)).toBe(true);
                searchExpression = variables.query;
                return searchPage([pull])
            },
            generate: inference.generate
        });

        expect(result.window.windowStartIso).toBe('2026-05-01T10:00:00.000Z');
        expect(result.window.windowEndIso).toBe('2026-06-01T10:00:00.000Z');
        expect(result.window.preset).toBe('release');
        expect(result.window.previousRelease).toBe('v13.1.0');
        expect(result.window.release).toBe('v13.2.0');
        expect(result.window.windowSemantics.interval).toBe('half-open');
        expect(result.window.windowSemantics.filterSet).toMatchObject({grain: 'release', resolution: 'all_resolved'});
        expect(searchExpression).toContain('closed:2026-05-01T10:00:00.000Z..2026-06-01T10:00:00.000Z')
    });

    test('rejects hallucinated child citations by degrading the inference while retaining census evidence', async () => {
        const pull = pullRequest({
                  number  : 77,
                  mergedAt: '2026-07-06T00:00:00.000Z',
                  comments: [{
                      id       : 'C-real', author: {login: 'tobiu'}, body: 'The only real comment.',
                      createdAt: '2026-07-05T00:00:00.000Z', updatedAt: '2026-07-05T00:00:00.000Z'
                  }]
              }),
              inference = inferenceFixture({sourceId: 'pull:77', observation: {commentId: 'C-invented'}}),
              result = await explore({
                  query   : stableHistoryQuery([pull]),
                  generate: inference.generate
              });

        expect(result.coverage.totalResolved).toBe(1);
        expect(result.citations).toHaveLength(1);
        expect(result.coverage.degraded).toBe(true);
        expect(result.coverage.degradedReason).toContain('synthesis-failed:');
        expect(result.coverage.degradedReason).toContain('unknown child');
        expect(result.synthesisAvailable).toBe(false);
        expect(result.synthesis).toBeNull()
    });

    test('degrades final synthesis that exceeds the section, word, or character response bounds', async () => {
        const pull  = pullRequest({number: 78, mergedAt: '2026-07-06T00:00:00.000Z'}),
              cases = [{
                  name    : 'word bound',
                  sections: [{text: Array.from({length: 501}, () => 'word').join(' '), sourceIds: ['pull:78']}]
              }, {
                  name    : 'section bound',
                  sections: Array.from({length: 9}, (_, index) => ({text: `section ${index}`, sourceIds: ['pull:78']}))
              }, {
                  name    : 'character bound',
                  sections: [{text: 'x'.repeat(8001), sourceIds: ['pull:78']}]
              }];

        for (const item of cases) {
            const result = await explore({
                query   : stableHistoryQuery([pull]),
                generate: async ({prompt}) => prompt.startsWith('Compose a concise Bird View')
                    ? JSON.stringify({sections: item.sections})
                    : JSON.stringify({
                        observations: [{
                            category: 'outcome', summary: 'A valid map observation.', sourceId: 'pull:78'
                        }]
                    })
            });

            expect(result.coverage.degraded, item.name).toBe(true);
            expect(result.coverage.degradedReason, item.name).toMatch(/synthesis-failed:.*(section|word|character|length|bound|limit)/i);
            expect(result.synthesisAvailable, item.name).toBe(false)
        }
    });

    test('degrades 200-source citation fan-out before an eight-section response can exceed rendered bounds', async () => {
        const sources = Array.from({length: 200}, (_, index) => ({
                  id          : `pull:${index + 1}`,
                  type        : 'pull_request',
                  number      : index + 1,
                  url         : `https://github.com/neomjs/neo/pull/${index + 1}`,
                  resolution  : 'merged',
                  resolvedAt  : '2026-07-06T00:00:00.000Z',
                  conversation: {
                      title         : '',
                      body          : '',
                      author        : null,
                      comments      : [],
                      reviews       : [],
                      reviewComments: [],
                      contentTrust  : {projected: true, quarantined: 0, signals: []}
                  }
              })),
              sourceIds = sources.map(source => source.id);
        let finalCalls = 0;

        const result = await synthesizeTemporalBirdView({
            windowStart: START_ISO,
            windowEnd  : END_ISO,
            generatedAt: NOW,
            retrieve   : async () => ({sources, coverage: {totalResolved: sources.length}}),
            synthesize : ({window, sources: inputSources}) => synthesizePullRequestHistory({
                window,
                sources : inputSources,
                generate: async ({prompt}) => {
                    if (prompt.startsWith('Compose a concise Bird View')) {
                        finalCalls++;
                        return JSON.stringify({
                            sections: Array.from({length: 8}, () => ({text: 'x', sourceIds}))
                        })
                    }

                    const batchSourceIds = [...new Set(
                        [...prompt.matchAll(/"sourceId":"(pull:\d+)"/g)].map(match => match[1])
                    )];

                    return JSON.stringify({
                        observations: batchSourceIds.map((sourceId, index) => ({
                            category: 'theme', summary: `Batch source ${index}`, sourceId
                        }))
                    })
                }
            })
        });

        expect(result.coverage.degraded).toBe(true);
        expect(result.coverage.degradedReason).toMatch(/synthesis-failed:.*(observation|section|source|citation|character|density|bound|limit)/i);
        expect(result.synthesisAvailable).toBe(false);
        expect(result.synthesis).toBeNull();
        expect(result.synthesisDetails).toBeUndefined();
        expect(finalCalls).toBeLessThanOrEqual(1)
    });

    test('degrades a schema-valid 400-observation model pass and never exposes its details', async () => {
        const source = {
                  id          : 'pull:900',
                  type        : 'pull_request',
                  number      : 900,
                  url         : 'https://github.com/neomjs/neo/pull/900',
                  resolution  : 'merged',
                  resolvedAt  : '2026-07-06T00:00:00.000Z',
                  conversation: {
                      title         : 'Observation flood',
                      body          : 'One valid source.',
                      author        : {login: 'tobiu'},
                      comments      : [],
                      reviews       : [],
                      reviewComments: [],
                      contentTrust  : {projected: true, quarantined: 0, signals: []}
                  }
              };
        let finalCalls = 0;

        const result = await synthesizeTemporalBirdView({
            windowStart: START_ISO,
            windowEnd  : END_ISO,
            generatedAt: NOW,
            retrieve   : async () => ({sources: [source], coverage: {totalResolved: 1}}),
            synthesize : ({window, sources}) => synthesizePullRequestHistory({
                window,
                sources,
                generate: async ({prompt}) => {
                    if (prompt.startsWith('Compose a concise Bird View')) {
                        finalCalls++;
                        return JSON.stringify({sections: [{text: 'Should not escape.', sourceIds: ['pull:900']}]})
                    }

                    return JSON.stringify({
                        observations: Array.from({length: 400}, (_, index) => ({
                            category: 'outcome', summary: `Schema-valid observation ${index}`, sourceId: 'pull:900'
                        }))
                    })
                }
            })
        });

        expect(result.coverage.degraded).toBe(true);
        expect(result.coverage.degradedReason).toMatch(/synthesis-failed:.*(observation|count|density|bound|limit)/i);
        expect(result.synthesisAvailable).toBe(false);
        expect(result.synthesis).toBeNull();
        expect(result.synthesisDetails).toBeUndefined();
        expect(finalCalls).toBe(0)
    });

    test('returns an honest deterministic empty view without calling inference', async () => {
        let inferenceCalls = 0,
            restCalls      = 0;

        const result = await explore({
            query: async document => {
                expect(isCensusDocument(document)).toBe(true);
                return searchPage([])
            },
            rest    : async () => { restCalls++; throw new Error('no PR means no REST call') },
            generate: async () => { inferenceCalls++; throw new Error('zero-source view does not need a model') }
        });

        expect(restCalls).toBe(0);
        expect(inferenceCalls).toBe(0);
        expect(result.coverage.totalResolved).toBe(0);
        expect(result.coverage.included).toBe(0);
        expect(result.coverage.synthesisInputCount).toBe(0);
        expect(result.citations).toEqual([]);
        expect(result.synthesis).toBe('No pull requests resolved in this window.');
        expect(result.synthesisAvailable).toBe(true)
    })
});
