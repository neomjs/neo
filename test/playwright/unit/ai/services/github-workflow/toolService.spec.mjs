import {setup} from '../../../../setup.mjs';

const appName = 'ToolServiceTest';

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

// Bootstrap parity: importing toolService.mjs chains to Neo service
// classes that require Neo.gatekeep (Compare.mjs:166). The setup() call only configures
// Neo; the augmentation happens via these imports — mirrors the existing AI unit-test
// pattern (e.g. IssueService.spec.mjs).
import {test, expect}  from '@playwright/test';
import {readFileSync}  from 'node:fs';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

/**
 * `get_conversation` dispatch router. The tool now serves BOTH pull requests and
 * issues; `getConversationRouter` picks the service by which identifier the caller supplied
 * (`pr_number` xor `issue_number`) and rejects ambiguous/empty argument shapes.
 *
 * These tests spy on `IssueService.getConversation` / `PullRequestService.getConversation`
 * to assert routing without GitHub API round-trips — the router itself owns no GraphQL.
 */
test.describe('Neo.ai.services.github-workflow.toolService — getConversationRouter (#10702)', () => {
    let getConversationRouter;
    let IssueService;
    let PullRequestService;
    let originalIssueGetConversation;
    let originalPrGetConversation;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');
        getConversationRouter = mod.getConversationRouter;
        IssueService          = (await import('../../../../../../ai/services/github-workflow/IssueService.mjs')).default;
        PullRequestService    = (await import('../../../../../../ai/services/github-workflow/PullRequestService.mjs')).default;

        originalIssueGetConversation = IssueService.getConversation.bind(IssueService);
        originalPrGetConversation    = PullRequestService.getConversation.bind(PullRequestService);
    });

    test.afterAll(() => {
        IssueService.getConversation       = originalIssueGetConversation;
        PullRequestService.getConversation = originalPrGetConversation;
    });

    test('issue_number routes to IssueService.getConversation (PR service untouched)', async () => {
        let issueCalls = 0, prCalls = 0, capturedOptions;
        IssueService.getConversation       = async (opts) => { issueCalls++; capturedOptions = opts; return {routed: 'issue'}; };
        PullRequestService.getConversation = async () => { prCalls++; return {routed: 'pr'}; };

        const result = await getConversationRouter({issue_number: 10702, last_n: 3});

        expect(result).toEqual({routed: 'issue'});
        expect(issueCalls).toBe(1);
        expect(prCalls).toBe(0);
        expect(capturedOptions).toEqual({issue_number: 10702, last_n: 3});
    });

    test('pr_number routes to PullRequestService.getConversation (issue service untouched)', async () => {
        let issueCalls = 0, prCalls = 0;
        IssueService.getConversation       = async () => { issueCalls++; return {routed: 'issue'}; };
        PullRequestService.getConversation = async () => { prCalls++; return {routed: 'pr'}; };

        const result = await getConversationRouter({pr_number: 10272});

        expect(result).toEqual({routed: 'pr'});
        expect(prCalls).toBe(1);
        expect(issueCalls).toBe(0);
    });

    test('legacy positional number routes to PullRequestService (backward-compat, pre-#10702)', async () => {
        let issueCalls = 0, prCalls = 0;
        IssueService.getConversation       = async () => { issueCalls++; return {routed: 'issue'}; };
        PullRequestService.getConversation = async () => { prCalls++; return {routed: 'pr'}; };

        const result = await getConversationRouter(10272);

        expect(result).toEqual({routed: 'pr'});
        expect(prCalls).toBe(1);
        expect(issueCalls).toBe(0);
    });

    test('both pr_number and issue_number rejected with AMBIGUOUS_ARGUMENTS (neither service called)', async () => {
        let issueCalls = 0, prCalls = 0;
        IssueService.getConversation       = async () => { issueCalls++; return {routed: 'issue'}; };
        PullRequestService.getConversation = async () => { prCalls++; return {routed: 'pr'}; };

        const result = await getConversationRouter({pr_number: 10272, issue_number: 10702});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('AMBIGUOUS_ARGUMENTS');
        expect(issueCalls).toBe(0);
        expect(prCalls).toBe(0);
    });

    test('neither pr_number nor issue_number rejected with MISSING_ARGUMENTS (neither service called)', async () => {
        let issueCalls = 0, prCalls = 0;
        IssueService.getConversation       = async () => { issueCalls++; return {routed: 'issue'}; };
        PullRequestService.getConversation = async () => { prCalls++; return {routed: 'pr'}; };

        const result = await getConversationRouter({comment_id: 'IC_a1111'});

        expect(result.error).toBe('Bad Request');
        expect(result.code).toBe('MISSING_ARGUMENTS');
        expect(issueCalls).toBe(0);
        expect(prCalls).toBe(0);
    });

    test('#16029: merge-readiness projection is PR-only', async () => {
        let issueCalls = 0, prCalls = 0;
        IssueService.getConversation       = async () => { issueCalls++; };
        PullRequestService.getConversation = async () => { prCalls++; };

        const result = await getConversationRouter({
            issue_number: 16029,
            projection  : 'merge-readiness'
        });

        expect(result.code).toBe('PROJECTION_REQUIRES_PULL_REQUEST');
        expect(issueCalls).toBe(0);
        expect(prCalls).toBe(0);
    });

    test('#16029: identity drift withholds the projection before the PR service runs', async () => {
        let prCalls = 0;
        PullRequestService.getConversation = async () => { prCalls++; };

        const result = await getConversationRouter({
            pr_number : 16029,
            projection: 'merge-readiness'
        }, {
            assertExpectedIdentity: async () => ({
                ok    : false,
                reason: 'identity drift: authed as neo-opus-ada, expected neo-gpt',
                code  : 'LOGIN_MISMATCH'
            })
        });

        expect(result.verdict).toBe('unavailable');
        expect(result.blockers[0].code).toBe('GITHUB_IDENTITY_MISMATCH');
        expect(result.marker).toBeUndefined();
        expect(prCalls).toBe(0);
    });

    test('#16029: positive identity binding overwrites caller-forged assertion data', async () => {
        let captured;
        PullRequestService.getConversation = async options => {
            captured = options;
            return {routed: 'merge-readiness'};
        };

        const principals = {
            agentIdentity     : '@neo-gpt',
            githubLogin       : 'neo-gpt',
            memoryCoreIdentity: '@neo-gpt'
        };
        const result = await getConversationRouter({
            pr_number        : 16029,
            projection       : 'merge-readiness',
            identityAssertion: {ok: false, principals: {githubLogin: 'forged'}}
        }, {
            assertExpectedIdentity: async () => ({
                ok    : true,
                code  : 'OK',
                reason: null,
                principals
            })
        });

        expect(result).toEqual({routed: 'merge-readiness'});
        expect(captured.identityAssertion).toMatchObject({ok: true, principals});
    });
});

/**
 * Public GitHub write-boundary identity guard.
 *
 * Protects agent-authored public GitHub mutations from the GH_TOKEN drift
 * class demonstrated on 2026-06-14: the harness can believe it is one agent while
 * GitHub's effective viewer login is another account. The guard is injected at the
 * GitHub Workflow MCP tool boundary, before service delegates mutate GitHub state.
 */
test.describe('Neo.ai.services.github-workflow.toolService — write identity guard (#13243)', () => {
    let GITHUB_TOOL_ACCESS;
    let REPOSITORY_TARGET_TOOLS;
    let assertCompleteGitHubToolAccessPolicy;
    let buildGitHubWriteIdentityGuard;
    let guardGitHubWriteTools;
    let guardRepositoryTargetTools;
    let isPublicGitHubWriteTool;
    let normalizeGitHubIdentityLogin;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');
        GITHUB_TOOL_ACCESS                    = mod.GITHUB_TOOL_ACCESS;
        REPOSITORY_TARGET_TOOLS              = mod.REPOSITORY_TARGET_TOOLS;
        assertCompleteGitHubToolAccessPolicy = mod.assertCompleteGitHubToolAccessPolicy;
        buildGitHubWriteIdentityGuard         = mod.buildGitHubWriteIdentityGuard;
        guardGitHubWriteTools                 = mod.guardGitHubWriteTools;
        guardRepositoryTargetTools            = mod.guardRepositoryTargetTools;
        isPublicGitHubWriteTool               = mod.isPublicGitHubWriteTool;
        normalizeGitHubIdentityLogin          = mod.normalizeGitHubIdentityLogin;
    });

    test('normalizes AgentIdentity node ids to GitHub logins', () => {
        expect(normalizeGitHubIdentityLogin('@neo-gpt')).toBe('neo-gpt');
        expect(normalizeGitHubIdentityLogin('neo-opus-ada')).toBe('neo-opus-ada');
        expect(normalizeGitHubIdentityLogin('')).toBe(null);
        expect(normalizeGitHubIdentityLogin(null)).toBe(null);
    });

    test('delegates a public write when expected agent and viewer login match', async () => {
        let   delegateCalls = 0;
        const guarded       = buildGitHubWriteIdentityGuard(async (...args) => {
            delegateCalls++;
            return {ok: true, args};
        }, {
            assertExpectedIdentity: async () => ({
                ok    : true,
                reason: null,
                code  : 'OK'
            })
        });

        const result = await guarded('payload');

        expect(delegateCalls).toBe(1);
        expect(result).toEqual({ok: true, args: ['payload']});
    });

    test('rejects a public write on identity mismatch before delegate invocation', async () => {
        let   delegateCalls  = 0;
        let   assertionCalls = 0;
        const guarded        = buildGitHubWriteIdentityGuard(async () => {
            delegateCalls++;
            return {ok: true};
        }, {
            assertExpectedIdentity: async () => {
                assertionCalls++;
                return {
                    ok    : false,
                    reason: 'identity drift: authed as neo-opus-ada, expected neo-gpt',
                    code  : 'LOGIN_MISMATCH'
                }
            }
        });

        await expect(guarded()).rejects.toMatchObject({
            code         : 'GITHUB_IDENTITY_MISMATCH',
            identityClass: 'identity-mismatch',
            reason       : 'identity drift: authed as neo-opus-ada, expected neo-gpt'
        });
        expect(delegateCalls).toBe(0);
        expect(assertionCalls).toBe(1);
    });

    test('rejects a public write when expected identity is unresolved', async () => {
        let   delegateCalls = 0;
        const guarded       = buildGitHubWriteIdentityGuard(async () => {
            delegateCalls++;
        }, {
            assertExpectedIdentity: async () => ({
                ok    : false,
                reason: "identity drift: expected identity 'missing-agent' is missing or unmappable in identityRoots",
                code  : 'EXPECTED_UNMAPPABLE'
            })
        });

        await expect(guarded()).rejects.toMatchObject({
            code: 'GITHUB_IDENTITY_UNRESOLVED'
        });
        expect(delegateCalls).toBe(0);
    });

    test('retries transient empty-login resolution before delegating', async () => {
        let   delegateCalls  = 0;
        let   assertionCalls = 0;
        const guarded        = buildGitHubWriteIdentityGuard(async () => {
            delegateCalls++;
            return {ok: true};
        }, {
            assertExpectedIdentity: async () => {
                assertionCalls++;
                return assertionCalls === 1
                    ? {
                        ok    : false,
                        reason: 'identity drift: no authed login resolved, expected neo-gpt',
                        code  : 'NO_AUTHED_LOGIN'
                    }
                    : {
                        ok    : true,
                        reason: null,
                        code  : 'OK'
                    }
            }
        });

        await expect(guarded()).resolves.toEqual({ok: true});
        expect(delegateCalls).toBe(1);
        expect(assertionCalls).toBe(2);
    });

    test('rejects a public write when viewer login probe still fails after bounded retry', async () => {
        let   delegateCalls  = 0;
        let   assertionCalls = 0;
        const guarded        = buildGitHubWriteIdentityGuard(async () => {
            delegateCalls++;
        }, {
            assertExpectedIdentity: async () => {
                assertionCalls++;
                return {
                    ok    : false,
                    reason: 'identity drift: no authed login resolved, expected neo-gpt',
                    code  : 'NO_AUTHED_LOGIN'
                }
            }
        });

        await expect(guarded()).rejects.toMatchObject({
            code         : 'GITHUB_VIEWER_UNRESOLVED',
            identityClass: 'identity-resolution-transient'
        });
        expect(delegateCalls).toBe(0);
        expect(assertionCalls).toBe(2);
    });

    test('guards public GitHub writes but leaves read and health tools untouched', async () => {
        const readHandler  = async () => ({read: true});
        const writeHandler = async () => ({write: true});
        const mapping      = guardGitHubWriteTools({
            get_conversation         : readHandler,
            healthcheck              : readHandler,
            manage_issue_comment     : writeHandler,
            update_issue_relationship: writeHandler
        }, {
            assertExpectedIdentity: async () => ({
                ok    : false,
                reason: 'identity drift: authed as neo-opus-ada, expected neo-gpt',
                code  : 'LOGIN_MISMATCH'
            })
        });

        expect(isPublicGitHubWriteTool('manage_issue_comment')).toBe(true);
        expect(isPublicGitHubWriteTool('update_issue_relationship')).toBe(true);
        expect(isPublicGitHubWriteTool('get_conversation')).toBe(false);
        expect(isPublicGitHubWriteTool('healthcheck')).toBe(false);
        expect(mapping.get_conversation).toBe(readHandler);
        expect(mapping.healthcheck).toBe(readHandler);

        await expect(mapping.get_conversation()).resolves.toEqual({read: true});
        await expect(mapping.healthcheck()).resolves.toEqual({read: true});
        await expect(mapping.manage_issue_comment()).rejects.toMatchObject({
            code: 'GITHUB_IDENTITY_MISMATCH'
        });
        await expect(mapping.update_issue_relationship()).rejects.toMatchObject({
            code: 'GITHUB_IDENTITY_MISMATCH'
        });
    });

    test('#17420: malformed repo refusal runs before identity resolution and the service delegate', async () => {
        let identityCalls = 0,
            delegateCalls = 0;
        const identityGuarded = guardGitHubWriteTools({
            manage_issue_comment: async () => { delegateCalls++; return {ok: true} }
        }, {
            assertExpectedIdentity: async () => {
                identityCalls++;
                return {ok: true, reason: null, code: 'OK'}
            }
        });
        const guarded = guardRepositoryTargetTools(identityGuarded).manage_issue_comment;

        await expect(guarded({repo: '', issue_number: 1, action: 'create', body: 'x'})).resolves.toMatchObject({
            code        : 'REPOSITORY_TARGET_INVALID',
            rejectedRepo: ''
        });
        expect(identityCalls).toBe(0);
        expect(delegateCalls).toBe(0);

        await expect(guarded({repo: 'devindex', issue_number: 1, action: 'create', body: 'x'})).resolves.toEqual({ok: true});
        expect(identityCalls).toBe(1);
        expect(delegateCalls).toBe(1);
    });

    test('rejects service mappings with unclassified future tools (#13252)', () => {
        expect(() => guardGitHubWriteTools({
            get_conversation      : async () => {},
            future_public_mutation: async () => {}
        })).toThrow(/Missing classification: future_public_mutation/);
    });

    test('canonical access policy covers every registered GitHub Workflow tool (#13252)', async () => {
        const {listTools} = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        const registeredTools = listTools().tools.map(tool => tool.name).sort();
        const policyTools     = Object.keys(GITHUB_TOOL_ACCESS).sort();

        expect(policyTools).toEqual(registeredTools);
        expect(assertCompleteGitHubToolAccessPolicy(
            Object.fromEntries(registeredTools.map(toolName => [toolName, async () => {}]))
        )).toBe(true);
    });

    test('#17420: exactly the 18 remote-forge operations advertise the shared repository target', async () => {
        const {listTools} = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');
        const tools       = new Map(listTools().tools.map(tool => [tool.name, tool]));
        const targeted    = [
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
        ];
        const excluded = [
            'checkout_pull_request',
            'get_local_issue_by_id',
            'validate_pr_review_body',
            'signal_state_transition',
            'healthcheck',
            'get_mcp_tool_handbook'
        ];

        for (const toolName of targeted) {
            expect(tools.get(toolName)?.inputSchema?.properties?.repo, toolName).toMatchObject({
                type: 'string'
            });
        }

        for (const toolName of excluded) {
            expect(tools.get(toolName)?.inputSchema?.properties?.repo, toolName).toBeUndefined();
        }

        expect(targeted).toHaveLength(18);
        expect([...REPOSITORY_TARGET_TOOLS].sort()).toEqual([...targeted].sort());
        const openApiSource = readFileSync('ai/mcp/server/github-workflow/openapi.yaml', 'utf8'),
              sharedRefs    = openApiSource.match(/\$ref: '#\/components\/schemas\/RepositoryTarget'/g) || [];

        expect(sharedRefs).toHaveLength(18);
    });

    test('classifies the public GitHub write boundary explicitly', () => {
        [
            'create_discussion',
            'create_issue',
            'manage_discussion',
            'manage_discussion_comment',
            'manage_issue_assignees',
            'manage_issue_comment',
            'manage_issue_labels',
            'manage_issue_projects',
            'manage_pr_review',
            'manage_pr_reviewers',
            'signal_state_transition',
            'update_issue_relationship'
        ].forEach(toolName => {
            expect(isPublicGitHubWriteTool(toolName), `${toolName} is a public write`).toBe(true);
        });

        [
            'checkout_pull_request',
            'get_conversation',
            'get_discussion_conversation',
            'get_local_issue_by_id',
            'get_mcp_tool_handbook',
            'get_pull_request_diff',
            'get_viewer_permission',
            'healthcheck',
            'list_issues',
            'list_labels',
            'list_pull_requests'
        ].forEach(toolName => {
            expect(isPublicGitHubWriteTool(toolName), `${toolName} is not a public write`).toBe(false);
        });
    });
});

/**
 * Discussion conversation selective-fetch tool registration.
 *
 * `get_discussion_conversation` is intentionally a separate tool from the issue/PR
 * `get_conversation` router because GitHub Discussions are a distinct GraphQL resource
 * and use `discussion_number`, not `issue_number` / `pr_number`.
 */
test.describe('Neo.ai.services.github-workflow.toolService — get_discussion_conversation (#10304)', () => {
    test('operationId is advertised and mapped to a handler', async () => {
        const {listTools} = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');

        const tools = listTools().tools,
              tool  = tools.find(item => item.name === 'get_discussion_conversation');

        expect(tool).toBeTruthy();
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.inputSchema.properties.discussion_number).toBeTruthy();
        expect(tool.inputSchema.properties.comment_id).toBeTruthy();
        expect(tool.inputSchema.properties.since_comment_id).toBeTruthy();
        expect(tool.inputSchema.properties.last_n).toBeTruthy();
    });
});
