import {setup} from '../../../../setup.mjs';

const appName          = 'PullRequestServiceTest';
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
import fs              from 'fs';
import path            from 'path';
import vm              from 'vm';
import * as yaml       from 'js-yaml';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

test.describe('Neo.ai.services.github-workflow.PullRequestService — checkoutPullRequest (#13052)', () => {
    let buildCheckoutPullRequest;

    const silentLogger = {error: () => {}};

    test.beforeAll(async () => {
        ({buildCheckoutPullRequest} = await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs'));
    });

    test('refuses checkout when caller workspace repoPath is absent', async () => {
        let   execCalls           = 0;
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async () => {
                execCalls++;
                throw new Error('should not execute git or gh');
            }
        });

        const result = await checkoutPullRequest(13050);

        expect(result.error).toBe('Unsafe checkout refused');
        expect(result.code).toBe('CALLER_WORKSPACE_REQUIRED');
        expect(result.repoPath).toBe('/server/shared-repo');
        expect(result.message).toContain('cannot infer the caller workspace');
        expect(execCalls).toBe(0);
    });

    test('rejects repoPath that is not the git top-level', async () => {
        const calls               = [];
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});
                return {stdout: '/tmp/caller-worktree\n'};
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 13050,
            repoPath : '/tmp/caller-worktree/subdir'
        });

        expect(result.error).toBe('Unsafe checkout refused');
        expect(result.code).toBe('REPO_PATH_NOT_GIT_ROOT');
        expect(result.repoPath).toBe('/tmp/caller-worktree/subdir');
        expect(result.gitTopLevel).toBe('/tmp/caller-worktree');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            command: 'git',
            args   : ['rev-parse', '--show-toplevel'],
            cwd    : '/tmp/caller-worktree/subdir'
        });
    });

    test('checks out explicit repoPath and returns read-back git state', async () => {
        const calls               = [];
        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return {stdout: '/tmp/caller-worktree\n'};
                }

                if (command === 'gh') {
                    return {stdout: "Switched to branch 'agent/13050-fixture'\n"};
                }

                if (command === 'git' && args[0] === 'branch') {
                    return {stdout: 'agent/13050-fixture\n'};
                }

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
                    return {stdout: '0123456789abcdef0123456789abcdef01234567\n'};
                }

                throw new Error(`unexpected command ${command} ${args.join(' ')}`);
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 13050,
            repoPath : '/tmp/caller-worktree'
        });

        expect(result.error).toBeUndefined();
        expect(result.repoPath).toBe('/tmp/caller-worktree');
        expect(result.branch).toBe('agent/13050-fixture');
        expect(result.headSha).toBe('0123456789abcdef0123456789abcdef01234567');
        expect(result.details).toContain('Switched to branch');
        expect(calls.map(call => call.cwd)).toEqual([
            '/tmp/caller-worktree',
            '/tmp/caller-worktree',
            '/tmp/caller-worktree',
            '/tmp/caller-worktree'
        ]);
        expect(calls[1]).toEqual({
            command: 'gh',
            args   : ['pr', 'checkout', '13050'],
            cwd    : '/tmp/caller-worktree'
        });
    });

    test('surfaces gh checkout failure without reporting success state', async () => {
        const calls = [];
        const error = new Error('checkout failed');
        error.code = 1;
        error.stderr = 'could not find remote ref';

        const checkoutPullRequest = buildCheckoutPullRequest({
            projectRoot: '/server/shared-repo',
            log        : silentLogger,
            execFileFn : async (command, args, options) => {
                calls.push({command, args, cwd: options.cwd});

                if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
                    return {stdout: '/tmp/caller-worktree\n'};
                }

                throw error;
            }
        });

        const result = await checkoutPullRequest({
            pr_number: 99999,
            repoPath : '/tmp/caller-worktree'
        });

        expect(result.error).toBe('GitHub CLI command failed');
        expect(result.code).toBe('GH_CLI_ERROR');
        expect(result.repoPath).toBe('/tmp/caller-worktree');
        expect(result.details).toContain('could not find remote ref');
        expect(result.branch).toBeUndefined();
        expect(result.headSha).toBeUndefined();
        expect(calls).toHaveLength(2);
    });
});

/**
 * @summary Contract coverage for `PullRequestService.getConversation` comment-selector params.
 *
 * Before selector support, `getConversation(prNumber)` always returned the full PR conversation;
 * every review cycle N+1 paid context-fetch cost proportional to cumulative thread size. The
 * service now exposes three optional selectors (`comment_id`, `since_comment_id`, `last_n`) that
 * narrow the returned comments array at the cost of one client-side filter pass.
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
        // Existing callers may pass `prNumber` positionally. The object-form
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
 * @summary Returns the inline GitHub Script used by the agent PR review-body lint workflow.
 * @returns {String} The workflow script source.
 */
function getAgentPrReviewBodyLintScript() {
    const
        workflowPath = path.resolve(process.cwd(), '.github/workflows/agent-pr-review-body-lint.yml'),
        workflow     = yaml.load(fs.readFileSync(workflowPath, 'utf8')),
        step         = workflow.jobs['lint-pr-review-body'].steps.find(item => item.name === 'Validate PR Review Body');

    return step.with.script;
}

/**
 * @summary Executes the review-body lint workflow script with stubbed GitHub Actions services.
 * @param {Object} options Execution options.
 * @param {String} options.body Review body to validate.
 * @param {String} [options.reviewer='neo-gpt'] GitHub login for the simulated reviewer.
 * @returns {Promise<Object>} Captured workflow comments, failures, and log lines.
 */
async function runAgentPrReviewBodyLintWorkflow({body, reviewer = 'neo-gpt'} = {}) {
    const
        comments = [],
        failures = [],
        logs     = [],
        context  = {
            repo   : {owner: 'neomjs', repo: 'neo'},
            payload: {
                review: {
                    id  : 1391001,
                    user: {login: reviewer},
                    body
                },
                pull_request: {number: 13910}
            }
        },
        coreStub = {
            setFailed: message => failures.push(message)
        },
        githubStub = {
            rest: {
                issues: {
                    createComment: async payload => comments.push(payload)
                }
            }
        },
        consoleStub = {
            log: message => logs.push(message)
        };

    await vm.runInNewContext(
        `(async () => {\n${getAgentPrReviewBodyLintScript()}\n})()`,
        {
            console: consoleStub,
            context,
            core   : coreStub,
            github : githubStub
        },
        {timeout: 1000}
    );

    return {comments, failures, logs};
}

/**
 * @summary Contract coverage for `PullRequestService.managePrReview`.
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

    const PR_NODE_ID  = 'PR_kwDOABcD9999999999';
    const REVIEW_NODE = {
        id         : 'PRR_kwDOABcD1111111111',
        url        : 'https://github.com/neomjs/neo/pull/11273#pullrequestreview-12345',
        state      : 'APPROVED',
        submittedAt: '2026-05-13T00:00:00Z',
        databaseId : 12345
    };

    // Compact review body that passes BOTH layers of the tool-boundary template-anchor validator:
    // - VISIBLE layer: the 7 evaluation-metric tags from pr-review-template.md / pr-review-followup-template.md
    // - INVISIBLE layer: structural anchors NOT enumerated in error responses; see
    //   `INVISIBLE_PR_REVIEW_ANCHORS` constant in `ai/services/github-workflow/PullRequestService.mjs`
    //   for the canonical list. Tests deliberately compose this constant with structural substrings
    //   present (rather than naming the invisible-list in test prose) to avoid leaking the safeguard
    //   into discovery surfaces while still asserting behavior.
    // Substantive review content (prose, depth-floor, audit findings) is the peer-reviewer's responsibility;
    // this constant only satisfies the mechanical depth-floor gate so the downstream behavior under test
    // (action dispatch, GraphQL error handling, PR_NOT_FOUND) can be exercised.
    const VALID_REVIEW_BODY = [
        '# PR Review Summary',
        '',
        '**Status:** Approved',
        '',
        '### 🪜 Strategic-Fit Decision',
        '- Decision: Approve',
        '',
        '### 🧭 Patch-Blind Premise Snapshot',
        '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
        '* **Expected Solution Shape:** preserve the selected review template skeleton.',
        '* **Patch Verdict:** matches the expected shape.',
        '* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.',
        '',
        '### 🕸️ Context & Graph Linking',
        '* **Target Epic / Issue ID:** Resolves #11273',
        '* **Related Graph Nodes:** #11491',
        '',
        '### 🔬 Depth Floor',
        '- Documented search: scanned all relevant surfaces.',
        '',
        '### 🧠 Graph Ingestion Notes',
        '* **`[KB_GAP]`**: N/A.',
        '* **`[TOOLING_GAP]`**: N/A.',
        '* **`[RETROSPECTIVE]`**: Template validator fixture.',
        '',
        '### 📋 Required Actions',
        'No required actions — eligible for human merge.',
        '',
        '### 📊 Evaluation Metrics',
        '[ARCH_ALIGNMENT]: 80 - structural fit',
        '[CONTENT_COMPLETENESS]: 80 - covers AC matrix',
        '[EXECUTION_QUALITY]: 80 - tests pass',
        '[PRODUCTIVITY]: 70 - bounded scope',
        '[IMPACT]: 60 - localized substrate fix',
        '[COMPLEXITY]: 40 - mechanical change',
        '[EFFORT_PROFILE]: Quick Win'
    ].join('\n');

    const VALID_FOLLOWUP_REVIEW_BODY = [
        '# PR Review Follow-Up Summary',
        '',
        '**Status:** Approved',
        '',
        '**Cycle:** Cycle 2 follow-up',
        '',
        '**Opening:** Re-checking the addressed delta.',
        '',
        '### 🧭 Patch-Blind Premise Snapshot',
        '* **Inputs Read Before Patch:** prior review, author response, changed-file list.',
        '* **Expected Solution Shape:** narrow delta preserves prior approval anchors.',
        '* **Patch Verdict:** matches the expected delta.',
        '* **Premise Coherence:** coheres: a narrow delta; no value-surface change.',
        '',
        '### 🪜 Strategic-Fit Decision',
        '- **Decision**: Approve',
        '- **Rationale**: The delta resolves the prior blocker.',
        '',
        '### ⚓ Prior Review Anchor',
        '* **PR:** #11273',
        '* **Target Issue:** #11491',
        '* **Prior Review Comment ID:** PRR_123',
        '* **Author Response Comment ID:** IC_456',
        '* **Latest Head SHA:** abc1234',
        '',
        '### 🔁 Delta Scope',
        '* **Files changed:** PR body only',
        '* **PR body / close-target changes:** pass',
        '* **Branch freshness / merge state:** clean',
        '',
        '### ✅ Previous Required Actions Audit',
        '* **Addressed:** prior template miss — current body keeps canonical headings.',
        '',
        '### 🔬 Delta Depth Floor',
        '* **Documented delta search:** I actively checked changed metadata, the prior blocker, and close-target state and found no new concerns.',
        '',
        '### 📊 Metrics Delta',
        '* **`[ARCH_ALIGNMENT]`**: unchanged from prior review',
        '* **`[CONTENT_COMPLETENESS]`**: unchanged from prior review',
        '* **`[EXECUTION_QUALITY]`**: unchanged from prior review',
        '* **`[PRODUCTIVITY]`**: unchanged from prior review',
        '* **`[IMPACT]`**: unchanged from prior review',
        '* **`[COMPLEXITY]`**: unchanged from prior review',
        '* **`[EFFORT_PROFILE]`**: unchanged from prior review',
        '',
        '### 📋 Required Actions',
        '',
        'No required actions — eligible for human merge.'
    ].join('\n');

    const VALID_MICRO_DELTA_REVIEW_BODY = [
        '# Pull Request Micro-Delta Review',
        '',
        '> **Context:** This review is using the Micro-Delta Approval format because the Review-Loop Cost Circuit Breaker has fired and the convergence assessment is state (a): the underlying PR has previously received thorough semantic review and has reached the mechanical-hygiene or metadata-drift phase.',
        '',
        '### State Vector',
        '- **Target SHA:** abc1234',
        '- **Current reviewDecision:** CHANGES_REQUESTED',
        '- **Semantic Status:** APPROVED',
        '- **CI Status:** GREEN',
        '- **Remaining Blocker Class:** mechanical-hygiene',
        '- **Measured Discussion Cost:** > 24KB',
        '',
        '### Micro-Delta Focus',
        '*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*',
        '',
        '- `[x]` **Issue 1:** ai/config.template.mjs - stale wording repaired.',
        '',
        '### Verdict',
        '- [ ] **APPROVED** (All mechanical-hygiene cleared. Merge-ready.)',
        '- [x] **CHANGES_REQUESTED** (Mechanical-hygiene defects remain as listed above.)',
        '- [ ] **MAINTAINER POLISH FAST PATH APPLIED** (Reviewer unilaterally patched and pushed fixes. Approved.)'
    ].join('\n');

    // Micro-Review (Cycle-1, blast-scaled light shape) — the minimal floor: header + Class
    // (asserting micro|contained|mechanical) + Verdict + Glance.
    const VALID_MICRO_REVIEW_BODY = [
        '# PR Micro-Review',
        '',
        '**Class:** micro — a one-line doc typo fix; no ADR / subsystem / consumed-contract / security / migration trigger, 2-line diff.',
        '',
        '**Verdict:** APPROVED',
        '',
        '**Glance:** Premise + correctness: the change is the right shape (fixes the stale wording) and is correct + safe; no behavior touched.'
    ].join('\n');

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
            body     : `LGTM, cross-family review complete.\n\n${VALID_REVIEW_BODY}`
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
            body     : `Required Action: address X.\n\n${VALID_REVIEW_BODY}`
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
            body     : `Substantive review comment without formal state transition.\n\n${VALID_REVIEW_BODY}`
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
            body     : `Updated review body.\n\n${VALID_REVIEW_BODY}`
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(result.submittedAt).toBe('2026-05-13T01:00:00Z');
        expect(capturedQuery).toContain('UpdatePullRequestReview');
        expect(capturedVariables.pullRequestReviewId).toBe('PRR_kwDOABcD1111111111');
        expect(capturedVariables.body).toContain('Updated review body.');
        expect(capturedVariables.body).toContain('[ARCH_ALIGNMENT]'); // template anchor preserved through dispatch
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
            body  : VALID_REVIEW_BODY
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
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.message).toContain('Invalid state');
    });

    test('update: rejects missing review_id', async () => {
        const result = await PullRequestService.managePrReview({
            action: 'update',
            body  : VALID_REVIEW_BODY
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
            body     : VALID_REVIEW_BODY
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
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBe('GraphQL API request failed');
        expect(result.code).toBe('GRAPHQL_API_ERROR');
        expect(result.message).toBe('Network failure');
    });

    // ────────────────────────────────────────────────────────────────────────
    // Tool-boundary mechanical body-shape validation
    //   Visible layer: 7 metric tags, misses named in error
    //   Invisible layer: structural anchors, checked but NOT named in error
    //                    (defeats Goodhart anchor-stuffing — operator-directed 2026-05-16)
    // ────────────────────────────────────────────────────────────────────────

    test('#11491: rejects body missing all 7 visible metric anchors AND structural anchors', async () => {
        // The empirical recurrence: prior reviews shipped a hallucinated "Structural Evaluation
        // Matrix" with 5 invented metric names on a 1-10 scale, completely bypassing the template's
        // 7 evaluation-metric tags. The Retrospective daemon's regex parser saw zero ingest signal,
        // losing review-substrate data from the Native Edge Graph. This test pins the tool-boundary
        // gate that prevents this class of substrate loss.
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : 'LGTM, looks great!'
        });

        expect(result.error).toBe('PR Review Template Validation Failed');
        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // Visible-layer surface: missing_visible IS enumerated for caller diagnostics.
        expect(result.missing_visible).toEqual([
            '[ARCH_ALIGNMENT]',
            '[CONTENT_COMPLETENESS]',
            '[EXECUTION_QUALITY]',
            '[PRODUCTIVITY]',
            '[IMPACT]',
            '[COMPLEXITY]',
            '[EFFORT_PROFILE]'
        ]);
        // Skill-pointing discipline: the error MUST direct the agent to read the skill rather
        // than rely on the named-list to stuff anchors.
        expect(result.skill).toBe('.agents/skills/pr-review/SKILL.md');
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-template.md');
        // Anti-hallucination phrasing must be present so agents see the "do not compose substitute"
        // guidance. Case-insensitive match to avoid coupling to exact capitalization.
        expect(result.message.toLowerCase()).toContain('do not compose a substitute');
        expect(result.message).toContain('.agents/skills/pr-review/SKILL.md');
        // Critical: no GitHub API call should have been made — bad data must not land on GitHub.
        expect(graphqlCallCount).toBe(0);
    });

    test('#11491: Goodhart-stuffed body — all 7 metric tags present but missing structural anchors — still REJECTED', async () => {
        // Empirical anchor: a prior review contained ALL 7 metric tags but missed the structural
        // template anchors. The visible-only validator would have PASSED this body (the canonical
        // Goodhart-stuffing failure mode the invisible layer prevents). This test asserts that
        // structural-only-stuffing IS rejected without naming the invisible anchors in test prose.
        const stuffedBody = [
            'Approval granted.',
            // Premise snapshot complete, so the structural-skeleton miss (not the premise) is the isolated failure.
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** preserve the selected review template skeleton.',
            '* **Patch Verdict:** matches the expected shape.',
            '* **Premise Coherence:** coheres: a stuffing-regression fixture; no value-surface.',
            '[ARCH_ALIGNMENT]: 100',
            '[CONTENT_COMPLETENESS]: 100',
            '[EXECUTION_QUALITY]: 100',
            '[PRODUCTIVITY]: 100',
            '[IMPACT]: 80',
            '[COMPLEXITY]: 20',
            '[EFFORT_PROFILE]: Quick Win'
            // Deliberately missing the structural template anchors that VALID_REVIEW_BODY contains.
            // The invisible layer rejects this without naming what's missing.
        ].join('\n');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : stuffedBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // All 7 visible anchors present → missing_visible is empty.
        expect(result.missing_visible).toEqual([]);
        // But the message must still direct the agent to read the skill.
        expect(result.message).toContain('.agents/skills/pr-review/SKILL.md');
        expect(result.message).toContain('does not match the pr-review template structure');
        // Diagnostic-hint branch when no visible anchors are missing: must communicate
        // structural-anchor-class miss without enumerating the invisible list.
        expect(result.message).toContain('structural template anchors do not');
        // No GitHub API call — Goodhart-stuffing must not reach the wire.
        expect(graphqlCallCount).toBe(0);
    });

    test('#13547: rejects plain-heading cycle-1 review skeleton drift', async () => {
        const plainFullReviewBody = [
            '# PR Review Summary',
            '',
            '**Status:** Approved',
            '',
            '### Strategic-Fit Decision',
            '- Decision: Approve',
            '',
            '### Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** preserve the selected review template skeleton.',
            '* **Patch Verdict:** matches the expected shape.',
            '* **Premise Coherence:** coheres: a plain-heading regression fixture; no value-surface.',
            '',
            '### Context & Graph Linking',
            '* **Target Epic / Issue ID:** Resolves #13547',
            '',
            '### Depth Floor',
            '- Documented search: scanned all relevant surfaces.',
            '',
            '### Graph Ingestion Notes',
            '* **`[KB_GAP]`**: N/A.',
            '* **`[TOOLING_GAP]`**: N/A.',
            '* **`[RETROSPECTIVE]`**: Plain-heading regression fixture.',
            '',
            '### Required Actions',
            'No required actions — eligible for human merge.',
            '',
            '### Evaluation Metrics',
            '[ARCH_ALIGNMENT]: 90 - aligned',
            '[CONTENT_COMPLETENESS]: 90 - complete',
            '[EXECUTION_QUALITY]: 90 - verified',
            '[PRODUCTIVITY]: 90 - delivers scope',
            '[IMPACT]: 70 - workflow guard',
            '[COMPLEXITY]: 40 - bounded validator',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : plainFullReviewBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual([]);
        expect(result.message).toContain('does not match the pr-review template structure');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13547: accepts icon-bearing follow-up review skeleton', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : VALID_FOLLOWUP_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#13910: accepts documented Micro-Delta review without full metric anchors', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'REQUEST_CHANGES',
            body     : VALID_MICRO_DELTA_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#13910: rejects incomplete Micro-Delta review before GraphQL dispatch', async () => {
        const incompleteBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Measured Discussion Cost:** > 24KB\n', '');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'REQUEST_CHANGES',
            body     : incompleteBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.circuitBreaker).toBe('.agents/skills/pr-review/audits/review-cost-circuit-breaker.md');
        expect(result.template).toBe('.agents/skills/pr-review/assets/pr-review-micro-delta-template.md');
        expect(result.missing_micro_delta).toContain('- **Measured Discussion Cost:**');
        expect(result.message).toContain('pr-review-micro-delta-template.md');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13910: rejects Micro-Delta review with a semantic blocker class', async () => {
        const semanticShortcutBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Remaining Blocker Class:** mechanical-hygiene', '- **Remaining Blocker Class:** semantic-blocker');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13910,
            state    : 'REQUEST_CHANGES',
            body     : semanticShortcutBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_micro_delta).toContain('Remaining Blocker Class: mechanical-hygiene | metadata-drift');
        expect(result.message).toContain('full follow-up review template instead');
        expect(graphqlCallCount).toBe(0);
    });

    test('#13910: workflow lint accepts documented Micro-Delta review bodies', async () => {
        const result = await runAgentPrReviewBodyLintWorkflow({
            body: VALID_MICRO_DELTA_REVIEW_BODY
        });

        expect(result.failures).toEqual([]);
        expect(result.comments).toEqual([]);
        expect(result.logs).toContain('✅ Micro-Delta body matches the documented circuit-breaker shape.');
    });

    test('#13910: workflow lint rejects incomplete Micro-Delta bodies before canonical fallback', async () => {
        const incompleteBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Measured Discussion Cost:** > 24KB\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body: incompleteBody
        });

        expect(result.failures).toEqual([
            'Agent micro-delta review body missing required circuit-breaker anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent Micro-Delta Review Body Lint Violation');
        expect(result.comments[0].body).toContain('.agents/skills/pr-review/assets/pr-review-micro-delta-template.md');
        expect(result.comments[0].body).not.toContain('Visible anchors missing');
    });

    test('#13910: workflow lint rejects Micro-Delta semantic blocker shortcuts', async () => {
        const semanticShortcutBody = VALID_MICRO_DELTA_REVIEW_BODY
            .replace('- **Remaining Blocker Class:** mechanical-hygiene', '- **Remaining Blocker Class:** semantic-blocker');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body: semanticShortcutBody
        });

        expect(result.failures[0]).toContain('micro-delta review body missing required circuit-breaker anchors');
        expect(result.comments[0].body).toContain('mechanical-hygiene or metadata-drift');
        expect(result.comments[0].body).toContain('full follow-up review template instead');
    });

    test('#13910: workflow lint requires Premise Coherence for canonical reviews', async () => {
        const bodyWithoutPremiseCoherence = VALID_REVIEW_BODY
            .replace('* **Premise Coherence:** coheres: a substrate validator fix; flat-peer-team / facilitator-not-delegator unaffected.\n', '');

        const result = await runAgentPrReviewBodyLintWorkflow({
            body: bodyWithoutPremiseCoherence
        });

        expect(result.failures).toEqual([
            'Agent review body missing required template anchors. See follow-up comment on PR #13910.'
        ]);
        expect(result.comments).toHaveLength(1);
        expect(result.comments[0].body).toContain('Agent PR Review Body Lint Violation');
        expect(result.comments[0].body).toContain('Premise Coherence');
        expect(result.comments[0].body).toContain('all four premise fields');
    });

    test('#14263: accepts a Micro-Review (blast-scaled light shape) — micro PRs are not gauntletted', async () => {
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14263,
            state    : 'APPROVED',
            body     : VALID_MICRO_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#14263: rejects a Micro-Review missing the Class blast-assertion (anti-backdoor)', async () => {
        // Drop the micro|contained token from the Class line — the light path must not be a backdoor
        // for an intense PR. Fail-safe-toward-accept applies to the TIER choice, not the class gate.
        const noClassBody = VALID_MICRO_REVIEW_BODY
            .replace('**Class:** micro — a one-line doc typo fix', '**Class:** a one-line doc typo fix');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => { graphqlCallCount++; return {repository: {pullRequest: {id: PR_NODE_ID}}}; };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 14263,
            state    : 'APPROVED',
            body     : noClassBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_micro_review).toContain('Class: micro | contained (the blast-class assertion)');
        expect(result.message).toContain('no architectural concept to teach'); // the graph-ingestion gate keeps the concept-graph fed
        expect(graphqlCallCount).toBe(0);
    });

    test('#13547: rejects old plain-heading follow-up review skeleton', async () => {
        const plainFollowupBody = VALID_FOLLOWUP_REVIEW_BODY
            .replaceAll('### 🧭 Patch-Blind Premise Snapshot', '### Patch-Blind Premise Snapshot')
            .replaceAll('### 🪜 Strategic-Fit Decision', '### Strategic-Fit Decision')
            .replaceAll('### ⚓ Prior Review Anchor', '### Prior Review Anchor')
            .replaceAll('### 🔁 Delta Scope', '### Delta Scope')
            .replaceAll('### ✅ Previous Required Actions Audit', '### Previous Required Actions Audit')
            .replaceAll('### 🔬 Delta Depth Floor', '### Delta Depth Floor')
            .replaceAll('### 📊 Metrics Delta', '### Metrics Delta')
            .replaceAll('### 📋 Required Actions', '### Required Actions');

        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 13547,
            state    : 'APPROVED',
            body     : plainFollowupBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual([]);
        expect(graphqlCallCount).toBe(0);
    });

    test('#11491: rejects body missing some visible anchors and names ONE diagnostic anchor only', async () => {
        // Operator-directed change: even when visible anchors are missing, the error names AT MOST
        // one diagnostic anchor rather than the full list, reducing the "stuff just these tags"
        // attack surface. The `missing_visible` field still carries the full list for programmatic
        // callers, but the human-facing message names only the first as a hint.
        const partialBody = [
            'My substantive review prose here.',
            '### 🪜 Strategic-Fit Decision',
            '### 🔬 Depth Floor',
            '### 📋 Required Actions',
            '[ARCH_ALIGNMENT]: 75',
            '[CONTENT_COMPLETENESS]: 75',
            '[EXECUTION_QUALITY]: 75',
            '[PRODUCTIVITY]: 75'
            // Missing: [IMPACT], [COMPLEXITY], [EFFORT_PROFILE]
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : partialBody
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        // Programmatic surface preserves the full list for callers that want it.
        expect(result.missing_visible).toEqual(['[IMPACT]', '[COMPLEXITY]', '[EFFORT_PROFILE]']);
        // Human-facing message names ONE diagnostic only — the first miss.
        expect(result.message).toContain('[IMPACT]');
        // Other missing visible anchors are NOT enumerated in the message (anti-stuffing).
        expect(result.message).not.toContain('[COMPLEXITY]');
        expect(result.message).not.toContain('[EFFORT_PROFILE]');
    });

    test('#11491: accepts body with all visible AND invisible anchors present, proceeds to GraphQL dispatch', async () => {
        // Smoke test that the two-layer validator does NOT block well-formed reviews — the
        // depth-floor gate is permissive once both visible + invisible anchors are present;
        // quality remains the peer-V-B-A reviewer's responsibility.
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : VALID_REVIEW_BODY
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        // Two GraphQL queries: GetPullRequestId + AddPullRequestReview
        expect(graphqlCallCount).toBe(2);
    });

    test('#12448: accepts a complete required premise snapshot (all four fields)', async () => {
        // The premise snapshot is REQUIRED: a body carrying all four bold-label fields passes
        // (here via VALID_REVIEW_BODY, which now includes the Premise Coherence field).
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const body = [
            '### Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '* **Expected Solution Shape:** optional validator recognition without hard enforcement.',
            '* **Patch Verdict:** matches expected optional-first migration.',
            '',
            VALID_REVIEW_BODY
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#12448: rejects partial premise snapshot without making a GitHub call', async () => {
        // All four premise fields are now REQUIRED. A partial snapshot (here: only Inputs Read
        // Before Patch) is the exact back-rationalization theater the required gate is meant to expose.
        let graphqlCallCount = 0;
        GraphqlService.query = async () => {
            graphqlCallCount++;
            return {repository: {pullRequest: {id: PR_NODE_ID}}};
        };

        const body = [
            '# PR Review Summary',
            '',
            '**Status:** Approved',
            '',
            '### 🪜 Strategic-Fit Decision',
            '- Decision: Approve',
            '',
            '### 🧭 Patch-Blind Premise Snapshot',
            '* **Inputs Read Before Patch:** ticket, changed-file list, current dev source.',
            '',
            '### 🕸️ Context & Graph Linking',
            '* **Target Epic / Issue ID:** Resolves #12448',
            '',
            '### 🔬 Depth Floor',
            '- Documented search: scanned all relevant surfaces.',
            '',
            '### 🧠 Graph Ingestion Notes',
            '* **`[KB_GAP]`**: N/A.',
            '* **`[TOOLING_GAP]`**: N/A.',
            '* **`[RETROSPECTIVE]`**: Partial snapshot fixture.',
            '',
            '### 📋 Required Actions',
            'No required actions — eligible for human merge.',
            '',
            '### 📊 Evaluation Metrics',
            '[ARCH_ALIGNMENT]: 80 - structural fit',
            '[CONTENT_COMPLETENESS]: 80 - covers AC matrix',
            '[EXECUTION_QUALITY]: 80 - tests pass',
            '[PRODUCTIVITY]: 70 - bounded scope',
            '[IMPACT]: 60 - localized substrate fix',
            '[COMPLEXITY]: 40 - mechanical change',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.code).toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
        expect(result.missing_visible).toEqual([]);
        expect(result.missing_premise_snapshot).toEqual(['Expected Solution Shape', 'Patch Verdict', 'Premise Coherence']);
        expect(result.message).toContain('Premise snapshot note');
        expect(graphqlCallCount).toBe(0);
    });

    test('#12448: ignores incidental premise-snapshot prose without making it partial', async () => {
        // Bare phrases in review prose must not activate the optional snapshot contract; only the
        // distinctive bold template labels should require the full three-field snapshot.
        let graphqlCallCount = 0;
        GraphqlService.query = async (queryString) => {
            graphqlCallCount++;
            if (queryString.includes('GetPullRequestId')) return {repository: {pullRequest: {id: PR_NODE_ID}}};
            if (queryString.includes('AddPullRequestReview')) return {addPullRequestReview: {pullRequestReview: REVIEW_NODE}};
            return null;
        };

        const body = [
            'The Patch Verdict from the prior cycle still stands.',
            '',
            VALID_REVIEW_BODY
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 12448,
            state    : 'APPROVED',
            body
        });

        expect(result.error).toBeUndefined();
        expect(result.reviewId).toBe('PRR_kwDOABcD1111111111');
        expect(graphqlCallCount).toBe(2);
    });

    test('#11491: invisible-anchor enforcement is NOT discoverable from the error response', async () => {
        // Surface contract: the invisible-anchor strings MUST NOT appear in the error response
        // body (neither `message` prose nor programmatic field). Discovery from outside requires
        // reading the validator source — which is the intended safeguard.
        const stuffedBody = [
            'Approval granted.',
            '[ARCH_ALIGNMENT]: 100',
            '[CONTENT_COMPLETENESS]: 100',
            '[EXECUTION_QUALITY]: 100',
            '[PRODUCTIVITY]: 100',
            '[IMPACT]: 80',
            '[COMPLEXITY]: 20',
            '[EFFORT_PROFILE]: Quick Win'
        ].join('\n');

        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED',
            body     : stuffedBody
        });

        // Serialize the entire response and assert NONE of the invisible anchor substrings appear.
        // Reading these strings from the test source is OK; the production response must not.
        const responseJson = JSON.stringify(result);
        expect(responseJson).not.toContain('Depth Floor');
        expect(responseJson).not.toContain('Required Actions');
        expect(responseJson).not.toContain('Strategic-Fit Decision');
        // A `missing_invisible` field would leak the safeguard surface — must NOT exist.
        expect(result.missing_invisible).toBeUndefined();
    });

    test('#11491: action-check precedence preserved — invalid action returns INVALID_ARGUMENTS even with missing-anchor body', async () => {
        // Existing test on line ~488 covers the action-check; this one explicitly pins the
        // precedence ordering: action-validation must fire BEFORE body-validation so callers
        // get the more specific error first.
        const result = await PullRequestService.managePrReview({
            action: 'submit', // invalid
            body  : 'no anchors here'
        });

        expect(result.code).toBe('INVALID_ARGUMENTS');
        expect(result.code).not.toBe('PR_REVIEW_TEMPLATE_VALIDATION_FAILED');
    });

    test('#11491: missing-body check precedence preserved — undefined body returns MISSING_ARGUMENTS not validation error', async () => {
        // Body-presence check must fire BEFORE body-shape validation so the error names the
        // more fundamental gap (`body is required`) rather than emitting a 7-anchor missing
        // list against an empty body.
        const result = await PullRequestService.managePrReview({
            action   : 'create',
            pr_number: 11491,
            state    : 'APPROVED'
            // body intentionally omitted
        });

        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(result.message).toContain("'body' is required");
    });
});
