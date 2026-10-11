import { test, expect }                    from '@playwright/test';
import {execFileSync, execSync, spawnSync} from 'node:child_process';
import path                                from 'node:path';
import fs                                  from 'node:fs';
import os                                  from 'node:os';
import { fileURLToPath }                   from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, '../../../../../buildScripts/util/check-branch-discipline.mjs');

test.describe('check-branch-discipline.mjs (#11133)', () => {
    let tempDir;
    let remoteDir;
    let testScriptPath;

    test.beforeEach(() => {
        tempDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-branch-discipline-test-'));
        remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-branch-discipline-remote-'));

        execFileSync('git', ['init', '--bare', remoteDir], {stdio: 'ignore'});
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });
        execFileSync('git', ['remote', 'add', 'origin', remoteDir], {cwd: tempDir, stdio: 'ignore'});
        execFileSync('git', ['push', '-u', 'origin', 'dev'], {cwd: tempDir, stdio: 'ignore'});

        // Mirror the script into the tempDir so the path-root-equality check (`scriptRoot
        // === gitRoot`) passes inside the temp repo.
        testScriptPath = path.join(tempDir, 'buildScripts/util/check-branch-discipline.mjs');
        fs.mkdirSync(path.dirname(testScriptPath), { recursive: true });
        fs.copyFileSync(scriptPath, testScriptPath);
        // check-branch-discipline.mjs imports ./branchFreshness.mjs — mirror the sibling too.
        fs.copyFileSync(
            path.resolve(__dirname, '../../../../../buildScripts/util/branchFreshness.mjs'),
            path.join(tempDir, 'buildScripts/util/branchFreshness.mjs')
        );
        // …and ./mergedPullRequestPush.mjs, the merged-pull-request sibling predicate.
        fs.copyFileSync(
            path.resolve(__dirname, '../../../../../buildScripts/util/mergedPullRequestPush.mjs'),
            path.join(tempDir, 'buildScripts/util/mergedPullRequestPush.mjs')
        );
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        fs.rmSync(remoteDir, { recursive: true, force: true });
    });

    const runScript = (cwd = tempDir, env = null) => {
        const result = spawnSync(process.execPath, [testScriptPath], {
            cwd,
            encoding: 'utf-8',
            stdio   : 'pipe',
            ...(env ? {env: {...process.env, ...env}} : {})
        });

        return {
            status: result.status,
            output: `${result.stdout || ''}${result.stderr || ''}`
        }
    };

    /**
     * Puts a fake `gh` first on PATH so the merged-pull-request check is driven by a fixed
     * payload instead of the live GitHub API. Returns the env overlay for `runScript`.
     * @param {String|null} stdout JSON the stub prints; `null` makes the stub exit non-zero,
     *     standing in for offline / unauthenticated / rate-limited.
     */
    const stubGh = (stdout) => {
        const binDir = path.join(tempDir, 'stub-bin');
        fs.mkdirSync(binDir, {recursive: true});

        const ghPath = path.join(binDir, 'gh');
        fs.writeFileSync(
            ghPath,
            stdout === null
                ? '#!/bin/sh\nexit 1\n'
                : `#!/bin/sh\ncat <<'NEO_STUB_EOF'\n${stdout}\nNEO_STUB_EOF\n`,
            {mode: 0o755}
        );

        return {PATH: `${binDir}${path.delimiter}${process.env.PATH}`}
    };

    const blockFetchHeadWrites = () => {
        const fetchHead = path.join(tempDir, '.git', 'FETCH_HEAD');

        fs.rmSync(fetchHead, {recursive: true, force: true});
        fs.mkdirSync(fetchHead)
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

    test('fetch failure continues only when local origin/dev equals the remote coordinate (#16163)', () => {
        execSync('git checkout -b agent/0000-equal-fallback', {cwd: tempDir, stdio: 'ignore'});
        featureCommit();
        blockFetchHeadWrites();

        const
            localDevSha = execFileSync(
                'git',
                ['rev-parse', '--verify', 'refs/remotes/origin/dev'],
                {cwd: tempDir, encoding: 'utf-8'}
            ).trim(),
            result      = runScript();

        expect(result.status).toBe(0);
        expect(result.output).toContain(`matches remote dev at ${localDevSha}`)
    });

    test('fetch failure blocks when local origin/dev is behind the remote coordinate (#16163)', () => {
        const localDevSha = execFileSync(
            'git',
            ['rev-parse', '--verify', 'refs/remotes/origin/dev'],
            {cwd: tempDir, encoding: 'utf-8'}
        ).trim();

        featureCommit('feat(test): advance remote dev');

        const remoteDevSha = execFileSync(
            'git',
            ['rev-parse', 'HEAD'],
            {cwd: tempDir, encoding: 'utf-8'}
        ).trim();

        execFileSync('git', ['push', 'origin', 'dev'], {cwd: tempDir, stdio: 'ignore'});
        execFileSync('git', ['update-ref', 'refs/remotes/origin/dev', localDevSha], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        execFileSync('git', ['checkout', '-b', 'agent/0000-stale-fallback', localDevSha], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        featureCommit();
        blockFetchHeadWrites();

        const result = runScript();

        expect(result.status).toBe(1);
        expect(result.output).toContain('local ref is stale');
        expect(result.output).toContain(localDevSha);
        expect(result.output).toContain(remoteDevSha)
    });

    test('successful fetch updates origin/dev despite a nonstandard configured refspec (#16163)', () => {
        const localDevSha = execFileSync(
            'git',
            ['rev-parse', '--verify', 'refs/remotes/origin/dev'],
            {cwd: tempDir, encoding: 'utf-8'}
        ).trim();

        featureCommit('feat(test): advance remote dev outside the feature branch');

        const remoteDevSha = execFileSync(
            'git',
            ['rev-parse', 'HEAD'],
            {cwd: tempDir, encoding: 'utf-8'}
        ).trim();

        execFileSync('git', ['push', 'origin', 'dev'], {cwd: tempDir, stdio: 'ignore'});
        execFileSync('git', ['update-ref', 'refs/remotes/origin/dev', localDevSha], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        execFileSync('git', ['config', '--unset-all', 'remote.origin.fetch'], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        execFileSync('git', [
            'config',
            '--add',
            'remote.origin.fetch',
            '+refs/heads/main:refs/remotes/origin/main'
        ], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        execFileSync('git', ['checkout', '-b', 'agent/0000-explicit-refspec', localDevSha], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        featureCommit();

        const result          = runScript();
        const refreshedDevSha = execFileSync(
            'git',
            ['rev-parse', '--verify', 'refs/remotes/origin/dev'],
            {cwd: tempDir, encoding: 'utf-8'}
        ).trim();

        expect(result.status).toBe(0);
        expect(refreshedDevSha).toBe(remoteDevSha)
    });

    test('fetch failure blocks when the remote dev coordinate is unavailable (#16163)', () => {
        execFileSync('git', ['checkout', '-b', 'agent/0000-unavailable-remote'], {
            cwd  : tempDir,
            stdio: 'ignore'
        });
        featureCommit();
        execFileSync('git', ['remote', 'set-url', 'origin', path.join(remoteDir, 'missing')], {
            cwd  : tempDir,
            stdio: 'ignore'
        });

        const result = runScript();

        expect(result.status).toBe(1);
        expect(result.output).toContain('remote refs/heads/dev coordinate is unavailable');
        expect(result.output).not.toContain('local ref is stale')
    });

    test.describe('pushes that reach no pull request (#16256)', () => {
        const MERGED_HEAD = 'ddf522a6feb4abf9faf4ad49af110d2a3a5c96b7';

        const mergedPrPayload = JSON.stringify([{
            number    : 16255,
            state     : 'MERGED',
            mergedAt  : '2026-08-01T11:27:27Z',
            headRefOid: MERGED_HEAD
        }]);

        test('warns — and still exits 0 — when the branch PR merged and the head carries unreached commits', () => {
            execFileSync('git', ['checkout', '-b', 'agent/0000-merged-pr'], {cwd: tempDir, stdio: 'ignore'});
            featureCommit('feat(test): a commit that will reach no PR');

            const result = runScript(tempDir, stubGh(mergedPrPayload));

            // Advisory: the whole point is that the push proceeds.
            expect(result.status).toBe(0);
            expect(result.output).toContain('PR #16255');
            expect(result.output).toContain('2026-08-01T11:27:27Z');
            expect(result.output).toContain('reaches no PR and no CI');
            // The author's next question — answered in the same breath.
            expect(result.output).toContain('Your work is not lost');
            expect(result.output).toContain('origin/dev');
            expect(result.output).toContain('advisory')
        });

        test('stays silent on an open pull request — no new noise on the common path', () => {
            execFileSync('git', ['checkout', '-b', 'agent/0000-open-pr'], {cwd: tempDir, stdio: 'ignore'});
            featureCommit();

            const result = runScript(tempDir, stubGh(JSON.stringify([{
                number    : 16264,
                state     : 'OPEN',
                mergedAt  : null,
                headRefOid: MERGED_HEAD
            }])));

            expect(result.status).toBe(0);
            expect(result.output).not.toContain('reaches no PR')
        });

        test('stays silent when the branch never had a pull request', () => {
            execFileSync('git', ['checkout', '-b', 'agent/0000-no-pr'], {cwd: tempDir, stdio: 'ignore'});
            featureCommit();

            const result = runScript(tempDir, stubGh('[]'));

            expect(result.status).toBe(0);
            expect(result.output).not.toContain('reaches no PR')
        });

        test('fails toward pushing when gh cannot answer (offline / unauthenticated / rate-limited)', () => {
            execFileSync('git', ['checkout', '-b', 'agent/0000-gh-down'], {cwd: tempDir, stdio: 'ignore'});
            featureCommit();

            const result = runScript(tempDir, stubGh(null));

            expect(result.status).toBe(0);
            expect(result.output).not.toContain('reaches no PR')
        });

        test('fails toward pushing when gh returns unparseable output', () => {
            execFileSync('git', ['checkout', '-b', 'agent/0000-gh-garbage'], {cwd: tempDir, stdio: 'ignore'});
            featureCommit();

            const result = runScript(tempDir, stubGh('not json at all'));

            expect(result.status).toBe(0);
            expect(result.output).not.toContain('reaches no PR')
        })
    })
});
