import {setup} from '../../../../setup.mjs';

const appName = 'HarnessLifecycleTest';

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

import {test, expect} from '@playwright/test';
import {spawn}        from 'child_process';
import fs             from 'fs/promises';
import {existsSync}   from 'fs';
import path           from 'path';
import os             from 'os';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe('ai/scripts/harnessLifecycle', () => {
    // Shared harness-state identity writes one state file; keep this spec serial under default-worker runs.
    test.describe.configure({mode: 'serial'});

    let harnessLifecycle;
    let getStateFilePath;
    const identity = '@neo-test-harness-agent';
    let stateFile;

    test.beforeAll(async () => {
        harnessLifecycle = await import('../../../../../../ai/scripts/lifecycle/harnessLifecycle.mjs');
        getStateFilePath = harnessLifecycle.getStateFilePath;
    });

    test.beforeEach(async () => {
        stateFile = getStateFilePath(identity);
        try { await fs.unlink(stateFile); } catch (e) {}
    });

    test.afterEach(async () => {
        try { await fs.unlink(stateFile); } catch (e) {}
    });

    test('terminatePreviousHarness with no prior state returns no-prior-state (#10696)', async () => {
        const result = await harnessLifecycle.terminatePreviousHarness(identity);
        expect(result.terminated).toBe(false);
        expect(result.reason).toBe('no-prior-state');
    });

    test('recordHarnessProcess persists pid + spawnedAt to state file (#10696)', async () => {
        const pid = 99999;
        const t0 = Date.now();
        await harnessLifecycle.recordHarnessProcess(identity, pid, t0);

        expect(existsSync(stateFile)).toBe(true);
        const content = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
        expect(content.pid).toBe(pid);
        expect(content.spawnedAt).toBe(t0);
    });

    test('terminatePreviousHarness with stale dead PID returns already-dead and clears state (#10696)', async () => {
        // PID 1 is init; signaling it would either be a permission-denied (EPERM) on most
        // systems or, on test sandboxes, no-op. We use a much higher PID very unlikely to
        // belong to any process: 999999 is well above typical pid_max ranges.
        const stalePid = 999999;
        await harnessLifecycle.recordHarnessProcess(identity, stalePid, Date.now() - 60000);

        const result = await harnessLifecycle.terminatePreviousHarness(identity);

        // process.kill on a non-existent PID throws ESRCH which the helper translates.
        // On rare systems this may return EPERM (e.g., kernel-protected pids); accept either
        // outcome but state-file should be cleared in the ESRCH path.
        if (result.reason === 'already-dead') {
            expect(result.terminated).toBe(false);
            expect(existsSync(stateFile)).toBe(false);
        } else {
            // Permission denied or other — at minimum the call returned without throwing.
            expect(result.terminated).toBe(false);
        }
    });

    test('terminatePreviousHarness on a live spawned process actually terminates it (#10696)', async () => {
        // Spawn a long-sleep child we can record + then terminate.
        const child = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: false });
        const childPid = child.pid;
        expect(childPid).toBeTruthy();

        try {
            await harnessLifecycle.recordHarnessProcess(identity, childPid, Date.now());

            // Confirm child is alive before termination.
            expect(() => process.kill(childPid, 0)).not.toThrow();

            const result = await harnessLifecycle.terminatePreviousHarness(identity, { graceMs: 500 });
            expect(result.terminated).toBe(true);
            expect(result.pid).toBe(childPid);
            // State file cleared post-termination.
            expect(existsSync(stateFile)).toBe(false);

            // Child should be dead now (SIGTERM during grace period or SIGKILL after).
            // process.kill(pid, 0) throws ESRCH if dead.
            await new Promise(r => setTimeout(r, 100));
            expect(() => process.kill(childPid, 0)).toThrow();
        } finally {
            // Belt-and-suspenders cleanup if termination failed.
            try { process.kill(childPid, 'SIGKILL'); } catch (e) {}
        }
    });

    test('recordHarnessProcess overwrites prior state for same identity (#10696)', async () => {
        await harnessLifecycle.recordHarnessProcess(identity, 11111, 1000);
        await harnessLifecycle.recordHarnessProcess(identity, 22222, 2000);

        const content = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
        expect(content.pid).toBe(22222);
        expect(content.spawnedAt).toBe(2000);
    });

    test('getStateFilePath sanitizes identity to prevent path traversal (#10696)', async () => {
        const malicious = '../../../etc/passwd@neo';
        const safePath = getStateFilePath(malicious);
        // Sanitization strips non-alphanumeric (except _ and -) so '../../../etc/passwd@neo' becomes 'etcpasswdneo'
        expect(safePath).not.toContain('..');
        expect(safePath).not.toContain('/etc/');
        expect(safePath).toMatch(/etcpasswdneo\.json$/);
    });
});
