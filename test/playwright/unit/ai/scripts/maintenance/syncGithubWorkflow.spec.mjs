import {test, expect} from '@playwright/test';
import fs             from 'fs/promises';
import path           from 'path';

import {
    buildSyncGithubWorkflowDevBranchGuard
} from '../../../../../../ai/scripts/maintenance/syncGithubWorkflowBranchGuard.mjs';

const cliScriptPath = path.resolve(process.cwd(), 'ai/scripts/maintenance/syncGithubWorkflow.mjs');

/**
 * @summary Regression coverage for the manual GitHub Workflow sync CLI branch guard.
 *
 * The behavior tests exercise the pure guard helper with injected branch detectors so the
 * suite never runs the full GitHub sync. The wiring test source-checks the heavy CLI script
 * because importing it boots the canonical AI services SDK and is intentionally expensive.
 */
test.describe('syncGithubWorkflow CLI dev-branch guard (#12780)', () => {
    test('delegates when the active branch is dev', async () => {
        let delegateCalls = 0;
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async (...args) => {
            delegateCalls++;
            return {args};
        }, async () => 'dev');

        const result = await guarded('full-sync');

        expect(delegateCalls).toBe(1);
        expect(result).toEqual({args: ['full-sync']});
    });

    test('rejects feature branches before delegate work begins', async () => {
        let delegateCalls = 0;
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async () => {
            delegateCalls++;
        }, async () => 'codex/feature');

        await expect(guarded()).rejects.toThrow(/syncGithubWorkflow REJECTED.*codex\/feature.*not 'dev'/);
        expect(delegateCalls).toBe(0);
    });

    test('rejects main before delegate work begins', async () => {
        let delegateCalls = 0;
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async () => {
            delegateCalls++;
        }, async () => 'main');

        await expect(guarded()).rejects.toThrow(/syncGithubWorkflow REJECTED.*main.*not 'dev'/);
        expect(delegateCalls).toBe(0);
    });

    test('rejects detached HEAD before delegate work begins', async () => {
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async () => {
            throw new Error('delegate must not run');
        }, async () => '');

        await expect(guarded()).rejects.toThrow(/syncGithubWorkflow REJECTED.*\(detached\)/);
    });

    test('preserves root-mismatch rejections from the branch detector', async () => {
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async () => {
            throw new Error('delegate must not run');
        }, async () => {
            throw new Error('syncGithubWorkflow REJECTED: Root mismatch. CLI projectRoot ...');
        });

        await expect(guarded()).rejects.toThrow(/syncGithubWorkflow REJECTED: Root mismatch/);
    });

    test('wraps generic detector errors with a syncGithubWorkflow rejection', async () => {
        const guarded = buildSyncGithubWorkflowDevBranchGuard(async () => {
            throw new Error('delegate must not run');
        }, async () => {
            throw new Error('git: not a git repository');
        });

        await expect(guarded()).rejects.toThrow(/could not determine current branch.*not a git repository/);
    });

    test('wires the CLI guard before lease acquisition and real sync delegation', async () => {
        const source = await fs.readFile(cliScriptPath, 'utf8');

        const
            guardIndex  = source.indexOf('await assertSyncGithubWorkflowDevBranch();'),
            startIndex  = source.indexOf('Starting full GitHub Workflow sync'),
            leaseIndex  = source.indexOf('outcome = await withHeavyMaintenanceLease('),
            syncIndex   = source.indexOf('async () => GH_SyncService.runFullSync()'),
            autorunGate = source.indexOf("if (import.meta.url === pathToFileURL(process.argv[1] || '').href)");

        expect(guardIndex, 'branch guard call must exist').toBeGreaterThan(-1);
        expect(startIndex, 'start log must exist').toBeGreaterThan(-1);
        expect(leaseIndex, 'heavy-maintenance lease call must exist').toBeGreaterThan(-1);
        expect(syncIndex, 'real sync delegate must exist').toBeGreaterThan(-1);
        expect(autorunGate, 'import-safe CLI autorun gate must exist').toBeGreaterThan(-1);

        expect(guardIndex).toBeLessThan(startIndex);
        expect(guardIndex).toBeLessThan(leaseIndex);
        expect(guardIndex).toBeLessThan(syncIndex);
    });
});
