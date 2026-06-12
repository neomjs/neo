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
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

/**
 * Branch-check guard at the agent-callable `sync_all` tool surface.
 *
 * Description-as-policy on the OpenAPI tool was empirically insufficient (5+/day
 * @neo-gemini-3-1-pro violations + a stale-branch race). This
 * spec locks in the mechanical rejection: `sync_all` callable from the MCP tool
 * boundary must reject when caller's working tree is not on `dev`.
 *
 * Library surface (`SyncService.runFullSync`) stays unguarded — daemons and
 * build-scripts call directly and remain unaffected. Only the tool entry point is
 * tested here.
 *
 * Branch-detector is injectable via `buildDevBranchGuard` for fixture-driven
 * testing without spawning real `git` (no environment dependency).
 */
test.describe('Neo.ai.services.github-workflow.toolService — sync_all dev-branch guard (#11145)', () => {
    let buildDevBranchGuard;

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');
        buildDevBranchGuard = mod.buildDevBranchGuard;
    });

    test('sync_all delegates to SyncService.runFullSync when on dev', async () => {
        let delegateCalls = 0;
        const delegate = async (...args) => {
            delegateCalls++;
            return {message: 'sync ok', args};
        };
        const guarded = buildDevBranchGuard(delegate, async () => 'dev');

        const result = await guarded('arg1', {opt: 2});

        expect(delegateCalls).toBe(1);
        expect(result).toEqual({message: 'sync ok', args: ['arg1', {opt: 2}]});
    });

    test('sync_all REJECTS when on a feature branch (no delegate call)', async () => {
        let delegateCalls = 0;
        const delegate = async () => { delegateCalls++; return {message: 'should not run'}; };
        const guarded = buildDevBranchGuard(delegate, async () => 'agent/some-feature-branch');

        await expect(guarded()).rejects.toThrow(/sync_all REJECTED.*'agent\/some-feature-branch'.*not 'dev'/);
        expect(delegateCalls).toBe(0);
    });

    test('sync_all REJECTS when on main (no delegate call)', async () => {
        let delegateCalls = 0;
        const delegate = async () => { delegateCalls++; };
        const guarded = buildDevBranchGuard(delegate, async () => 'main');

        await expect(guarded()).rejects.toThrow(/sync_all REJECTED.*'main'.*not 'dev'/);
        expect(delegateCalls).toBe(0);
    });

    test('sync_all REJECTS on detached HEAD (empty branch name)', async () => {
        const delegate = async () => { throw new Error('should not run'); };
        const guarded = buildDevBranchGuard(delegate, async () => '');

        await expect(guarded()).rejects.toThrow(/sync_all REJECTED.*'\(detached\)'/);
    });

    test('sync_all REJECTS immediately on root mismatch from branch detector', async () => {
        const delegate = async () => { throw new Error('should not run'); };
        const guarded = buildDevBranchGuard(delegate, async () => {
            throw new Error('sync_all REJECTED: Root mismatch. MCP server projectRoot...');
        });

        await expect(guarded()).rejects.toThrow(/sync_all REJECTED: Root mismatch/);
    });

    test('sync_all REJECTS with git-error message when branch detector throws', async () => {
        const delegate = async () => { throw new Error('should not run'); };
        const guarded = buildDevBranchGuard(delegate, async () => {
            throw new Error('git: not a git repository');
        });

        await expect(guarded()).rejects.toThrow(/could not determine current branch.*not a git repository/);
    });

    test('rejection message includes daemon-remediation hint', async () => {
        const guarded = buildDevBranchGuard(async () => {}, async () => 'feature/x');

        await expect(guarded()).rejects.toThrow(/PrimaryRepoSyncService/);
    });
});

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
        const mod             = await import('../../../../../../ai/mcp/server/github-workflow/toolService.mjs');
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
