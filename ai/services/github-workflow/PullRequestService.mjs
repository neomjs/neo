import {exec, execFile} from 'child_process';
import path             from 'path';
import {promisify}      from 'util';
import Base             from '../../../src/core/Base.mjs';
import GraphqlService   from './GraphqlService.mjs';
import aiConfig         from '../../mcp/server/github-workflow/config.mjs';
import logger           from '../../mcp/server/github-workflow/logger.mjs';
import {
    ADD_PULL_REQUEST_REVIEW,
    GET_PULL_REQUEST_ID,
    UPDATE_PULL_REQUEST_REVIEW
}                                              from './queries/mutations.mjs';
import {FETCH_PULL_REQUESTS, GET_CONVERSATION} from './queries/pullRequestQueries.mjs';
import {projectConversationTrust}              from './shared/conversationTrust.mjs';

const execAsync     = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * **Visible** template-anchor substrings — checked AND named in the error response on miss.
 *
 * These are the 7 evaluation-metric tags from `.agents/skills/pr-review/assets/pr-review-template.md`
 * (cycle-1) and `.agents/skills/pr-review/assets/pr-review-followup-template.md` (cycle-N). They are
 * also the regex parse keys that `ai/services/ingestion/ConceptDiscoveryService.mjs` consumes during
 * Retrospective-daemon REM-sleep graph ingestion — a malformed review with hallucinated metric
 * names produces zero graph ingest signal and is silently lost from the Native Edge Graph.
 *
 * Cycle-followup templates use the same 7 metric tags, so this set applies to both cycle-1
 * and cycle-N reviews without false-positive separation.
 *
 * Extension protocol: if the pr-review skill adds a new evaluation metric, append the literal
 * `[NEW_TAG]` string here AND update both template files in the same PR.
 */
const VISIBLE_PR_REVIEW_ANCHORS = [
    '[ARCH_ALIGNMENT]',
    '[CONTENT_COMPLETENESS]',
    '[EXECUTION_QUALITY]',
    '[PRODUCTIVITY]',
    '[IMPACT]',
    '[COMPLEXITY]',
    '[EFFORT_PROFILE]'
];

/**
 * **Invisible** template-anchor substrings — checked SILENTLY; NOT named in the error response
 * on miss. Defeats Goodhart anchor-stuffing while preserving useful diagnostics for visible misses.
 *
 * **Failure-mode the invisible layer prevents**:
 * A sophisticated agent receives the visible-list error, hallucinates a body that contains
 * exactly the named visible anchors but omits the actual template structure (e.g., bare
 * `### Strategic-Fit` heading without `Decision`, `### Metrics` without proper structure).
 * Visible-only validation passes the malformed body. The invisible layer catches this by
 * checking structural anchors that span both cycle-1 and cycle-followup templates.
 *
 * **Observed failure mode**: a malformed review can contain all visible metric tags while missing
 * `Depth Floor`, `Required Actions`, and `Strategic-Fit Decision` structure. These 3 substrings
 * empirically distinguish a structurally-correct review from a metric-tag-stuffed hallucination.
 *
 * **Why these specific substrings**:
 * - `Depth Floor` — cycle-1 has `🔬 Depth Floor`, cycle-followup has `Delta Depth Floor`. Both contain the substring.
 * - `Required Actions` — both cycle-1 (`📋 Required Actions`) and cycle-followup carry the literal heading.
 * - `Strategic-Fit Decision` — cycle-1 (`🪜 Strategic-Fit Decision`) and cycle-followup (`Strategic-Fit Decision`)
 *   both include the word `Decision`. Hallucinated headings that drop `Decision` fail this check.
 *
 * **Asymmetry that makes this work**:
 * - Author who reads `.agents/skills/pr-review/SKILL.md` and follows the template → all checks pass
 * - Author who hallucinates from the visible-list error → fails invisible check, retries
 * - Author who enumerates `## ` headings to anchor-stuff → fails because the invisible substrings
 *   require specific phrasing (e.g., `Decision` postfix on `Strategic-Fit`) that's hard to guess
 *   without reading the actual template
 *
 * **Discoverability vs. invisibility tension**: this list IS the substrate; future maintainers
 * editing this constant must understand the invisibility rationale. Hence this docstring. The
 * list is NOT documented in error responses, public README, or skill-file enumerations — only
 * here in the validator's source, where modification requires explicit awareness.
 *
 * **Maintenance protocol**: if the pr-review template adds or renames a structural section,
 * update this array to point at substrings that still distinguish valid from invalid bodies.
 * Tests in `PullRequestService.spec.mjs` assert behavior without naming invisible anchors in
 * prose; they import this constant by reference.
 */
const INVISIBLE_PR_REVIEW_ANCHORS = [
    'Depth Floor',
    'Required Actions',
    'Strategic-Fit Decision'
];

/**
 * REQUIRED premise-snapshot anchors — every agent PR review must carry all four. The fourth,
 * **Premise Coherence**, forces the value-coherence verdict ("does this PR's premise cohere with our
 * core values?") that fit-shape review skips — a green checklist over a wrong premise is theater.
 * The forcing-function raises the floor by forcing ARTICULATION, not depth: the field is satisfied
 * by a specific verdict ("coheres: lead stays facilitator-not-delegator" / "conflicts: adds
 * surveillance vs flat-peer-team") OR a scoped "N/A — no value-surface (scope: ...)" for a trivial
 * PR with no value-surface (the marginal-value skip). Match the distinctive bold template labels,
 * not bare prose, so incidental phrases do not satisfy the gate.
 */
const REQUIRED_PR_REVIEW_PREMISE_ANCHORS = [
    {label: 'Inputs Read Before Patch',  token: '**Inputs Read Before Patch:**'},
    {label: 'Expected Solution Shape',   token: '**Expected Solution Shape:**'},
    {label: 'Patch Verdict',             token: '**Patch Verdict:**'},
    {label: 'Premise Coherence',         token: '**Premise Coherence:**'}
];

const FOLLOWUP_PR_REVIEW_SHAPE_HINTS = [
    '# PR Review Follow-Up Summary',
    '**Cycle:**',
    '### ⚓ Prior Review Anchor',
    '### 🔁 Delta Scope',
    '### Prior Review Anchor',
    '### Delta Scope',
    '### ✅ Previous Required Actions Audit',
    '### Previous Required Actions Audit',
    '### 🔬 Delta Depth Floor',
    '### Delta Depth Floor',
    '### 📊 Metrics Delta',
    '### Metrics Delta'
];

const MICRO_DELTA_PR_REVIEW_SHAPE_HINTS = [
    '# Pull Request Micro-Delta Review',
    '### State Vector',
    '### Micro-Delta Focus',
    '### Verdict'
];

const FULL_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS = [
    '# PR Review Summary',
    '### 🪜 Strategic-Fit Decision',
    '### 🧭 Patch-Blind Premise Snapshot',
    '### 🕸️ Context & Graph Linking',
    '### 🔬 Depth Floor',
    '### 🧠 Graph Ingestion Notes',
    '### 📋 Required Actions',
    '### 📊 Evaluation Metrics'
];

const FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS = [
    '# PR Review Follow-Up Summary',
    '**Cycle:**',
    '### 🧭 Patch-Blind Premise Snapshot',
    '### 🪜 Strategic-Fit Decision',
    '### ⚓ Prior Review Anchor',
    '### 🔁 Delta Scope',
    '### ✅ Previous Required Actions Audit',
    '### 🔬 Delta Depth Floor',
    '### 📊 Metrics Delta',
    '### 📋 Required Actions'
];

const MICRO_DELTA_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS = [
    '# Pull Request Micro-Delta Review',
    '> **Context:**',
    '### State Vector',
    '- **Target SHA:**',
    '- **Current reviewDecision:**',
    '- **Semantic Status:**',
    '- **CI Status:**',
    '- **Remaining Blocker Class:**',
    '- **Measured Discussion Cost:**',
    '### Micro-Delta Focus',
    '*Only defects classified as `mechanical-hygiene` or `metadata-drift` are reviewed here.*',
    '### Verdict',
    '**APPROVED**',
    '**CHANGES_REQUESTED**',
    '**MAINTAINER POLISH FAST PATH APPLIED**'
];

const MICRO_DELTA_REVIEW_BLOCKER_CLASS_PATTERN = /(?:^|[^\w-])(mechanical-hygiene|metadata-drift)(?:$|[^\w-])/i;

/**
 * @summary Returns missing cycle-template skeleton anchors for review-body validation.
 *
 * The broad visible/invisible anchor layers catch metric and structural omissions. This
 * layer catches skeleton-fidelity regressions: review bodies that carry semantic anchors,
 * but rename/drop the selected template's canonical icon-bearing scaffold.
 *
 * @param {String} body The candidate PR review body.
 * @returns {String[]} Missing skeleton anchors, intentionally never exposed to callers.
 */
function getPrReviewTemplateSkeletonMisses(body) {
    const hasFollowupShape = FOLLOWUP_PR_REVIEW_SHAPE_HINTS.some(anchor => body.includes(anchor));

    if (hasFollowupShape) {
        return FOLLOWUP_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS.filter(anchor => !body.includes(anchor));
    }

    return FULL_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS.filter(anchor => !body.includes(anchor));
}

/**
 * @summary Returns `true` when a review body selects the Micro-Delta template.
 *
 * The Micro-Delta path is intentionally separate from full/follow-up review shapes: it is
 * documented by the review-loop cost circuit breaker, not the normal pr-review templates,
 * and carries a narrower state-vector contract instead of the full graph metric block.
 *
 * @param {String} body The candidate PR review body.
 * @returns {Boolean} Whether the body appears to be a Micro-Delta review.
 */
function isMicroDeltaPrReview(body) {
    return body.includes(MICRO_DELTA_PR_REVIEW_SHAPE_HINTS[0]) || (
        body.includes('### State Vector') &&
        body.includes('### Micro-Delta Focus')
    );
}

/**
 * @summary Returns missing documented Micro-Delta anchors.
 *
 * Micro-Delta reviews are only valid for review-loop cost-compression state (a), where
 * semantics are already cleared and the remaining issue class is mechanical hygiene or
 * metadata drift. The blocker-class token check prevents the short format from becoming
 * a backdoor for semantic review shortcuts.
 *
 * @param {String} body The candidate Micro-Delta PR review body.
 * @returns {String[]} Missing Micro-Delta anchors or state constraints.
 */
function getMicroDeltaPrReviewTemplateMisses(body) {
    const misses = MICRO_DELTA_PR_REVIEW_TEMPLATE_SKELETON_ANCHORS
        .filter(anchor => !body.includes(anchor));

    const remainingBlockerLine = body
        .split('\n')
        .find(line => line.includes('- **Remaining Blocker Class:**')) || '';

    if (!MICRO_DELTA_REVIEW_BLOCKER_CLASS_PATTERN.test(remainingBlockerLine)) {
        misses.push('Remaining Blocker Class: mechanical-hygiene | metadata-drift');
    }

    return misses;
}

/**
 * @summary Returns a structured validation failure for malformed Micro-Delta review bodies.
 *
 * @param {String} body The candidate Micro-Delta PR review body.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getMicroDeltaPrReviewTemplateValidationFailure(body) {
    const missingMicroDelta = getMicroDeltaPrReviewTemplateMisses(body);

    if (missingMicroDelta.length === 0) {
        return null;
    }

    const skillPath      = '.agents/skills/pr-review/SKILL.md';
    const circuitPath    = '.agents/skills/pr-review/audits/review-cost-circuit-breaker.md';
    const microDeltaPath = '.agents/skills/pr-review/assets/pr-review-micro-delta-template.md';

    const message = [
        `Review body attempts the Micro-Delta Review format but does not match the documented circuit-breaker structure.`,
        ``,
        `**Required action**: read \`${skillPath}\`, \`${circuitPath}\`, and \`${microDeltaPath}\` BEFORE retrying.`,
        ``,
        `Micro-Delta reviews are only valid after the Review-Loop Cost Circuit Breaker`,
        `classifies the PR as state (a): semantics cleared, with only mechanical-hygiene`,
        `or metadata-drift remaining. If a semantic or contract delta exists, use the`,
        `full follow-up review template instead.`,
        ``,
        `Diagnostic hint: at least one required Micro-Delta state-vector or verdict anchor from \`${microDeltaPath}\` is missing or invalid.`
    ].join('\n');

    return {
        error              : 'PR Review Template Validation Failed',
        message,
        code               : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
        missing_micro_delta: missingMicroDelta,
        skill              : skillPath,
        circuitBreaker     : circuitPath,
        template           : microDeltaPath
    };
}

/**
 * @summary Returns a structured validation failure for malformed full/follow-up review bodies.
 *
 * @param {String} body The candidate PR review body.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getCanonicalPrReviewTemplateValidationFailure(body) {
    const missingVisible          = VISIBLE_PR_REVIEW_ANCHORS          .filter(anchor => !body.includes(anchor));
    const missingInvisible        = INVISIBLE_PR_REVIEW_ANCHORS        .filter(anchor => !body.includes(anchor));
    const missingTemplateSkeleton = getPrReviewTemplateSkeletonMisses(body);
    const missingPremiseSnapshot  = REQUIRED_PR_REVIEW_PREMISE_ANCHORS
        .filter(anchor => !body.includes(anchor.token))
        .map(anchor => anchor.label);

    if (
        missingVisible.length === 0          &&
        missingInvisible.length === 0        &&
        missingTemplateSkeleton.length === 0 &&
        missingPremiseSnapshot.length === 0
    ) {
        return null;
    }

    // Compose a message that guides toward the skill without enumerating invisible anchors.
    // Even the visible-list naming is bounded — at most ONE diagnostic example, not the
    // full list — to reduce the "stuff just these tags" attack surface further.
    const diagnosticAnchor = missingVisible[0] ?? missingPremiseSnapshot[0] ?? null;

    const skillPath    = '.agents/skills/pr-review/SKILL.md';
    const templatePath = '.agents/skills/pr-review/assets/pr-review-template.md';
    const followupPath = '.agents/skills/pr-review/assets/pr-review-followup-template.md';

    const message = [
        `Review body does not match the pr-review template structure.`,
        ``,
        `**Required action**: read \`${skillPath}\` BEFORE retrying. The skill points at:`,
        `  - Cycle 1 (full template): \`${templatePath}\``,
        `  - Cycle N (follow-up template): \`${followupPath}\``,
        ``,
        `Do NOT compose a substitute template or hallucinate section headings. The validator`,
        `checks more structural anchors than this error names. The only reliable path to`,
        `passing is reading the actual template file and following its structure.`,
        missingPremiseSnapshot.length > 0
            ? `\nPremise snapshot note: all four premise fields (incl. **Premise Coherence:**) are REQUIRED. The value-coherence field takes a specific verdict ("coheres: ..." / "conflicts: ...") OR a scoped "N/A — no value-surface (scope: ...)" for a trivial PR.`
            : ``,
        diagnosticAnchor
            ? `\nDiagnostic hint: at least one recognized anchor like \`${diagnosticAnchor}\` is missing.`
            : `\nDiagnostic hint: visible metric tags appear present but the structural template anchors do not.`
    ].join('\n');

    return {
        error: 'PR Review Template Validation Failed',
        message,
        code : 'PR_REVIEW_TEMPLATE_VALIDATION_FAILED',
        // `missing_visible` lists the named-in-message visible misses. Invisible misses
        // are intentionally NOT enumerated in the response body — even programmatic
        // callers should be nudged toward the skill rather than the anchor list.
        missing_visible         : missingVisible,
        missing_premise_snapshot: missingPremiseSnapshot,
        skill                   : skillPath,
        template                : templatePath
    };
}

/**
 * @summary Returns the selected review-template validation failure, if any.
 *
 * @param {String} body The candidate PR review body.
 * @returns {Object|null} Validation failure payload or `null` when valid.
 */
function getPrReviewTemplateValidationFailure(body) {
    return isMicroDeltaPrReview(body)
        ? getMicroDeltaPrReviewTemplateValidationFailure(body)
        : getCanonicalPrReviewTemplateValidationFailure(body);
}

function normalizeCheckoutOptions(options) {
    if (typeof options === 'number') {
        return {pr_number: options};
    }

    return options || {};
}

/**
 * @summary Builds the guarded `checkout_pull_request` executor.
 *
 * The MCP transport does not carry the caller's current working directory, so the
 * checkout path must be explicit. The returned executor refuses caller-unknown
 * mutations, verifies the supplied path is the git top-level, performs checkout
 * there, and reads back git state for reviewer-side V-B-A.
 *
 * @param {Object}   [options]
 * @param {Function} [options.execFileFn] Injectable command runner for unit tests.
 * @param {String}   [options.projectRoot] Server process repo root used only for refusal diagnostics.
 * @param {Object}   [options.log] Logger with an `error()` method.
 * @returns {Function} Guarded checkout function.
 */
function buildCheckoutPullRequest({
    execFileFn = execFileAsync,
    projectRoot = aiConfig.projectRoot,
    log = logger
} = {}) {
    return async function checkoutPullRequest(options) {
        const {pr_number, repoPath} = normalizeCheckoutOptions(options);
        const prNumber = Number(pr_number);

        if (!Number.isInteger(prNumber) || prNumber <= 0) {
            return {
                error  : 'Bad Request',
                message: "Missing or invalid required argument: 'pr_number' must be a positive integer.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        const serverRepoPath = path.resolve(projectRoot);

        if (!repoPath) {
            return {
                error  : 'Unsafe checkout refused',
                message: [
                    '`checkout_pull_request` cannot infer the caller workspace over shared MCP transport. ',
                    'Pass `repoPath` equal to the caller workspace git root, or run `gh pr checkout` manually in that workspace.'
                ].join(''),
                code    : 'CALLER_WORKSPACE_REQUIRED',
                repoPath: serverRepoPath
            };
        }

        const normalizedRepoPath = path.resolve(repoPath);
        let gitTopLevel;

        try {
            const {stdout} = await execFileFn('git', ['rev-parse', '--show-toplevel'], {cwd: normalizedRepoPath});
            gitTopLevel = path.resolve(stdout.trim());
        } catch (error) {
            log.error(`Error resolving git top-level for checkout_pull_request repoPath '${normalizedRepoPath}':`, error);
            return {
                error  : 'Invalid repoPath',
                message: `repoPath '${normalizedRepoPath}' is not a readable git worktree root.`,
                code    : 'INVALID_REPO_PATH',
                repoPath: normalizedRepoPath,
                details : error.stderr || error.message
            };
        }

        if (gitTopLevel !== normalizedRepoPath) {
            return {
                error  : 'Unsafe checkout refused',
                message: [
                    `repoPath '${normalizedRepoPath}' resolves to git top-level '${gitTopLevel}'. `,
                    'Pass the git top-level explicitly so the checkout target is unambiguous.'
                ].join(''),
                code    : 'REPO_PATH_NOT_GIT_ROOT',
                repoPath: normalizedRepoPath,
                gitTopLevel
            };
        }

        try {
            const {stdout}       = await execFileFn('gh', ['pr', 'checkout', String(prNumber)], {cwd: gitTopLevel});
            const branchResult  = await execFileFn('git', ['branch', '--show-current'], {cwd: gitTopLevel});
            const headShaResult = await execFileFn('git', ['rev-parse', 'HEAD'], {cwd: gitTopLevel});
            const branch        = branchResult.stdout.trim();
            const headSha       = headShaResult.stdout.trim();

            return {
                message: `Successfully checked out PR #${prNumber}`,
                details : stdout.trim(),
                repoPath: gitTopLevel,
                branch,
                headSha
            };
        } catch (error) {
            log.error(`Error checking out PR #${prNumber}:`, error);
            return {
                error  : 'GitHub CLI command failed',
                message: `gh pr checkout ${prNumber} failed with exit code ${error.code}`,
                code    : 'GH_CLI_ERROR',
                repoPath: gitTopLevel,
                details : error.stderr || error.message
            };
        }
    };
}

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
     * Checks out a pull request into an explicitly supplied caller workspace.
     *
     * @param {Object|Number} options Object form `{pr_number, repoPath}` or legacy
     *                                positional PR number. Legacy numeric form now
     *                                refuses until a caller workspace is explicit.
     * @returns {Promise<object>} Structured checkout state or an explicit refusal/error.
     */
    async checkoutPullRequest(options) {
        return buildCheckoutPullRequest()(options);
    }

    /**
     * Gets the conversation for a specific pull request, optionally filtered by comment
     * selector to reduce context-fetch cost across review cycles.
     *
     * **Default behavior (no selectors):** returns full conversation — backward compatible
     * with the default full-conversation shape that existing callers depend on.
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
     * @param {Object|number} options Either a number (backward-compatible `prNumber` positional form)
     *                                or an object with the shape below.
     * @param {number}        options.pr_number         The pull request number (required when object form).
     * @param {string}        [options.comment_id]      Return only the matching comment's data; other
     *                                                  comments elided. PR title/body still returned.
     * @param {string}        [options.since_comment_id] Return comments strictly after the matching
     *                                                  comment (by createdAt order). If the id isn't found,
     *                                                  returns empty comments (callers can interpret as
     *                                                  "nothing new" or "id invalid").
     * @param {number}        [options.last_n]          Return only the last N comments (by createdAt order).
     * @returns {Promise<object>} Conversation data (optionally filtered) or a structured error. Payloads
     *          are trust-projected: authored nodes carry `authorTrust`, untrusted-author bodies arrive
     *          defanged, and the root carries a `contentTrust` summary (see `shared/conversationTrust.mjs`).
     */
    async getConversation(options) {
        // Accept positional `prNumber` form for backward compatibility.
        // New callers use the object form for filter support.
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
            const data = await GraphqlService.query(GET_CONVERSATION, variables);
            // Trust-project at the read boundary: every authored node gains `authorTrust`,
            // untrusted-author bodies are defanged, the root carries a `contentTrust` summary.
            // Applied before selector filtering so all return paths inherit projected nodes.
            const pullRequest = projectConversationTrust(data.repository.pullRequest);
            const allComments = pullRequest.comments?.nodes || [];

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

                const fileList    = file.split(',').map(f => f.trim());
                const lines       = diffStdout.split('\n');
                const resultLines = [];
                let   capturing   = false;

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
            const data         = await GraphqlService.query(FETCH_PULL_REQUESTS, variables);
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
     * @summary Atomic create or update of a formal GitHub pull request review.
     *
     * Closes the empirically-recurring formal-state gap pattern: agents post substantive review prose via `manage_issue_comment`
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
     * @see Neo.ai.services.github-workflow.queries.mutations.ADD_PULL_REQUEST_REVIEW
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

        const templateValidationFailure = getPrReviewTemplateValidationFailure(body);

        if (templateValidationFailure) {
            return templateValidationFailure;
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
     * @summary Unified add/remove of GitHub PR reviewer-requests via the REST `requested_reviewers` endpoint.
     *
     * Sibling to `IssueService.manageIssueAssignees` for PR reviewer invitations — closes the
     * **invitation layer** of the cross-family review mandate (`pull-request §6.1`). The mandate
     * itself is the validation layer (Approved-status before merge); this tool is the active
     * invitation primitive that pairs with it. Without invitation, reviewers learn about PRs
     * needing review via passive notification polling — the latency this tool closes.
     *
     * Calls GitHub's `requested_reviewers` REST endpoint directly (`POST` to add / `DELETE` to remove,
     * on `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`) — it needs only the `repo`
     * scope. The prior `gh pr edit --add/remove-reviewer` path resolved logins via GraphQL, which
     * requires `read:org` (a scope agent tokens routinely lack), so it failed for every agent on that
     * credential class. Permission errors still surface via the `gh` exit code.
     *
     * @param {object}    options
     * @param {number}    options.pr_number          The number of the pull request.
     * @param {string[]}  [options.reviewers]        Array of GitHub user logins to add or remove as reviewers.
     * @param {string[]}  [options.team_reviewers]   Array of bare team slugs (no owner prefix — the REST endpoint takes slugs directly).
     * @param {string}    options.action             Either `'add'` or `'remove'`.
     * @returns {Promise<object>} Success message + reviewer payload on success, or structured error.
     *
     * @see pull-request-workflow.md §6.1 (cross-family mandate — invitation layer cross-reference)
     */
    async managePrReviewers({pr_number, reviewers, team_reviewers, action}, {execFn = execAsync} = {}) {
        if (!['add', 'remove'].includes(action)) {
            return {
                error  : 'Bad Request',
                message: "Invalid action. Must be 'add' or 'remove'.",
                code   : 'INVALID_ARGUMENTS'
            };
        }

        // Logins/slugs may arrive with a leading `@`; the REST body wants bare values.
        const reviewerList     = (reviewers || []).map(r => r.replace(/^@/, ''));
        const teamReviewerList = (team_reviewers || []).map(t => t.replace(/^@/, ''));

        if (reviewerList.length === 0 && teamReviewerList.length === 0) {
            return {
                error  : 'Bad Request',
                message: "At least one entry in 'reviewers' or 'team_reviewers' is required.",
                code   : 'MISSING_ARGUMENTS'
            };
        }

        try {
            // Use the REST `requested_reviewers` endpoint rather than `gh pr edit --add/remove-reviewer`:
            // the CLI resolves logins via GraphQL, which requires the `read:org` scope that agent tokens
            // routinely lack (they carry `repo`/`project`/`user`/etc. but not `read:org`), so the CLI path
            // fails for every agent on that credential class. REST needs only `repo`. Request body:
            // `reviewers[]` (user logins) + `team_reviewers[]` (bare team slugs — REST takes the slug, not
            // the `owner/slug` form `gh pr edit` requires).
            const method = action === 'add' ? 'POST' : 'DELETE';
            const reviewerFlags = reviewerList.map(r => `-f 'reviewers[]=${r}'`).join(' ');
            const teamFlags     = teamReviewerList.map(t => `-f 'team_reviewers[]=${t}'`).join(' ');
            const allFlags   = [reviewerFlags, teamFlags].filter(Boolean).join(' ');
            const allTargets = [...reviewerList, ...teamReviewerList];

            const command = `gh api repos/${aiConfig.owner}/${aiConfig.repo}/pulls/${pr_number}/requested_reviewers -X ${method} ${allFlags}`;
            logger.info(`Attempting to ${action} reviewers on PR #${pr_number} via REST: ${allTargets.join(', ')}`);

            await execFn(command, {cwd: aiConfig.projectRoot});

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
                error  : 'GitHub API request failed',
                message: `Failed to ${action} reviewers on PR #${pr_number}: ${error.message} (REST requested_reviewers needs only the repo scope)`,
                code   : 'GH_API_ERROR',
                details: error.stderr || error.message
            };
        }
    }
}

const PullRequestServiceSingleton = Neo.setupClass(PullRequestService);

export {buildCheckoutPullRequest};
export default PullRequestServiceSingleton;
