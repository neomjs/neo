import {execFile}                                                                      from 'child_process';
import path                                                                            from 'path';
import {fileURLToPath}                                                                 from 'url';
import {promisify}                                                                     from 'util';
import AgentStateService                                                               from '../../../services/github-workflow/AgentStateService.mjs';
import HealthService                                                                   from '../../../services/github-workflow/HealthService.mjs';
import IssueService                                                                    from '../../../services/github-workflow/IssueService.mjs';
import DiscussionService                                                               from '../../../services/github-workflow/DiscussionService.mjs';
import LabelService                                                                    from '../../../services/github-workflow/LabelService.mjs';
import LocalFileService                                                                from '../../../services/github-workflow/LocalFileService.mjs';
import PullRequestService                                                              from '../../../services/github-workflow/PullRequestService.mjs';
import RepositoryService                                                               from '../../../services/github-workflow/RepositoryService.mjs';
import {resolveRepositoryTarget}                                                       from '../../../services/github-workflow/shared/repositoryTarget.mjs';
import ToolService                                                                     from '../../ToolService.mjs';
import {assertExpectedIdentity as assertExpectedGitHubIdentity, IdentityAssertionCode} from '../../../graph/assertExpectedIdentity.mjs';
import RequestContextService                                                           from '../shared/services/RequestContextService.mjs';
import config                                                                          from './config.mjs';

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
 * The exact remote-forge family carrying the shared per-request repository contract.
 * Local checkout/content, repository-independent validation, graph projection, and server metadata
 * stay outside this set. The OpenAPI/test census must remain exactly equal to it.
 * @type {Set<String>}
 */
const REPOSITORY_TARGET_TOOLS = Object.freeze(new Set([
    'list_labels',
    'list_pull_requests',
    'get_pull_request_diff',
    'get_conversation',
    'manage_issue_comment',
    'manage_issue_labels',
    'manage_issue_assignees',
    'manage_pr_review',
    'manage_pr_reviewers',
    'list_issues',
    'create_issue',
    'manage_issue_projects',
    'create_discussion',
    'manage_discussion',
    'get_discussion_conversation',
    'manage_discussion_comment',
    'update_issue_relationship',
    'get_viewer_permission'
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
    get_mcp_tool_handbook      : NON_PUBLIC_GITHUB_WRITE_ACCESS,
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
    update_issue_relationship  : PUBLIC_GITHUB_WRITE_ACCESS,
    validate_pr_review_body    : NON_PUBLIC_GITHUB_WRITE_ACCESS
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
 * @summary Groups write-boundary identity failures into operator-actionable classes.
 * @param {String} code The shared assertion's `code`.
 * @returns {String}
 */
function getGitHubIdentityErrorClass(code) {
    switch (code) {
        case IdentityAssertionCode.NO_AUTHED_LOGIN:
            return 'identity-resolution-transient';
        case IdentityAssertionCode.LOGIN_MISMATCH:
        case IdentityAssertionCode.MEMORY_CORE_MISMATCH:
            return 'identity-mismatch';
        case IdentityAssertionCode.EXPECTED_UNMAPPABLE:
            return 'identity-configuration';
        default:
            return 'identity-assertion';
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
        code         : getGitHubIdentityErrorCode(assertion.code),
        identityClass: getGitHubIdentityErrorClass(assertion.code)
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
    const expectedIdentity = process.env.NEO_AGENT_IDENTITY ||
        RequestContextService.getAgentIdentityNodeId() ||
        RequestContextService.getUserId();
    const memoryCoreIdentity = RequestContextService.getAgentIdentityNodeId() ||
        RequestContextService.getUserId();
    const githubLogin = await resolveGitHubViewerLogin();
    const assertion   = assertExpectedGitHubIdentity({
        expected   : expectedIdentity,
        actualLogin: githubLogin,
        memoryCoreIdentity
    });

    return {
        ...assertion,
        principals: {
            agentIdentity: expectedIdentity
                ? `@${normalizeGitHubIdentityLogin(expectedIdentity)}`
                : null,
            githubLogin,
            memoryCoreIdentity
        }
    };
}

/**
 * @summary Returns true when an identity assertion is the retryable empty-login resolution class.
 * @param {Object} assertion Shared identity assertion payload.
 * @returns {Boolean}
 */
function shouldRetryGitHubIdentityAssertion(assertion) {
    return assertion?.code === IdentityAssertionCode.NO_AUTHED_LOGIN;
}

/**
 * @summary Resolves one bounded, retry-aware identity assertion for identity-bearing operations.
 * @param {Object} [options]
 * @param {Function} [options.assertExpectedIdentity] Shared identity assertion seam.
 * @param {Number} [options.identityResolutionRetries=1] Empty-login retry count.
 * @returns {Promise<Object>} Successful assertion including bound principals.
 * @throws {Error} Structured GitHub identity error when the assertion fails.
 */
async function resolveGitHubIdentityAssertion({
    assertExpectedIdentity    = defaultGitHubIdentityAssertion,
    identityResolutionRetries = 1
} = {}) {
    let assertion = await assertExpectedIdentity();

    for (let retry = 0; !assertion.ok && retry < identityResolutionRetries && shouldRetryGitHubIdentityAssertion(assertion); retry++) {
        assertion = await assertExpectedIdentity();
    }

    if (!assertion.ok) {
        throw createGitHubIdentityError(assertion);
    }

    return assertion;
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
 * @param {Number} [options.identityResolutionRetries=1] Number of retry attempts for transient empty-login resolution.
 * @returns {Function} Guarded async tool handler.
 */
function buildGitHubWriteIdentityGuard(delegate, {
    assertExpectedIdentity    = defaultGitHubIdentityAssertion,
    identityResolutionRetries = 1
} = {}) {
    return async function githubWriteIdentityGuard(...args) {
        await resolveGitHubIdentityAssertion({
            assertExpectedIdentity,
            identityResolutionRetries
        });

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
 * @summary Wraps one remote-forge handler with the no-I/O malformed-target gate.
 *
 * This guard must sit OUTSIDE the write-identity guard. The identity assertion calls GitHub to
 * resolve the effective viewer; running it first would violate the repository contract by issuing
 * GitHub I/O before rejecting malformed input. The service resolves the target again at its own use
 * site so this boundary never exports or threads AiConfig state.
 *
 * @param {Function} delegate Remote-forge tool handler.
 * @returns {Function} Repository-target validated handler.
 */
function buildRepositoryTargetGuard(delegate) {
    return async function repositoryTargetGuard(options, ...rest) {
        const repo   = options && typeof options === 'object' ? options.repo : undefined,
              target = resolveRepositoryTarget(repo, {owner: config.owner, repo: config.repo});

        if (target.error) return target;

        return delegate(options, ...rest)
    }
}

/**
 * @summary Applies the repository-target guard to the exact 18-operation remote-forge family.
 * @param {Object} mapping Operation id to handler function.
 * @returns {Object} Mapping with target validation wrapped around remote-forge handlers.
 */
function guardRepositoryTargetTools(mapping) {
    return Object.fromEntries(
        Object.entries(mapping).map(([toolName, handler]) => [
            toolName,
            REPOSITORY_TARGET_TOOLS.has(toolName)
                ? buildRepositoryTargetGuard(handler)
                : handler
        ])
    )
}

/**
 * `get_conversation` dispatch router. The tool serves BOTH pull requests and
 * issues; it routes to the matching service by which identifier the caller supplied.
 * Rejects ambiguous (both ids) and empty (neither id) argument shapes with structured
 * errors so the failure is legible rather than a downstream null-deref.
 *
 * Exported for unit-test access, mirroring the `buildDevBranchGuard` /
 * `syncAllOnDevOnly` test-surface precedent below.
 *
 * @param {Object|Number} options `pr_number` XOR `issue_number`, plus optional selectors/projection.
 *                                A bare number is the backward-compatible positional PR form.
 * @param {Object} [identityOptions] Injectable identity resolver options for tests.
 * @returns {Promise<Object>} Conversation data or a structured error.
 */
async function getConversationRouter(options, identityOptions = {}) {
    // Backward-compatible positional number form is always a pull request.
    if (typeof options === 'number') {
        return PullRequestService.getConversation(options);
    }

    const {pr_number, issue_number, projection = 'conversation'} = options || {};

    if (pr_number && issue_number) {
        return {
            error  : 'Bad Request',
            message: "Provide exactly one of 'pr_number' or 'issue_number', not both.",
            code   : 'AMBIGUOUS_ARGUMENTS'
        };
    }

    if (issue_number) {
        if (projection === 'merge-readiness') {
            return {
                error  : 'Bad Request',
                message: "The 'merge-readiness' projection requires 'pr_number'.",
                code   : 'PROJECTION_REQUIRES_PULL_REQUEST'
            };
        }

        return IssueService.getConversation(options);
    }

    if (pr_number) {
        if (projection === 'merge-readiness') {
            try {
                const identityAssertion = await resolveGitHubIdentityAssertion(identityOptions);

                return PullRequestService.getConversation({
                    ...options,
                    identityAssertion
                });
            } catch (error) {
                return {
                    schemaVersion: 'neo.merge-readiness/v1',
                    projection   : 'merge-readiness',
                    pr           : pr_number,
                    observedAt   : new Date().toISOString(),
                    verdict      : 'unavailable',
                    blockers     : [{
                        code   : error.code || 'GITHUB_IDENTITY_ASSERTION_FAILED',
                        message: error.reason || error.message
                    }],
                    audit: [{
                        source : 'identity-assertion',
                        outcome: 'failed',
                        code   : error.code || 'GITHUB_IDENTITY_ASSERTION_FAILED'
                    }]
                };
            }
        }

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
    get_mcp_tool_handbook      : toolId => toolService.getToolHandbook(toolId),
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
    update_issue_relationship  : IssueService      .updateIssueRelationship.bind(IssueService),
    validate_pr_review_body    : PullRequestService.validatePrReviewBody   .bind(PullRequestService)
};

assertCompleteGitHubToolAccessPolicy(serviceMapping);

// Ordering is load-bearing: malformed target refusal must happen before the write guard's GitHub
// viewer probe. Wrap identity first, then repository validation around the resulting handlers.
const identityGuardedServiceMapping = guardGitHubWriteTools(serviceMapping);
const guardedServiceMapping         = guardRepositoryTargetTools(identityGuardedServiceMapping);

// Exported for unit-test access. `buildDevBranchGuard` accepts injected
// `delegate` + `getBranch` for fixture-driven testing without spawning real `git`.
export {
    GITHUB_TOOL_ACCESS,
    REPOSITORY_TARGET_TOOLS,
    assertCompleteGitHubToolAccessPolicy,
    assertNoUnclassifiedGitHubTools,
    buildGitHubWriteIdentityGuard,
    buildRepositoryTargetGuard,
    getConversationRouter,
    guardGitHubWriteTools,
    guardRepositoryTargetTools,
    isPublicGitHubWriteTool,
    normalizeGitHubIdentityLogin,
    resolveGitHubIdentityAssertion
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    compactToolSchemas          : true,
    openApiFilePath,
    serviceMapping              : guardedServiceMapping,
    toolListDescriptionMaxLength: 120
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
