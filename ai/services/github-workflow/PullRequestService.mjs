import {exec, execFile}                        from 'child_process';
import {promisify}                             from 'util';
import Base                                    from '../../../src/core/Base.mjs';
import GraphqlService                          from './GraphqlService.mjs';
import aiConfig                                from '../../mcp/server/github-workflow/config.mjs';
import logger                                  from '../../mcp/server/github-workflow/logger.mjs';
import {
    ADD_PULL_REQUEST_REVIEW,
    GET_PULL_REQUEST_ID,
    UPDATE_PULL_REQUEST_REVIEW
}                                              from './queries/mutations.mjs';
import {FETCH_PULL_REQUESTS, GET_CONVERSATION} from './queries/pullRequestQueries.mjs';

const execAsync     = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Required template-anchor substrings every formal PR review body MUST contain (#11491).
 *
 * These are the 7 evaluation-metric tags from `.agents/skills/pr-review/assets/pr-review-template.md`
 * (cycle-1) and `.agents/skills/pr-review/assets/pr-review-followup-template.md` (cycle-N). They are
 * also the regex parse keys that `ai/daemons/services/ConceptDiscoveryService.mjs` consumes during
 * Retrospective-daemon REM-sleep graph ingestion — a malformed review with hallucinated metric
 * names produces zero graph ingest signal and is silently lost from the Native Edge Graph.
 *
 * This is the **depth-floor mechanical enforcement** layer; quality of the content under each
 * anchor remains the peer-V-B-A reviewer's responsibility. Goodhart anchor-stuffing risk is
 * accepted residual — see #11491 ticket body for the failure-mode shift rationale.
 *
 * Cycle-followup templates use the same 7 metric tags (`pr-review-followup-template.md:96-102`)
 * so this set applies to both cycle-1 and cycle-N reviews without false-positive separation.
 *
 * Extension protocol: if the pr-review skill adds a new evaluation metric, append the literal
 * `[NEW_TAG]` string here AND update both template files in the same PR. The CI grep-fail check
 * in PR #11406/#11490 family can serve as a sibling enforcement pattern for the template-side
 * consistency (out-of-scope for #11491).
 */
const REQUIRED_PR_REVIEW_ANCHORS = [
    '[ARCH_ALIGNMENT]',
    '[CONTENT_COMPLETENESS]',
    '[EXECUTION_QUALITY]',
    '[PRODUCTIVITY]',
    '[IMPACT]',
    '[COMPLEXITY]',
    '[EFFORT_PROFILE]'
];

/**
 * @summary Service for interacting with GitHub Pull Requests via the `gh` CLI and GraphQL API.
 *
 * This service acts as a unified interface for Pull Request operations.
 * It combines the `gh` CLI (for operations like `checkout` and `diff`) with
 * the GraphQL API (for metadata retrieval, listing, and conversation history)
 * to provide a comprehensive toolset for managing PRs.
 *
 * @class Neo.ai.services.github-workflow.PullRequestService
 * @extends Neo.core.Base
 * @singleton
 */
class PullRequestService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.PullRequestService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.PullRequestService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Checks out a specific pull request locally.
     * @param {number} prNumber The number of the pull request to check out
     * @returns {Promise<object>} A promise that resolves to a success message or a structured error.
     */
    async checkoutPullRequest(prNumber) {
        try {
            const {stdout} = await execAsync(`gh pr checkout ${prNumber}`, {cwd: aiConfig.projectRoot});
            return {message: `Successfully checked out PR #${prNumber}`, details: stdout.trim()};
        } catch (error) {
            logger.error(`Error checking out PR #${prNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr checkout ${prNumber} failed with exit code ${error.code}`,
                code   : 'GH_CLI_ERROR'
            };
        }
    }

    /**
     * Gets the conversation for a specific pull request, optionally filtered by comment
     * selector to reduce context-fetch cost across review cycles (#10272 §2.2).
     *
     * **Default behavior (no selectors):** returns full conversation — backward compatible
     * with the pre-#10272 shape that callers depend on.
     *
     * **Selectors (first-match precedence, pick at most one):**
     * - `comment_id` — fetch ONLY the comment whose GitHub node ID matches. Used for A2A
     *   hand-off: a reviewer posts a comment, mailboxes the `commentId` from the create-path
     *   return shape to the peer, peer fetches just-this-comment for near-zero context cost.
     * - `since_comment_id` — fetch all comments AFTER the one with the given ID (exclusive).
     *   Used for incremental review cycles: agent tracks the last seen commentId and fetches
     *   only what's new. Scales linearly with new-comment volume, not cumulative thread size.
     * - `last_n` — fetch the last N comments. Coarse-grained alternative when comment IDs
     *   aren't tracked. Useful for quick catch-up scans.
     *
     * Selectors are applied client-side after a single GraphQL fetch (the fetch itself already
     * caps at `aiConfig.pullRequest.maxCommentsPerPullRequest`). Server-side pagination
     * optimization is a follow-up concern if empirical volume demands it; for current
     * conversation sizes (up to a few dozen comments) client-side filter is simpler and
     * avoids multi-query cursor choreography.
     *
     * @param {Object|number} options Either a number (legacy `prNumber` positional form, retained for
     *                                backward compat) or an object with the shape below.
     * @param {number}        options.pr_number         The pull request number (required when object form).
     * @param {string}        [options.comment_id]      Return only the matching comment's data; other
     *                                                  comments elided. PR title/body still returned.
     * @param {string}        [options.since_comment_id] Return comments strictly after the matching
     *                                                  comment (by createdAt order). If the id isn't found,
     *                                                  returns empty comments (callers can interpret as
     *                                                  "nothing new" or "id invalid").
     * @param {number}        [options.last_n]          Return only the last N comments (by createdAt order).
     * @returns {Promise<object>} Conversation data (optionally filtered) or a structured error.
     */
    async getConversation(options) {
        // Accept legacy positional `prNumber` form for backward compatibility with any
        // caller predating #10272. New callers use the object form for filter support.
        const {pr_number, comment_id, since_comment_id, last_n} = typeof options === 'number'
            ? {pr_number: options}
            : (options || {});

        if (!pr_number) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'pr_number' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        const variables = {
            owner      : aiConfig.owner,
            repo       : aiConfig.repo,
            prNumber   : pr_number,
            maxComments: aiConfig.pullRequest.maxCommentsPerPullRequest
        };

        try {
            const data         = await GraphqlService.query(GET_CONVERSATION, variables);
            const pullRequest  = data.repository.pullRequest;
            const allComments  = pullRequest.comments?.nodes || [];

            // Selector precedence: comment_id > since_comment_id > last_n > full.
            let filtered;

            if (comment_id) {
                filtered = allComments.filter(c => c.id === comment_id);
            } else if (since_comment_id) {
                const anchorIdx = allComments.findIndex(c => c.id === since_comment_id);
                // Anchor not found → empty result set (callers interpret as "nothing after" or
                // "invalid id"). Trying to infer intent would hide bugs.
                filtered = anchorIdx === -1 ? [] : allComments.slice(anchorIdx + 1);
            } else if (typeof last_n === 'number' && last_n > 0) {
                filtered = allComments.slice(-last_n);
            } else {
                // No selector — return full conversation shape unchanged (backward compat).
                return pullRequest;
            }

            // Filtered paths preserve PR title/body/author; only comments are narrowed.
            // Caller can detect filtering via comments.length vs unfiltered fetch.
            return {
                ...pullRequest,
                comments: {
                    ...pullRequest.comments,
                    nodes: filtered
                }
            };
        } catch (error) {
            logger.error(`Error getting conversation for PR #${pr_number} via GraphQL:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * Gets the diff for a specific pull request.
     * @param {Object|number} options Either a PR number or an object with parameters
     * @param {number}  options.pr_number  The number of the pull request
     * @param {string}  [options.file]     Optional file path (or comma-separated paths) to filter diff
     * @param {string}  [options.sha]      Optional SHA to diff against instead of live PR head
     * @param {boolean} [options.files_only] If true, return structured JSON with path/additions/deletions
     * @returns {Promise<string|object>} A promise that resolves to the diff text, file list JSON, or a structured error.
     */
    async getPullRequestDiff(options) {
        const { pr_number, file, sha, files_only } = typeof options === 'number' || typeof options === 'string'
            ? { pr_number: parseInt(options, 10) }
            : (options || {});

        const prNumber = parseInt(pr_number, 10);

        if (isNaN(prNumber)) {
            return {
                error  : 'Bad Request',
                message: "Missing or invalid required argument: 'pr_number'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        try {
            if (files_only) {
                const {stdout} = await execFileAsync('gh', ['pr', 'view', String(prNumber), '--json', 'files'], {cwd: aiConfig.projectRoot});
                const parsed = JSON.parse(stdout);
                return { files: parsed.files || [] };
            }

            let diffStdout = '';

            if (sha) {
                if (!file) {
                    return {
                        error  : 'Bad Request',
                        message: "The 'sha' parameter requires the 'file' parameter to be provided.",
                        code   : 'INVALID_ARGUMENTS'
                    };
                }
                
                if (!/^[0-9a-f]{4,40}$/i.test(sha)) {
                    return {
                        error  : 'Bad Request',
                        message: "The 'sha' parameter must be a valid git object hash (4-40 hex characters).",
                        code   : 'INVALID_ARGUMENTS'
                    };
                }

                const {stdout: baseStdout} = await execFileAsync('gh', ['pr', 'view', String(prNumber), '--json', 'baseRefOid'], {cwd: aiConfig.projectRoot});
                const baseRefOid = JSON.parse(baseStdout).baseRefOid;
                
                const filePaths = file.split(',').map(f => f.trim());
                const {stdout} = await execFileAsync('git', ['diff', `${baseRefOid}...${sha}`, '--', ...filePaths], {cwd: aiConfig.projectRoot});
                diffStdout = stdout;
            } else {
                const {stdout} = await execFileAsync('gh', ['pr', 'diff', String(prNumber)], {cwd: aiConfig.projectRoot});
                diffStdout = stdout;
            }

            if (file) {
                if (sha) {
                    return { result: diffStdout };
                }

                const fileList = file.split(',').map(f => f.trim());
                const lines = diffStdout.split('\n');
                const resultLines = [];
                let capturing = false;

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('diff --git ')) {
                        const parts = line.split(' b/');
                        if (parts.length >= 2) {
                            const aPath = parts[0].replace('diff --git a/', '');
                            const bPath = parts.slice(1).join(' b/');
                            if (fileList.includes(bPath) || fileList.includes(aPath)) {
                                capturing = true;
                                resultLines.push(line);
                                continue;
                            }
                        }
                        capturing = false;
                    } else if (capturing) {
                        resultLines.push(line);
                    }
                }
                
                return { result: resultLines.join('\n') };
            }

            return { result: diffStdout };

        } catch (error) {
            logger.error(`Error getting diff for PR #${prNumber}:`, error);

            if (error.stderr && (error.stderr.includes('bad object') || error.stderr.includes('unknown revision') || error.stderr.includes('Invalid symmetric difference expression'))) {
                return {
                    error  : 'SHA not found',
                    message: `The provided SHA could not be found in the repository: ${error.message}`,
                    code   : 'SHA_NOT_FOUND',
                    details: error.stderr
                };
            }

            return {
                error  : 'GitHub CLI command failed',
                message: `Failed to retrieve diff for PR #${prNumber}: ${error.message}`,
                code   : 'GH_CLI_ERROR',
                details: error.stderr || error.message
            };
        }
    }

    /**
     * Fetches a list of pull requests from GitHub.
     * @param {object} [options]                                           The options for listing pull requests
     * @param {number} [options.limit=aiConfig.pullRequest.defaults.limit] The maximum number of PRs to return
     * @param {string} [options.state=aiConfig.pullRequest.defaults.state] The state of the pull requests to list (open, closed, merged, all)
     * @returns {Promise<object>} A promise that resolves to the list of pull requests or a structured error.
     */
    async listPullRequests({limit=aiConfig.pullRequest.defaults.limit, state=aiConfig.pullRequest.defaults.state} = {}) {

        const variables = {
            owner : aiConfig.owner,
            repo  : aiConfig.repo,
            limit,
            states: state.toUpperCase()
        };

        try {
            const data = await GraphqlService.query(FETCH_PULL_REQUESTS, variables);
            const pullRequests = data.repository.pullRequests.nodes;
            return {
                count: pullRequests.length,
                pullRequests
            };
        } catch (error) {
            logger.error('Error fetching pull requests via GraphQL:', error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Atomic create or update of a formal GitHub pull request review (#11273).
     *
     * Closes the empirically-recurring formal-state gap pattern (PR #11234 + PR #11271
     * empirical anchors): agents post substantive review prose via `manage_issue_comment`
     * but forget the second `gh pr review --approve | --request-changes` step to flip
     * GitHub's `reviewDecision` surface, blocking the cross-family review mandate gate
     * per `pull-request §6.1`. This tool routes through the `addPullRequestReview`
     * GraphQL mutation — single call posts the review body AND transitions formal state
     * atomically.
     *
     * **Action: 'create'** — requires `pr_number`, `state`, `body`. Resolves PR node ID,
     * submits review with the given event.
     *
     * **Action: 'update'** — requires `review_id`, `body`. Updates the review's body
     * only; GitHub does not allow changing a submitted review's state via this mutation
     * (dismiss + resubmit is the path, deliberately out of v1 scope).
     *
     * **state → event mapping** (caller surface uses the friendlier `state` enum;
     * the GraphQL mutation requires `PullRequestReviewEvent`):
     *   - `APPROVED`        → `APPROVE`
     *   - `REQUEST_CHANGES` → `REQUEST_CHANGES`
     *   - `COMMENT`         → `COMMENT`
     *
     * @param {Object} options
     * @param {String} options.action           Either `'create'` or `'update'`.
     * @param {Number} [options.pr_number]      The pull request number (required for `create`).
     * @param {String} [options.state]          Review state (required for `create`): `APPROVED` | `REQUEST_CHANGES` | `COMMENT`.
     * @param {String} options.body             The review body.
     * @param {String} [options.review_id]      The GraphQL node ID of the existing review (required for `update`; PRR_*).
     * @returns {Promise<Object>} Review payload on success (`{message, reviewId, state, url, submittedAt, databaseId?}`) or structured error.
     *
     * @see #11273 (Atomic PR review create via dedicated github-workflow MCP tool)
     * @see Discussion #11239 (graduation source; substrate-author = @neo-gemini-3-1-pro)
     */
    async managePrReview({action, pr_number, state, body, review_id}) {
        if (!['create', 'update'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'create' or 'update'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        if (!body) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument: 'body' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        // Tool-boundary mechanical body-shape validation (#11491).
        // PR #11479 added a description-prose MANDATORY pre-step pointing to the pr-review SKILL.md;
        // this gate promotes that discipline-only guard to a mechanical floor. Bad data never lands
        // on GitHub or reaches the Retrospective daemon. See REQUIRED_PR_REVIEW_ANCHORS docstring
        // for the residual Goodhart-stuffing trade-off rationale.
        const missingAnchors = REQUIRED_PR_REVIEW_ANCHORS.filter(anchor => !body.includes(anchor));
        if (missingAnchors.length > 0) {
            return {
                error   : 'PR Review Template Validation Failed',
                message : `Review body is missing required template anchors: ${missingAnchors.join(', ')}. Read .agents/skills/pr-review/assets/pr-review-template.md (cycle-1) or pr-review-followup-template.md (cycle-N) before submitting — the 7 evaluation-metric tags are the wire-format contract with the Retrospective-daemon graph ingestor.`,
                code    : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
                missing : missingAnchors,
                skill   : '.agents/skills/pr-review/SKILL.md',
                template: '.agents/skills/pr-review/assets/pr-review-template.md'
            };
        }

        if (action === 'create') {
            if (typeof pr_number !== 'number') {
                return {
                    error  : 'Bad Request',
                    message: "Missing required argument for 'create': 'pr_number' (number).",
                    code   : 'MISSING_ARGUMENTS'
                };
            }

            const stateToEvent = {
                APPROVED       : 'APPROVE',
                REQUEST_CHANGES: 'REQUEST_CHANGES',
                COMMENT        : 'COMMENT'
            };

            const event = stateToEvent[state];

            if (!event) {
                return {
                    error  : 'Bad Request',
                    message: `Invalid state '${state}'. Must be one of: ${Object.keys(stateToEvent).join(', ')}.`,
                    code   : 'INVALID_ARGUMENTS'
                };
            }

            try {
                const idData = await GraphqlService.query(GET_PULL_REQUEST_ID, {
                    owner   : aiConfig.owner,
                    repo    : aiConfig.repo,
                    prNumber: pr_number
                });
                const pullRequestId = idData?.repository?.pullRequest?.id;

                if (!pullRequestId) {
                    return {
                        error  : 'Not Found',
                        message: `Pull request #${pr_number} not found or returned no id.`,
                        code   : 'PR_NOT_FOUND'
                    };
                }

                const reviewData = await GraphqlService.query(ADD_PULL_REQUEST_REVIEW, {
                    pullRequestId,
                    body,
                    event
                });

                const review = reviewData?.addPullRequestReview?.pullRequestReview;

                if (!review) {
                    return {
                        error  : 'GraphQL API request failed',
                        message: 'addPullRequestReview returned no pullRequestReview node.',
                        code   : 'GRAPHQL_API_ERROR'
                    };
                }

                return {
                    message    : `Successfully created ${review.state} review on PR #${pr_number}`,
                    reviewId   : review.id,
                    state      : review.state,
                    url        : review.url,
                    submittedAt: review.submittedAt,
                    databaseId : review.databaseId
                };
            } catch (error) {
                logger.error(`Error creating PR review on PR #${pr_number}:`, error);
                return {
                    error  : 'GraphQL API request failed',
                    message: error.message,
                    code   : 'GRAPHQL_API_ERROR'
                };
            }
        }

        // action === 'update'
        if (!review_id) {
            return {
                error  : 'Bad Request',
                message: "Missing required argument for 'update': 'review_id' (the GraphQL node ID of the existing review).",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            const updateData = await GraphqlService.query(UPDATE_PULL_REQUEST_REVIEW, {
                pullRequestReviewId: review_id,
                body
            });

            const review = updateData?.updatePullRequestReview?.pullRequestReview;

            if (!review) {
                return {
                    error  : 'GraphQL API request failed',
                    message: 'updatePullRequestReview returned no pullRequestReview node.',
                    code   : 'GRAPHQL_API_ERROR'
                };
            }

            return {
                message    : `Successfully updated review ${review.id}`,
                reviewId   : review.id,
                state      : review.state,
                url        : review.url,
                submittedAt: review.submittedAt
            };
        } catch (error) {
            logger.error(`Error updating PR review ${review_id}:`, error);
            return {
                error  : 'GraphQL API request failed',
                message: error.message,
                code   : 'GRAPHQL_API_ERROR'
            };
        }
    }

    /**
     * @summary Unified add/remove of GitHub PR reviewer-requests via the `gh pr edit` CLI.
     *
     * Sibling to `IssueService.manageIssueAssignees` for PR reviewer invitations — closes the
     * **invitation layer** of the cross-family review mandate (`pull-request §6.1`). The mandate
     * itself is the validation layer (Approved-status before merge); this tool is the active
     * invitation primitive that pairs with it. Without invitation, reviewers learn about PRs
     * needing review via passive notification polling — the latency this tool closes.
     *
     * Surfaces GitHub's `requested_reviewers` API (`POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`,
     * mirrored as `gh pr edit <pr-number> --add-reviewer <login>` / `--remove-reviewer <login>`).
     * Permission errors are surfaced via the underlying `gh` CLI's exit code rather than a
     * pre-flight check — keeps the service-internal logic decoupled from `RepositoryService`'s
     * permission cache while preserving end-to-end error visibility.
     *
     * @param {object}    options
     * @param {number}    options.pr_number          The number of the pull request.
     * @param {string[]}  [options.reviewers]        Array of GitHub user logins to add or remove as reviewers.
     * @param {string[]}  [options.team_reviewers]   Array of team slugs (without owner prefix). The owner is auto-prepended via `aiConfig.owner`.
     * @param {string}    options.action             Either `'add'` or `'remove'`.
     * @returns {Promise<object>} Success message + reviewer payload on success, or structured error.
     *
     * @see #10217 / Sub 3 of Epic #10214
     * @see pull-request-workflow.md §6.1 (cross-family mandate — invitation layer cross-reference)
     */
    async managePrReviewers({pr_number, reviewers, team_reviewers, action}) {
        if (!['add', 'remove'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'add' or 'remove'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        const reviewerList     = reviewers || [];
        const teamReviewerList = team_reviewers || [];

        if (reviewerList.length === 0 && teamReviewerList.length === 0) {
            return {
                error  : 'Bad Request',
                message: "At least one entry in 'reviewers' or 'team_reviewers' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            const flagName        = action === 'add' ? '--add-reviewer' : '--remove-reviewer';
            const reviewerFlags   = reviewerList.map(r => `${flagName} "${r}"`).join(' ');
            // Team-reviewer syntax in `gh pr edit` requires the OWNER/team-slug form.
            const teamFlags       = teamReviewerList.map(t => `${flagName} "${aiConfig.owner}/${t}"`).join(' ');
            const allFlags        = [reviewerFlags, teamFlags].filter(Boolean).join(' ');
            const allTargets      = [...reviewerList, ...teamReviewerList.map(t => `${aiConfig.owner}/${t}`)];

            const command = `gh pr edit ${pr_number} ${allFlags} --repo ${aiConfig.owner}/${aiConfig.repo}`;
            logger.info(`Attempting to ${action} reviewers on PR #${pr_number}: ${allTargets.join(', ')}`);

            await execAsync(command, {cwd: aiConfig.projectRoot});

            const verb = action === 'add' ? 'requested' : 'removed';
            return {
                message       : `Successfully ${verb} reviewers on PR #${pr_number}: ${allTargets.join(', ')}`,
                pr_number,
                reviewers     : reviewerList,
                team_reviewers: teamReviewerList
            };
        } catch (error) {
            logger.error(`Error managing reviewers on PR #${pr_number}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `Failed to ${action} reviewers on PR #${pr_number}: ${error.message}`,
                code   : 'GH_CLI_ERROR',
                details: error.stderr || error.message
            };
        }
    }
}

export default Neo.setupClass(PullRequestService);
