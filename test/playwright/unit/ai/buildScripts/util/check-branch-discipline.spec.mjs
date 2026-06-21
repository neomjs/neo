import { test, expect }           from '@playwright/test';
import { execSync, execFileSync } from 'node:child_process';
import path                       from 'node:path';
import fs                         from 'node:fs';
import os                         from 'node:os';
import { fileURLToPath }          from 'node:url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const scriptPath  = path.resolve(__dirname, '../../../../../../buildScripts/util/check-branch-discipline.mjs');

test.describe('check-branch-discipline.mjs (#11133)', () => {
    let tempDir;
    let testScriptPath;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-branch-discipline-test-'));
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });

        // Fake `origin/dev` via local ref (no actual remote needed; script's `git fetch`
        // catch handles fetch failure non-fatally + uses `git log origin/dev..HEAD`).
        const devSha = execSync('git rev-parse HEAD', { cwd: tempDir, encoding: 'utf-8' }).trim();
        execSync(`git update-ref refs/remotes/origin/dev ${devSha}`, { cwd: tempDir, stdio: 'ignore' });

        // Mirror the script into the tempDir so the path-root-equality check (`scriptRoot
        // === gitRoot`) passes inside the temp repo.
        testScriptPath = path.join(tempDir, 'buildScripts/util/check-branch-discipline.mjs');
        fs.mkdirSync(path.dirname(testScriptPath), { recursive: true });
        fs.copyFileSync(scriptPath, testScriptPath);
        // check-branch-discipline.mjs imports ./branchFreshness.mjs — mirror the sibling too.
        fs.copyFileSync(
            path.resolve(__dirname, '../../../../../../buildScripts/util/branchFreshness.mjs'),
            path.join(tempDir, 'buildScripts/util/branchFreshness.mjs')
        );
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runScript = (cwd = tempDir) => {
        try {
            const output = execSync(`node ${testScriptPath}`, {
                cwd,
                encoding: 'utf-8',
                stdio   : 'pipe'
            });
            return { status: 0, output };
        } catch (error) {
            return { status: error.status, output: error.stderr || error.stdout || '' };
        }
    };

    // Use execFileSync (no shell) — bypasses string-interpolation escape hazards
    // (CodeQL js/incomplete-sanitization on backslash). Argv array goes directly
    // to git without shell-quoting.
    const featureCommit = (subject = 'feat: ship a real feature') => {
        execFileSync('git', ['commit', '--allow-empty', '-m', subject], { cwd: tempDir, stdio: 'ignore' });
    };

    const choreSyncCommit = (subject = 'chore(data): Hourly data sync pipeline update [skip ci]') => {
        execFileSync('git', ['commit', '--allow-empty', '-m', subject], { cwd: tempDir, stdio: 'ignore' });
    };

    test('clean feature branch passes (no chore-sync commits)', () => {
        execSync('git checkout -b agent/0000-feature', { cwd: tempDir, stdio: 'ignore' });
        featureCommit('feat(test): clean feature implementation');
        const result = runScript();
        expect(result.status).toBe(0);
    });

    test('chore-sync commit on feature branch blocks push (#11133 core failure mode)', () => {
        execSync('git checkout -b agent/0000-feature', { cwd: tempDir, stdio: 'ignore' });
        featureCommit('feat(test): a real feature');
        choreSyncCommit('chore(data): Hourly data sync pipeline update [skip ci]');
        const result = runScript();
        expect(result.status).toBe(1);
        expect(result.output).toContain('chore-sync commit');
        expect(result.output).toContain('agent/0000-feature');
        expect(result.output).toContain('clean-path');
    });

    test('chore-sync commit alone (no feature) still blocks', () => {
        execSync('git checkout -b agent/0000-feature', { cwd: tempDir, stdio: 'ignore' });
        choreSyncCommit('chore(data): Hourly data sync pipeline update');
        const result = runScript();
        expect(result.status).toBe(1);
        expect(result.output).toContain('chore-sync commit');
    });

    test('designated sync branch (chore/sync-*) is exempt', () => {
        execSync('git checkout -b chore/sync-123', { cwd: tempDir, stdio: 'ignore' });
        choreSyncCommit();
        const result = runScript();
        expect(result.status).toBe(0);
    });

    test('designated sync branch (agent/sync-*) is exempt', () => {
        execSync('git checkout -b agent/sync-456', { cwd: tempDir, stdio: 'ignore' });
        choreSyncCommit();
        const result = runScript();
        expect(result.status).toBe(0);
    });

    test('protected branch dev bypasses (caught by §2.3 universal safety net)', () => {
        // Already on `dev` from beforeEach; even with a chore-sync commit, pre-push from
        // `dev` itself is out of scope for this gate (caught by separate §2.3 safety net).
        choreSyncCommit();
        const result = runScript();
        expect(result.status).toBe(0);
    });

    test('regex anchored: lookalike subject like `chore(data) without colon` does NOT match', () => {
        execSync('git checkout -b agent/0000-feature', { cwd: tempDir, stdio: 'ignore' });
        execFileSync('git', ['commit', '--allow-empty', '-m', 'chore(data) lookalike but no colon'], { cwd: tempDir, stdio: 'ignore' });
        const result = runScript();
        expect(result.status).toBe(0);
    });

    test('regex case-insensitive: `chore(DATA): Sync` triggers', () => {
        execSync('git checkout -b agent/0000-feature', { cwd: tempDir, stdio: 'ignore' });
        execFileSync('git', ['commit', '--allow-empty', '-m', 'chore(DATA): Sync run'], { cwd: tempDir, stdio: 'ignore' });
        const result = runScript();
        expect(result.status).toBe(1);
        expect(result.output).toContain('chore-sync commit');
    });
});
