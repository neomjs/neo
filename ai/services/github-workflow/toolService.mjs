import {execFile}         from 'child_process';
import path               from 'path';
import {fileURLToPath}    from 'url';
import {promisify}        from 'util';
import AgentStateService  from './AgentStateService.mjs';
import HealthService      from './HealthService.mjs';
import IssueService       from './IssueService.mjs';
import DiscussionService  from './DiscussionService.mjs';
import LabelService       from './LabelService.mjs';
import LocalFileService   from './LocalFileService.mjs';
import PullRequestService from './PullRequestService.mjs';
import RepositoryService  from './RepositoryService.mjs';
import ToolService        from '../../mcp/ToolService.mjs';
import SyncService        from './SyncService.mjs';
import config             from '../../mcp/server/github-workflow/config.mjs';

const execFileAsync   = promisify(execFile);
const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../../mcp/server/github-workflow/openapi.yaml');

/**
 * #11145 — Default branch detector. Exec's `git branch --show-current` against the MCP
 * server's projectRoot. Returns the trimmed branch name (or empty string on detached HEAD).
 * Throws on git execution failure.
 *
 * @returns {Promise<String>} current branch name, '' for detached HEAD.
 */
async function defaultBranchDetector() {
    const {stdout} = await execFileAsync('git', ['branch', '--show-current'], {cwd: config.projectRoot});
    return stdout.trim();
}

/**
 * #11145 — Wraps a SyncService method with a dev-branch-only guard at the tool boundary.
 *
 * Why tool-boundary, not library: `SyncService` callers include the daemon path
 * (Orchestrator's PrimaryRepoSyncService, scheduled context, spawned in canonical-on-dev)
 * and build-scripts (`buildScripts/release/publish.mjs`, build-context). Both are legit.
 * Only the agent-callable MCP tool surface needs rejection — that's the violation vector.
 *
 * Description-as-policy on the OpenAPI tool was empirically insufficient: 5+/day @neo-
 * gemini-3-1-pro violations + the 2026-05-10 PR #11143 stale-branch + chore-sync race.
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

const serviceMapping = {
    checkout_pull_request    : PullRequestService.checkoutPullRequest    .bind(PullRequestService),
    create_discussion        : DiscussionService .createDiscussion       .bind(DiscussionService),
    create_issue             : IssueService      .createIssue            .bind(IssueService),
    get_conversation         : PullRequestService.getConversation        .bind(PullRequestService),
    get_local_issue_by_id    : LocalFileService  .getIssueById           .bind(LocalFileService),
    get_pull_request_diff    : PullRequestService.getPullRequestDiff     .bind(PullRequestService),
    get_viewer_permission    : RepositoryService .getViewerPermission    .bind(RepositoryService),
    healthcheck              : HealthService     .healthcheck            .bind(HealthService),
    list_labels              : LabelService      .listLabels             .bind(LabelService),
    list_pull_requests       : PullRequestService.listPullRequests       .bind(PullRequestService),
    list_issues              : IssueService      .listIssues             .bind(IssueService),
    manage_discussion_comment: DiscussionService .manageDiscussionComment.bind(DiscussionService),
    manage_issue_assignees   : IssueService      .manageIssueAssignees   .bind(IssueService),
    manage_issue_comment     : IssueService      .manageIssueComment     .bind(IssueService),
    manage_issue_labels      : IssueService      .manageIssueLabels      .bind(IssueService),
    manage_pr_reviewers      : PullRequestService.managePrReviewers      .bind(PullRequestService),
    signal_state_transition  : AgentStateService .signalStateTransition  .bind(AgentStateService),
    sync_all                 : syncAllOnDevOnly,
    update_issue_relationship: IssueService      .updateIssueRelationship.bind(IssueService)
};

// Exported for unit-test access (#11145). `buildDevBranchGuard` accepts injected
// `delegate` + `getBranch` for fixture-driven testing without spawning real `git`.
export {buildDevBranchGuard, syncAllOnDevOnly, defaultBranchDetector};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
