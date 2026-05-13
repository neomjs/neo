import {setup} from '../../../../setup.mjs';

const appName = 'PullRequestServiceTest';
const skipCiGitHubAuth = !!process.env.NEO_TEST_SKIP_CI;

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
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

/**
 * @summary Contract coverage for `PullRequestService.getConversation` comment-selector params (#10272 §2.2).
 *
 * Prior to #10272, `getConversation(prNumber)` always returned the full PR conversation —
 * every review cycle N+1 paid context-fetch cost proportional to cumulative thread size.
 * This ticket added three optional selectors (`comment_id`, `since_comment_id`, `last_n`)
 * that narrow the returned comments array at the cost of one client-side filter pass.
 *
 * These tests pin the selector contract:
 * 1. No selectors → full conversation (backward-compat path).
 * 2. `comment_id` → single-comment result (exact-match filter).
 * 3. `since_comment_id` → comments strictly after the anchor (exclusive).
 * 4. `last_n` → last N comments (by order).
 * 5. Selector precedence (comment_id > since_comment_id > last_n) when multiple passed.
 * 6. Legacy positional `prNumber` accepted (backward compat migration path).
 *
 * Each test mocks `GraphqlService.query` to return a controlled four-comment fixture so
 * filter behavior is assertable without an actual GitHub API round-trip.
 *
 * @see Neo.ai.services.github-workflow.PullRequestService#getConversation
 */
test.describe('Neo.ai.services.github-workflow.PullRequestService — getConversation (#10272)', () => {
    let PullRequestService;
    let GraphqlService;
    let originalQuery;

    const COMMENT_A = {id: 'IC_a1111', author: {login: 'alice'}, body: 'First comment',  createdAt: '2026-04-24T01:00:00Z'};
    const COMMENT_B = {id: 'IC_b2222', author: {login: 'bob'},   body: 'Second comment', createdAt: '2026-04-24T01:10:00Z'};
    const COMMENT_C = {id: 'IC_c3333', author: {login: 'alice'}, body: 'Third comment',  createdAt: '2026-04-24T01:20:00Z'};
    const COMMENT_D = {id: 'IC_d4444', author: {login: 'bob'},   body: 'Fourth comment', createdAt: '2026-04-24T01:30:00Z'};

    const PR_FIXTURE = {
        title   : 'Test PR',
        body    : 'Body text',
        author  : {login: 'alice'},
        comments: {
            nodes: [COMMENT_A, COMMENT_B, COMMENT_C, COMMENT_D]
        }
    };

    test.beforeAll(async () => {
        GraphqlService      = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestService  = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.beforeEach(() => {
        GraphqlService.query = async () => ({repository: {pullRequest: PR_FIXTURE}});
    });

    test('returns full conversation when no selector is passed (backward-compat default)', async () => {
        const result = await PullRequestService.getConversation({pr_number: 10272});

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(4);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');
        expect(result.comments.nodes[3].id).toBe('IC_d4444');
    });

    test('accepts legacy positional prNumber form (backward-compat migration path)', async () => {
        // Existing callers predating #10272 may pass `prNumber` positionally. The new
        // signature must tolerate both forms to avoid a breaking change. Same result as
        // the object form, just demonstrating the calling convention still works.
        const result = await PullRequestService.getConversation(10272);

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(4);
    });

    test('comment_id selector returns only the matching comment', async () => {
        const result = await PullRequestService.getConversation({
            pr_number : 10272,
            comment_id: 'IC_c3333'
        });

        expect(result.title).toBe('Test PR');  // PR metadata preserved
        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');
        expect(result.comments.nodes[0].body).toBe('Third comment');
    });

    test('comment_id selector returns empty when id not found (no match ≠ fallback to full)', async () => {
        // Critical distinction: a non-matching id must return zero comments, not fall
        // through to full-conversation fetch. Silent fallthrough would mask bugs where
        // caller's comment_id is stale/invalid.
        const result = await PullRequestService.getConversation({
            pr_number : 10272,
            comment_id: 'IC_nonexistent'
        });

        expect(result.title).toBe('Test PR');
        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id selector returns comments strictly AFTER the anchor', async () => {
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_b2222'  // anchor = 2nd comment
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');  // 3rd
        expect(result.comments.nodes[1].id).toBe('IC_d4444');  // 4th
    });

    test('since_comment_id at the last comment returns empty (nothing after)', async () => {
        // Common usage pattern: agent tracks last-seen commentId, polls for new comments.
        // When no new comments exist, empty result is the correct "nothing new" signal.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_d4444'  // anchor = last comment
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('since_comment_id with invalid id returns empty (same shape as "nothing after")', async () => {
        // Caller interprets empty result as either "nothing new since N" or "invalid id".
        // Inferring intent would hide bugs; surfacing empty result lets caller decide.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_nonexistent'
        });

        expect(result.comments.nodes).toHaveLength(0);
    });

    test('last_n selector returns last N comments in order', async () => {
        const result = await PullRequestService.getConversation({
            pr_number: 10272,
            last_n   : 2
        });

        expect(result.comments.nodes).toHaveLength(2);
        expect(result.comments.nodes[0].id).toBe('IC_c3333');  // 3rd of 4
        expect(result.comments.nodes[1].id).toBe('IC_d4444');  // 4th of 4
    });

    test('last_n larger than available returns all comments', async () => {
        // Array.slice(-N) behavior: negative index larger than length returns whole array.
        // Asserting this explicitly so agents don't second-guess the edge case.
        const result = await PullRequestService.getConversation({
            pr_number: 10272,
            last_n   : 100
        });

        expect(result.comments.nodes).toHaveLength(4);
    });

    test('selector precedence: comment_id wins over since_comment_id and last_n', async () => {
        // When multiple selectors are passed, documented precedence applies.
        // Comment_id is the most specific (single-comment fetch) so it takes priority.
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            comment_id      : 'IC_a1111',
            since_comment_id: 'IC_b2222',
            last_n          : 2
        });

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_a1111');  // comment_id won
    });

    test('selector precedence: since_comment_id wins over last_n when comment_id absent', async () => {
        const result = await PullRequestService.getConversation({
            pr_number       : 10272,
            since_comment_id: 'IC_c3333',
            last_n          : 2
        });

        expect(result.comments.nodes).toHaveLength(1);
        expect(result.comments.nodes[0].id).toBe('IC_d4444');  // since_comment_id won
    });

    test('rejects missing pr_number with structured error (object form)', async () => {
        let callCount = 0;
        GraphqlService.query = async () => { callCount++; return null; };

        const result = await PullRequestService.getConversation({comment_id: 'IC_a1111'});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(callCount).toBe(0);  // no GraphQL call made
    });

    test('propagates GraphQL error shape on API failure', async () => {
        GraphqlService.query = async () => {
            throw new Error('GitHub API authentication failed');
        };

        const result = await PullRequestService.getConversation({pr_number: 10272});

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toContain('authentication');
    });
});

test.describe('Neo.ai.services.github-workflow.PullRequestService — getPullRequestDiff (#10748)', () => {
    test.skip(skipCiGitHubAuth, 'CI-skip: gh CLI auth not configured - bucket C (#10903)');

    let PullRequestService;
    let fs;
    let path;
    let aiConfig;
    
    test.beforeAll(async () => {
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
        aiConfig           = (await import('../../../../../../ai/mcp/server/github-workflow/config.mjs')).default;
        fs                 = await import('fs/promises');
        path               = await import('path');
    });

    test('files_only parameter returns structured JSON without diff body', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number : 10747,
            files_only: true
        });
        
        expect(Array.isArray(result.files)).toBe(true);
        expect(result.files.some(f => f.path.includes('cognitive-load-baseline'))).toBe(true);
    });

    test('file parameter filters the diff output', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'learn/agentos/measurements/cognitive-load-baseline-2026-05.md'
        });
        
        expect(typeof result.result).toBe('string');
        expect(result.result).toContain('Sub 4 Payload Audit Results');
    });

    test('AC3 Empirical Guard: sha-pinned diff is immune to local working tree mutations', async () => {
        const params = {
            pr_number: 10747,
            file     : 'learn/agentos/measurements/cognitive-load-baseline-2026-05.md',
            sha      : 'd8913f1fa89f585a237a5e54992b2d12865e4fb6'
        };

        // 1. Capture baseline output
        const baseline = await PullRequestService.getPullRequestDiff(params);
        
        // 2. Mutate local working tree
        const targetFilePath  = path.join(aiConfig.projectRoot, params.file);
        const originalContent = await fs.readFile(targetFilePath, 'utf-8');
        const mutatedContent  = originalContent + '\n\n# MUTATED WORKING TREE\n';
        await fs.writeFile(targetFilePath, mutatedContent);

        try {
            // 3. Re-run
            const rerunning = await PullRequestService.getPullRequestDiff(params);
            
            // 4. Assert byte-identical output
            expect(rerunning.result).toBe(baseline.result);
        } finally {
            // Restore
            await fs.writeFile(targetFilePath, originalContent);
        }
    });

    test('rejects invalid sha format', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'some/file.md',
            sha      : 'invalid-sha-xyz; touch /tmp/pwned'
        });
        
        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    test('rejects sha without file parameter', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            sha      : 'd8913f1fa89f585a237a5e54992b2d12865e4fb6'
        });
        
        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
    });

    test('returns SHA_NOT_FOUND for non-existent commit', async () => {
        const result = await PullRequestService.getPullRequestDiff({
            pr_number: 10747,
            file     : 'some/file.md',
            sha      : '0000000000000000000000000000000000000000'
        });

        expect(result.error).toBe('SHA not found');
        expect(result.code).toBe('SHA_NOT_FOUND');
    });
});

/**
 * @summary Contract coverage for `PullRequestService.managePrReview` (#11273).
 *
 * Closes the formal-state gap: atomic create or update of a formal pull request review
 * via the `addPullRequestReview` / `updatePullRequestReview` GraphQL mutations.
 *
 * Tests pin the contract:
 * 1. `action: 'create'` requires `pr_number`, `state` (mapped to event enum), `body`.
 * 2. State enum `APPROVED|REQUEST_CHANGES|COMMENT` maps to GraphQL event `APPROVE|REQUEST_CHANGES|COMMENT`.
 * 3. `action: 'update'` requires `review_id` + `body`; body-only update; state cannot transition.
 * 4. PR-id resolution failure (PR not found) returns `PR_NOT_FOUND` cleanly.
 * 5. Argument validation errors are surfaced (invalid action / missing body / invalid state / etc.).
 *
 * Each test mocks `GraphqlService.query` to return controlled fixtures so the mutation
 * contract is assertable without GitHub API round-trips.
 *
 * @see Neo.ai.services.github-workflow.PullRequestService#managePrReview
 */
test.describe('Neo.ai.services.github-workflow.PullRequestService — managePrReview (#11273)', () => {
    let PullRequestService;
    let GraphqlService;
    let originalQuery;

    const PR_NODE_ID    = 'PR_kwDOABcD9999999999';
    const REVIEW_NODE   = {
        id         : 'PRR_kwDOABcD1111111111',
        url        : 'https://github.com/neomjs/neo/pull/11273#pullrequestreview-12345',
        state      : 'APPROVED',
        submittedAt: '2026-05-13T00:00:00Z',
        databaseId : 12345
    };

    test.beforeAll(async () => {
        GraphqlService     = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        PullRequestService = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;
        originalQuery      = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test.beforeEach(() => {
        // Default mock: resolve PR id then return create-shaped review payload.
        // Tests override per-case via reassigning GraphqlService.query.
        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) {
                return {repository: {pullRequest: {id: PR_NODE_ID}}};
            }

            if (queryString.includes('AddPullRequestReview')) {
                return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            }

            if (queryString.includes('UpdatePullRequestReview')) {
                return {updatePullRequestReview: {pullRequestReview: {...REVIEW_NODE, submittedAt: '2026-05-13T01:00:00Z'}}};
            }

            return null;
        };
    });

    test('action:create + state:APPROVED → submits APPROVE event, returns review payload', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED',
            body     : 'LGTM, cross-family review complete.'
        });

        expect(result.error).toBeUndefined();
        expect(result.message).toContain('Successfully created APPROVED review on PR #11273');
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(result.state).toBe('APPROVED');
        expect(result.url).toBe('https://github.com/neomjs/neo/pull/11273#pullrequestreview-12345');
        expect(result.submittedAt).toBe('2026-05-13T00:00:00Z');
        expect(result.databaseId).toBe(12345);
    });

    test('action:create + state:REQUEST_CHANGES → state enum maps to REQUEST_CHANGES event', async () => {
        // Mock returns CHANGES_REQUESTED state to mirror real GitHub semantics
        // (event REQUEST_CHANGES → review state CHANGES_REQUESTED).
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) {
                capturedVariables = variables;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'CHANGES_REQUESTED'}}};
            }
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'REQUEST_CHANGES',
            body     : 'Required Action: address X.'
        });

        expect(result.error).toBeUndefined();
        expect(capturedVariables.event).toBe('REQUEST_CHANGES');
        expect(capturedVariables.pullRequestId).toBe(PR_NODE_ID);
        expect(result.state).toBe('CHANGES_REQUESTED');
    });

    test('action:create + state:COMMENT → state enum maps to COMMENT event', async () => {
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) {
                capturedVariables = variables;
                return {addPullRequestReview: {pullRequestReview: {...REVIEW_NODE, state: 'COMMENTED'}}};
            }
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'COMMENT',
            body     : 'Substantive review comment without formal state transition.'
        });

        expect(result.error).toBeUndefined();
        expect(capturedVariables.event).toBe('COMMENT');
        expect(result.state).toBe('COMMENTED');
    });

    test('action:update → returns updated review payload via UPDATE_PULL_REQUEST_REVIEW', async () => {
        let capturedQuery;
        let capturedVariables;
        GraphqlService.query = async (queryString, variables) => {
            capturedQuery     = queryString;
            capturedVariables = variables;
            return {updatePullRequestReview: {pullRequestReview: {...REVIEW_NODE, submittedAt: '2026-05-13T01:00:00Z'}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'update',
            review_id: 'PRR_kwDOABcD1111111111',
            body     : 'Updated review body.'
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(result.submittedAt).toBe('2026-05-13T01:00:00Z');
        expect(capturedQuery).toContain('UpdatePullRequestReview');
        expect(capturedVariables.pullRequestReviewId).toBe('PRR_kwDOABcD1111111111');
        expect(capturedVariables.body).toBe('Updated review body.');
    });

    test('rejects invalid action', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'submit',
            body  : 'irrelevant'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.message).toContain("Must be 'create' or 'update'");
    });

    test('rejects missing body', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'body' is required");
    });

    test('create: rejects missing pr_number', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'create',
            state : 'APPROVED',
            body  : 'irrelevant'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'pr_number'");
    });

    test('create: rejects invalid state', async () => {
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'INVALID_STATE',
            body     : 'irrelevant'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.message).toContain('Invalid state');
    });

    test('update: rejects missing review_id', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'update',
            body  : 'irrelevant'
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'review_id'");
    });

    test('create: surfaces PR_NOT_FOUND when GET_PULL_REQUEST_ID returns no id', async () => {
        // Simulates a non-existent PR number — GraphQL returns repository.pullRequest = null.
        GraphqlService.query = async (queryString) => {
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: null}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 99999,
            state    : 'APPROVED',
            body     : 'irrelevant'
        });

        expect(result.error).toBe('Not Found');
        expect(result.code).toBe('PR_NOT_FOUND');
    });

    test('create: surfaces GraphQL errors cleanly', async () => {
        // When the underlying GraphQL request throws, we should return a structured
        // error rather than letting the exception propagate to the caller.
        GraphqlService.query = async () => {
            throw new Error('Network failure');
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11273,
            state    : 'APPROVED',
            body     : 'irrelevant'
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toBe('Network failure');
    });
});
