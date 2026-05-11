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

// Bootstrap parity (#11146/RA-1): importing toolService.mjs chains to Neo service
// classes that require Neo.gatekeep (Compare.mjs:166). The setup() call only configures
// Neo; the augmentation happens via these imports — mirrors the existing AI unit-test
// pattern (e.g. IssueService.spec.mjs).
import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

/**
 * #11145 — Branch-check guard at the agent-callable `sync_all` tool surface.
 *
 * Description-as-policy on the OpenAPI tool was empirically insufficient (5+/day
 * @neo-gemini-3-1-pro violations + 2026-05-10 PR #11143 stale-branch race). This
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
