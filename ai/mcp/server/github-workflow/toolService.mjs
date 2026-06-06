import {execFile}         from 'child_process';
import path               from 'path';
import {fileURLToPath}    from 'url';
import {promisify}        from 'util';
import AgentStateService  from '../../../services/github-workflow/AgentStateService.mjs';
import HealthService      from '../../../services/github-workflow/HealthService.mjs';
import IssueService       from '../../../services/github-workflow/IssueService.mjs';
import DiscussionService  from '../../../services/github-workflow/DiscussionService.mjs';
import LabelService       from '../../../services/github-workflow/LabelService.mjs';
import LocalFileService   from '../../../services/github-workflow/LocalFileService.mjs';
import PullRequestService from '../../../services/github-workflow/PullRequestService.mjs';
import RepositoryService  from '../../../services/github-workflow/RepositoryService.mjs';
import ToolService        from '../../ToolService.mjs';
import SyncService        from '../../../services/github-workflow/SyncService.mjs';
import config             from './config.mjs';

const execFileAsync   = promisify(execFile);
const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

/**
 * Default branch detector. Exec's `git branch --show-current` against the MCP
 * server's projectRoot. Returns the trimmed branch name (or empty string on detached HEAD).
 * Throws on git execution failure.
 *
 * @returns {Promise<String>} current branch name, '' for detached HEAD.
 */
async function defaultBranchDetector() {
    let toplevel;
    try {
        const {stdout} = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {cwd: config.projectRoot});
        toplevel = stdout.trim();
    } catch (e) {
        throw new Error(`sync_all REJECTED: could not resolve git top-level (git error: ${e.message}).`);
    }

    const normalizedProjectRoot = path.resolve(config.projectRoot);
    const normalizedToplevel = path.resolve(toplevel);

    if (normalizedProjectRoot !== normalizedToplevel) {
        throw new Error(
            `sync_all REJECTED: Root mismatch. MCP server projectRoot '${normalizedProjectRoot}' ` +
            `does not match git repository top-level '${normalizedToplevel}'. ` +
            `This prevents cross-checkout branch diagnostics and context leakage.`
        );
    }

    const {stdout} = await execFileAsync('git', ['branch', '--show-current'], {cwd: config.projectRoot});
    return stdout.trim();
}

/**
 * Wraps a SyncService method with a dev-branch-only guard at the tool boundary.
 *
 * Why tool-boundary, not library: `SyncService` callers include the daemon path
 * (Orchestrator's PrimaryRepoSyncService, scheduled context, spawned in canonical-on-dev)
 * and build-scripts (`buildScripts/release/publish.mjs`, build-context). Both are legit.
 * Only the agent-callable MCP tool surface needs rejection — that's the violation vector.
 *
 * Description-as-policy on the OpenAPI tool was empirically insufficient: repeated off-dev
 * sync attempts showed that the tool boundary needs executable branch enforcement.
 *
 * Branch-detector is injectable for testability; default uses `git branch --show-current`.
 *
 * @param {Function} delegate           The SyncService method to invoke when on dev.
 * @param {Function} [getBranch]        Branch-detector; default exec's git.
 * @returns {Function} wrapped variadic async function.
 */
function buildDevBranchGuard(delegate, getBranch = defaultBranchDetector) {
    return async function syncAllOnDevOnly(...args) {
        let branch;
        try {
            branch = await getBranch();
        } catch (e) {
            if (e.message && e.message.startsWith('sync_all REJECTED:')) {
                throw e;
            }
            throw new Error(`sync_all REJECTED: could not determine current branch (git error: ${e.message}). Refusing to sync without branch confirmation.`);
        }
        if (branch !== 'dev') {
            throw new Error(
                `sync_all REJECTED: working-tree is on branch '${branch || '(detached)'}', not 'dev'. ` +
                `sync_all writes to resources/content/{issues,pull-requests,discussions}/ which would pollute the non-dev branch. ` +
                `Switch to 'dev' to sync, or invoke sync via daemon (PrimaryRepoSyncService runs on schedule and is spawned in a canonical-on-dev context).`
            );
        }
        return delegate(...args);
    };
}

const syncAllOnDevOnly = buildDevBranchGuard(SyncService.runFullSync.bind(SyncService));

/**
 * `get_conversation` dispatch router. The tool serves BOTH pull requests and
 * issues; it routes to the matching service by which identifier the caller supplied.
 * Rejects ambiguous (both ids) and empty (neither id) argument shapes with structured
 * errors so the failure is legible rather than a downstream null-deref.
 *
 * Exported for unit-test access, mirroring the `buildDevBranchGuard` /
 * `syncAllOnDevOnly` test-surface precedent below.
 *
 * @param {Object|Number} options `pr_number` XOR `issue_number`, plus optional selectors.
 *                                A bare number is the backward-compatible positional PR form.
 * @returns {Promise<Object>} Conversation data or a structured error.
 */
async function getConversationRouter(options) {
    // Backward-compatible positional number form is always a pull request.
    if (typeof options === 'number') {
        return PullRequestService.getConversation(options);
    }

    const {pr_number, issue_number} = options || {};

    if (pr_number && issue_number) {
        return {
            error  : 'Bad Request',
            message: "Provide exactly one of 'pr_number' or 'issue_number', not both.",
            code   : 'AMBIGUOUS_ARGUMENTS'
        };
    }

    if (issue_number) {
        return IssueService.getConversation(options);
    }

    if (pr_number) {
        return PullRequestService.getConversation(options);
    }

    return {
        error  : 'Bad Request',
        message: "Missing required argument: provide 'pr_number' or 'issue_number'.",
        code   : 'MISSING_ARGUMENTS'
    };
}

const serviceMapping = {
    checkout_pull_request      : PullRequestService.checkoutPullRequest    .bind(PullRequestService),
    create_discussion          : DiscussionService .createDiscussion       .bind(DiscussionService),
    create_issue               : IssueService      .createIssue            .bind(IssueService),
    get_conversation           : getConversationRouter,
    get_discussion_conversation: DiscussionService .getConversation        .bind(DiscussionService),
    get_local_issue_by_id      : LocalFileService  .getIssueById           .bind(LocalFileService),
    get_pull_request_diff      : PullRequestService.getPullRequestDiff     .bind(PullRequestService),
    get_viewer_permission      : RepositoryService .getViewerPermission    .bind(RepositoryService),
    healthcheck                : HealthService     .healthcheck            .bind(HealthService),
    list_labels                : LabelService      .listLabels             .bind(LabelService),
    list_pull_requests         : PullRequestService.listPullRequests       .bind(PullRequestService),
    list_issues                : IssueService      .listIssues             .bind(IssueService),
    manage_discussion          : DiscussionService .manageDiscussion       .bind(DiscussionService),
    manage_discussion_comment  : DiscussionService .manageDiscussionComment.bind(DiscussionService),
    manage_issue_assignees     : IssueService      .manageIssueAssignees   .bind(IssueService),
    manage_issue_comment       : IssueService      .manageIssueComment     .bind(IssueService),
    manage_issue_labels        : IssueService      .manageIssueLabels      .bind(IssueService),
    manage_issue_projects      : IssueService      .manageIssueProjects    .bind(IssueService),
    manage_pr_review           : PullRequestService.managePrReview         .bind(PullRequestService),
    manage_pr_reviewers        : PullRequestService.managePrReviewers      .bind(PullRequestService),
    signal_state_transition    : AgentStateService .signalStateTransition  .bind(AgentStateService),
    sync_all                   : syncAllOnDevOnly,
    update_issue_relationship  : IssueService      .updateIssueRelationship.bind(IssueService)
};

// Exported for unit-test access. `buildDevBranchGuard` accepts injected
// `delegate` + `getBranch` for fixture-driven testing without spawning real `git`.
export {buildDevBranchGuard, getConversationRouter, syncAllOnDevOnly};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
