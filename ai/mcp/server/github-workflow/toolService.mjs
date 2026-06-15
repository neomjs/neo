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
import {assertExpectedIdentity as assertExpectedGitHubIdentity, IdentityAssertionCode} from '../../../graph/assertExpectedIdentity.mjs';
import RequestContextService from '../shared/services/RequestContextService.mjs';
import config             from './config.mjs';

const execFileAsync   = promisify(execFile);
const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

const PUBLIC_GITHUB_WRITE_ACCESS     = 'public-write';
const NON_PUBLIC_GITHUB_WRITE_ACCESS = 'non-public-write';
const GITHUB_TOOL_ACCESS_TYPES       = Object.freeze(new Set([
    PUBLIC_GITHUB_WRITE_ACCESS,
    NON_PUBLIC_GITHUB_WRITE_ACCESS
]));

/**
 * @summary Canonical access classification for every GitHub Workflow MCP tool.
 *
 * `public-write` tools can mutate github.com state and therefore must pass the
 * GitHub write identity guard. `non-public-write` tools may read remote state or
 * mutate only the caller-local workspace. Keeping every `serviceMapping` key in
 * this policy turns future tool additions into an explicit classification step.
 */
const GITHUB_TOOL_ACCESS = Object.freeze({
    checkout_pull_request      : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    create_discussion          : PUBLIC_GITHUB_WRITE_ACCESS,
    create_issue               : PUBLIC_GITHUB_WRITE_ACCESS,
    get_conversation           : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    get_discussion_conversation: NON_PUBLIC_GITHUB_WRITE_ACCESS,
    get_local_issue_by_id      : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    get_pull_request_diff      : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    get_viewer_permission      : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    healthcheck                : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    list_issues                : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    list_labels                : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    list_pull_requests         : NON_PUBLIC_GITHUB_WRITE_ACCESS,
    manage_discussion          : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_discussion_comment  : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_issue_assignees     : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_issue_comment       : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_issue_labels        : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_issue_projects      : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_pr_review           : PUBLIC_GITHUB_WRITE_ACCESS,
    manage_pr_reviewers        : PUBLIC_GITHUB_WRITE_ACCESS,
    signal_state_transition    : PUBLIC_GITHUB_WRITE_ACCESS,
    sync_all                   : PUBLIC_GITHUB_WRITE_ACCESS,
    update_issue_relationship  : PUBLIC_GITHUB_WRITE_ACCESS
});

const PUBLIC_GITHUB_WRITE_TOOLS = Object.freeze(new Set(
    Object.entries(GITHUB_TOOL_ACCESS)
        .filter(([, access]) => access === PUBLIC_GITHUB_WRITE_ACCESS)
        .map(([toolName]) => toolName)
));

function getMissingGitHubToolAccessClassifications(mapping, accessPolicy = GITHUB_TOOL_ACCESS) {
    return Object.keys(mapping).filter(toolName => !Object.hasOwn(accessPolicy, toolName));
}

function getInvalidGitHubToolAccessClassifications(accessPolicy = GITHUB_TOOL_ACCESS) {
    return Object.entries(accessPolicy)
        .filter(([, access]) => !GITHUB_TOOL_ACCESS_TYPES.has(access))
        .map(([toolName]) => toolName);
}

/**
 * @summary Fails closed when a service-mapped tool lacks an access classification.
 * @param {Object} mapping Operation id to handler function.
 * @param {Object} [accessPolicy] Tool access policy keyed by operation id.
 * @returns {Boolean} True when every mapped tool is classified.
 */
function assertNoUnclassifiedGitHubTools(mapping, accessPolicy = GITHUB_TOOL_ACCESS) {
    const missing = getMissingGitHubToolAccessClassifications(mapping, accessPolicy);
    const invalid = getInvalidGitHubToolAccessClassifications(accessPolicy);

    if (missing.length || invalid.length) {
        throw new Error([
            'GitHub tool access policy incomplete.',
            missing.length ? `Missing classification: ${missing.sort().join(', ')}` : null,
            invalid.length ? `Invalid classification: ${invalid.sort().join(', ')}` : null
        ].filter(Boolean).join(' '));
    }

    return true;
}

/**
 * @summary Verifies the canonical policy and runtime service mapping stay in lockstep.
 * @param {Object} mapping Operation id to handler function.
 * @param {Object} [accessPolicy] Tool access policy keyed by operation id.
 * @returns {Boolean} True when mapping and policy cover the same operation ids.
 */
function assertCompleteGitHubToolAccessPolicy(mapping, accessPolicy = GITHUB_TOOL_ACCESS) {
    assertNoUnclassifiedGitHubTools(mapping, accessPolicy);

    const stale = Object.keys(accessPolicy).filter(toolName => !Object.hasOwn(mapping, toolName));

    if (stale.length) {
        throw new Error(`GitHub tool access policy has stale classification: ${stale.sort().join(', ')}`);
    }

    return true;
}

/**
 * @summary Normalizes AgentIdentity-style and GitHub-login-style strings to a GitHub login.
 * @param {String|null|undefined} identity AgentIdentity node id or GitHub login.
 * @returns {String|null} Normalized login, or null when no non-empty identity exists.
 */
function normalizeGitHubIdentityLogin(identity) {
    if (identity == null) {
        return null;
    }

    const trimmed = String(identity).trim();

    if (!trimmed) {
        return null;
    }

    return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

/**
 * @summary Maps the shared assertion's stable {@link IdentityAssertionCode} into a write-boundary
 * error code. Keys on the machine `code`, not the human-readable `reason` prose (which is free to
 * reword); an unknown or absent code falls back to the generic assertion-failed code.
 * @param {String} code The shared assertion's `code`.
 * @returns {String}
 */
function getGitHubIdentityErrorCode(code) {
    switch (code) {
        case IdentityAssertionCode.EXPECTED_UNMAPPABLE:
            return 'GITHUB_IDENTITY_UNRESOLVED';
        case IdentityAssertionCode.NO_AUTHED_LOGIN:
            return 'GITHUB_VIEWER_UNRESOLVED';
        case IdentityAssertionCode.MEMORY_CORE_MISMATCH:
            return 'GITHUB_MEMORY_CORE_IDENTITY_MISMATCH';
        case IdentityAssertionCode.LOGIN_MISMATCH:
            return 'GITHUB_IDENTITY_MISMATCH';
        default:
            return 'GITHUB_IDENTITY_ASSERTION_FAILED';
    }
}

/**
 * @summary Builds a structured identity guard error for GitHub write-boundary failures.
 * @param {Object} assertion Shared identity assertion failure payload.
 * @returns {Error}
 */
function createGitHubIdentityError(assertion) {
    const message = assertion.reason || 'GitHub identity assertion failed.';
    const error   = new Error(`GitHub write rejected: ${message}`);

    Object.assign(error, {
        ...assertion,
        code: getGitHubIdentityErrorCode(assertion.code)
    });

    return error;
}

/**
 * @summary Resolves the effective GitHub viewer login for the current process credentials.
 * @returns {Promise<String|null>} Effective viewer login or null on failure.
 */
async function resolveGitHubViewerLogin() {
    try {
        const {stdout} = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], {
            cwd    : config.projectRoot,
            timeout: 1500
        });

        return normalizeGitHubIdentityLogin(stdout);
    } catch (error) {
        return null;
    }
}

/**
 * @summary Runs the shared GitHub identity assertion from this server's request context.
 * @returns {Promise<Object>}
 */
async function defaultGitHubIdentityAssertion() {
    const memoryCoreIdentity = RequestContextService.getAgentIdentityNodeId() ||
        RequestContextService.getUserId();

    return assertExpectedGitHubIdentity({
        expected: process.env.NEO_AGENT_IDENTITY ||
            RequestContextService.getAgentIdentityNodeId() ||
            RequestContextService.getUserId(),
        actualLogin: await resolveGitHubViewerLogin(),
        memoryCoreIdentity
    });
}

/**
 * @summary Wraps a public GitHub write with fail-closed identity-drift validation.
 *
 * The delegate is never invoked unless the expected agent identity and effective
 * GitHub API viewer login match. The assertion seam is injectable so tests do
 * not perform live GitHub calls.
 *
 * @param {Function} delegate The mutating GitHub tool handler.
 * @param {Object} [options]
 * @param {Function} [options.assertExpectedIdentity] Shared identity assertion seam.
 * @returns {Function} Guarded async tool handler.
 */
function buildGitHubWriteIdentityGuard(delegate, {
    assertExpectedIdentity = defaultGitHubIdentityAssertion
} = {}) {
    return async function githubWriteIdentityGuard(...args) {
        const assertion = await assertExpectedIdentity();

        if (!assertion.ok) {
            throw createGitHubIdentityError(assertion);
        }

        return delegate(...args);
    };
}

/**
 * @summary Returns true for MCP tools that mutate public GitHub state.
 * @param {String} toolName MCP operation id.
 * @returns {Boolean}
 */
function isPublicGitHubWriteTool(toolName) {
    return PUBLIC_GITHUB_WRITE_TOOLS.has(toolName);
}

/**
 * @summary Applies the GitHub write-boundary identity guard to mutating tool handlers only.
 * @param {Object} mapping Operation id to handler function.
 * @param {Object} [guardOptions] Resolver injection for tests.
 * @returns {Object} A mapping where public write handlers are guarded.
 */
function guardGitHubWriteTools(mapping, guardOptions) {
    assertNoUnclassifiedGitHubTools(mapping);

    return Object.fromEntries(
        Object.entries(mapping).map(([toolName, handler]) => [
            toolName,
            isPublicGitHubWriteTool(toolName)
                ? buildGitHubWriteIdentityGuard(handler, guardOptions)
                : handler
        ])
    );
}

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

// The github-workflow healthcheck degrades on identity drift, including the Memory-Core self-identity
// leg. That identity resolves from this MCP request context, which sits above HealthService's service
// layer — so inject the reader here rather than have the service import the context upward. Mirrors the
// write-guard's defaultGitHubIdentityAssertion sourcing.
HealthService.memoryCoreIdentityReader = () =>
    RequestContextService.getAgentIdentityNodeId() || RequestContextService.getUserId();

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

assertCompleteGitHubToolAccessPolicy(serviceMapping);

const guardedServiceMapping = guardGitHubWriteTools(serviceMapping);

// Exported for unit-test access. `buildDevBranchGuard` accepts injected
// `delegate` + `getBranch` for fixture-driven testing without spawning real `git`.
export {
    GITHUB_TOOL_ACCESS,
    assertCompleteGitHubToolAccessPolicy,
    assertNoUnclassifiedGitHubTools,
    buildDevBranchGuard,
    buildGitHubWriteIdentityGuard,
    getConversationRouter,
    guardGitHubWriteTools,
    isPublicGitHubWriteTool,
    normalizeGitHubIdentityLogin,
    syncAllOnDevOnly
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping: guardedServiceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
