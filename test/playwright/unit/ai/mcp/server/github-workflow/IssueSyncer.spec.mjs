import {setup} from '../../../../../setup.mjs';

const appName = 'IssueSyncerTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../../src/manager/Instance.mjs';
import fs              from 'fs-extra';
import path            from 'path';

/**
 * @summary Regression coverage for the timelineItems pagination fix in IssueSyncer (#10090).
 *
 * Builds a mocked GitHub issue whose `timelineItems` connection has 75 events split across
 * two pages — more than `maxTimelineItemsPerIssue` (50) — and drives the refetch path to
 * confirm that every comment body and structural event makes it into the rendered markdown.
 * Before the fix, the second-page tail was silently dropped.
 */
test.describe('Neo.ai.mcp.server.github-workflow.services.sync.IssueSyncer', () => {
    let IssueSyncer;
    let GraphqlService;
    let issueSyncConfig;
    let originalQuery;
    let tmpIssuesDir;

    test.beforeAll(async () => {
        const aiConfig = (await import('../../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        issueSyncConfig = aiConfig.issueSync;

        tmpIssuesDir = path.resolve(process.cwd(), 'tmp', `issue-syncer-test-${process.pid}-${Date.now()}`);
        await fs.ensureDir(tmpIssuesDir);

        // Redirect local markdown writes to the tmp dir so the test does not pollute
        // the real resources/content/issues tree.
        issueSyncConfig.issuesDir = tmpIssuesDir;

        GraphqlService = (await import('../../../../../../../ai/mcp/server/github-workflow/services/GraphqlService.mjs')).default;
        IssueSyncer    = (await import('../../../../../../../ai/mcp/server/github-workflow/services/sync/IssueSyncer.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(async () => {
        GraphqlService.query = originalQuery;
        await fs.remove(tmpIssuesDir).catch(() => {});
    });

    test('detectStaleCommentsCounts lazily seeds entries missing the sentinel', async () => {
        const metadata = {
            issues: {
                100: {state: 'OPEN', commentsTotal: undefined},
                101: {state: 'OPEN', commentsTotal: undefined}
            }
        };

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssueTotalsBatch')) {
                return {
                    repository: {
                        issue100: {number: 100, comments: {totalCount: 5}},
                        issue101: {number: 101, comments: {totalCount: 3}}
                    },
                    rateLimit: {cost: 1, remaining: 5000, resetAt: ''}
                };
            }
            throw new Error(`Unexpected GraphQL query: ${query.slice(0, 80)}`);
        };

        const result = await IssueSyncer.detectStaleCommentsCounts(metadata);

        expect(result.checked).toBe(2);
        expect(result.seeded).toBe(2);
        expect(result.stale).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
        expect(metadata.issues[100].commentsTotal).toBe(5);
        expect(metadata.issues[101].commentsTotal).toBe(3);
    });

    test('detectStaleCommentsCounts reports no drift when live totals match stored sentinels', async () => {
        const metadata = {
            issues: {
                200: {state: 'OPEN', commentsTotal: 4},
                201: {state: 'OPEN', commentsTotal: 7}
            }
        };

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssueTotalsBatch')) {
                return {
                    repository: {
                        issue200: {number: 200, comments: {totalCount: 4}},
                        issue201: {number: 201, comments: {totalCount: 7}}
                    },
                    rateLimit: {cost: 1, remaining: 5000, resetAt: ''}
                };
            }
            throw new Error(`Unexpected GraphQL query: ${query.slice(0, 80)}`);
        };

        const result = await IssueSyncer.detectStaleCommentsCounts(metadata);

        expect(result.checked).toBe(2);
        expect(result.seeded).toBe(0);
        expect(result.stale).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    test('detectStaleCommentsCounts reports drift when live totalCount diverges from stored sentinel', async () => {
        // This is the #9535 scenario: a comment was deleted on GitHub, updatedAt did not bump,
        // so the local frontmatter still says commentsCount: 11 while live reports 10.
        const metadata = {
            issues: {
                300: {state: 'OPEN', commentsTotal: 11},
                301: {state: 'OPEN', commentsTotal: 4} // unchanged; should NOT appear in stale
            }
        };

        GraphqlService.query = async (query) => {
            if (query.includes('FetchIssueTotalsBatch')) {
                return {
                    repository: {
                        issue300: {number: 300, comments: {totalCount: 10}}, // deletion detected
                        issue301: {number: 301, comments: {totalCount: 4}}
                    },
                    rateLimit: {cost: 1, remaining: 5000, resetAt: ''}
                };
            }
            throw new Error(`Unexpected GraphQL query: ${query.slice(0, 80)}`);
        };

        const result = await IssueSyncer.detectStaleCommentsCounts(metadata);

        expect(result.checked).toBe(2);
        expect(result.seeded).toBe(0);
        expect(result.stale).toHaveLength(1);
        expect(result.stale[0]).toEqual({number: 300, stored: 11, live: 10});
        expect(result.errors).toHaveLength(0);
        // Stored sentinel is NOT mutated; refetchIssuesByNumber handles the authoritative update.
        expect(metadata.issues[300].commentsTotal).toBe(11);
    });

    test('refetchIssuesByNumber paginates timeline and renders all events past the page cap', async () => {
        const PAGE_SIZE    = issueSyncConfig.maxTimelineItemsPerIssue; // 50
        const TOTAL_EVENTS = 75;
        const FIRST_PAGE   = Array.from({length: PAGE_SIZE}, (_, i) => buildComment(i));
        const SECOND_PAGE  = Array.from({length: TOTAL_EVENTS - PAGE_SIZE}, (_, i) => buildCrossRef(PAGE_SIZE + i));

        // Minimal GraphQL issue shape that IssueSyncer.#formatIssueMarkdown accepts.
        const mockIssue = {
            number   : 42042,
            title    : 'Mock issue — pagination regression #10090',
            body     : 'This is the mock issue body.',
            state    : 'OPEN',
            createdAt: '2026-04-19T00:00:00Z',
            updatedAt: '2026-04-19T12:00:00Z',
            closedAt : null,
            url      : 'https://github.com/neomjs/neo/issues/42042',
            author   : {login: 'tobiu'},
            labels   : {nodes: [{name: 'bug'}]},
            assignees: {nodes: [{login: 'tobiu'}]},
            milestone: null,
            comments : {totalCount: PAGE_SIZE},
            parent   : null,
            subIssues        : {nodes: []},
            subIssuesSummary : {total: 0, completed: 0, percentCompleted: 0},
            blockedBy        : {nodes: []},
            blocking         : {nodes: []},
            timelineItems    : {
                pageInfo: {hasNextPage: true, endCursor: 'cursor-page-1'},
                nodes   : FIRST_PAGE
            }
        };

        // Counts how many continuation calls the pagination primitive made.
        let continuationCalls = 0;

        GraphqlService.query = async (query, variables) => {
            // FETCH_SINGLE_ISSUE: return the first-page view of the mock issue.
            if (query.includes('FetchSingleIssue')) {
                return {
                    repository: {
                        issue: structuredClone(mockIssue)
                    }
                };
            }

            // FETCH_ISSUE_TIMELINE_PAGE: serve the continuation page.
            if (query.includes('FetchIssueTimelinePage')) {
                continuationCalls++;
                return {
                    repository: {
                        issue: {
                            timelineItems: {
                                pageInfo: {hasNextPage: false, endCursor: null},
                                nodes   : SECOND_PAGE
                            }
                        }
                    },
                    rateLimit: {cost: 1, remaining: 5000, resetAt: '2026-04-19T13:00:00Z'}
                };
            }

            throw new Error(`Unexpected GraphQL query in test: ${query.slice(0, 80)}`);
        };

        const metadata = {issues: {}};
        const stats    = await IssueSyncer.refetchIssuesByNumber([mockIssue.number], metadata);

        expect(stats.refetched.count).toBe(1);
        expect(stats.refetched.issues).toContain(mockIssue.number);
        expect(stats.errors).toHaveLength(0);
        expect(continuationCalls).toBe(1);

        const writtenPath = path.join(tmpIssuesDir, `issue-${mockIssue.number}.md`);
        const written     = await fs.readFile(writtenPath, 'utf-8');

        // Every comment body must appear — the bug being fixed is that second-page comments
        // were silently dropped.
        const commentHeaders = written.match(/^### @mockuser\d+ - /gm) || [];
        expect(commentHeaders).toHaveLength(PAGE_SIZE);

        // Every cross-reference event on the second page must appear too.
        const eventLines = written.match(/^- 2026-04-19T[^ ]+ @tobiu cross-referenced by #\d+$/gm) || [];
        expect(eventLines).toHaveLength(TOTAL_EVENTS - PAGE_SIZE);

        // And frontmatter must reflect the metadata channel unchanged.
        expect(written).toContain(`id: ${mockIssue.number}`);
        expect(written).toContain(`commentsCount: ${PAGE_SIZE}`);
    });
});

function buildComment(i) {
    const minute = String(i).padStart(2, '0');
    return {
        __typename: 'IssueComment',
        createdAt : `2026-04-19T10:${minute}:00Z`,
        author    : {login: `mockuser${i}`},
        body      : `Mock comment body #${i}.`
    };
}

function buildCrossRef(i) {
    const minute = String(i).padStart(2, '0');
    return {
        __typename: 'CrossReferencedEvent',
        createdAt : `2026-04-19T11:${minute}:00Z`,
        actor     : {login: 'tobiu'},
        source    : {__typename: 'Issue', number: 10000 + i}
    };
}
