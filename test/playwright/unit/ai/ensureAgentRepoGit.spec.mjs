import {test, expect}        from '@playwright/test';
import {execFileSync}        from 'node:child_process';
import fs                    from 'node:fs';
import os                    from 'node:os';
import path                  from 'node:path';
import {ensureAgentRepo}     from '../../../../ai/services/fleet/ensureAgentRepo.mjs';
import {deriveAgentRepoPath} from '../../../../ai/services/fleet/deriveAgentRepoPath.mjs';

// Integration coverage of the provisioning chain's DEFAULT clone seam — a real `git clone`, the
// production path the unit specs stub out (they inject `cloneRepo`). Exercises clone → reuse → conflict
// against actual git in temp dirs, offline (clones a LOCAL fixture repo, no network). Mirrors
// check-branch-discipline.spec's real-git fixture idiom (mkdtemp + git init + config + commit +
// execFileSync). Asserts the production behaviors the stub cannot: a real `.git` checkout, git creating
// the intermediate `<agent>/` leading dir, reuse not clobbering, and a fail-closed conflict.

let suiteRoot, sourceRepo;

/** Run git in a cwd, output discarded (no shell → no interpolation hazard). */
function git(cwd, ...args) {
    execFileSync('git', args, {cwd, stdio: 'ignore'});
}

/** A fresh managed root per case so the cases never alias a checkout. */
function freshManagedRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-managed-'));
}

test.beforeAll(() => {
    suiteRoot  = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-git-int-'));
    // A real source repo with one commit, to clone FROM — a local path keeps the suite offline + fast.
    sourceRepo = path.join(suiteRoot, 'source');
    fs.mkdirSync(sourceRepo);
    git(sourceRepo, 'init', '-q');
    git(sourceRepo, 'config', 'user.email', 'test@example.com');
    git(sourceRepo, 'config', 'user.name', 'Test User');
    fs.writeFileSync(path.join(sourceRepo, 'README.md'), '# fixture\n');
    git(sourceRepo, 'add', '.');
    git(sourceRepo, 'commit', '-q', '-m', 'init');
});

test.afterAll(() => {
    fs.rmSync(suiteRoot, {recursive: true, force: true});
});

test.describe('ensureAgentRepo — real git clone seam (integration, default un-injected cloneRepo)', () => {
    test('clones an absent repo: real .git checkout + source content, git created the leading dir, cloned:true', async () => {
        const managedRoot = freshManagedRoot();
        try {
            const result = await ensureAgentRepo({managedRoot, agentId: 'agent-a', repoSlug: 'fixture/repo', cloneUrl: sourceRepo});

            expect(result.cloned).toBe(true);
            expect(result.action).toBe('cloned');
            expect(result.repoPath.startsWith(managedRoot + path.sep)).toBe(true);
            // a real checkout: `.git` + the source content. The intermediate `<agent>/` dir (which
            // deriveAgentRepoPath's <root>/<agent>/<repo> layout implies) was created by `git clone`.
            expect(fs.existsSync(path.join(result.repoPath, '.git'))).toBe(true);
            expect(fs.readFileSync(path.join(result.repoPath, 'README.md'), 'utf8')).toContain('# fixture');
        } finally {
            fs.rmSync(managedRoot, {recursive: true, force: true});
        }
    });

    test('re-running over the cloned checkout reuses it — no re-clone clobber', async () => {
        const managedRoot = freshManagedRoot();
        try {
            const first = await ensureAgentRepo({managedRoot, agentId: 'agent-b', repoSlug: 'fixture/repo', cloneUrl: sourceRepo});
            expect(first.cloned).toBe(true);

            // a marker that only survives if the SAME checkout is reused (not re-cloned over)
            const marker = path.join(first.repoPath, '.reuse-marker');
            fs.writeFileSync(marker, 'x');

            const second = await ensureAgentRepo({managedRoot, agentId: 'agent-b', repoSlug: 'fixture/repo', cloneUrl: sourceRepo});
            expect(second.cloned).toBe(false);
            expect(second.action).toBe('reused');
            expect(second.repoPath).toBe(first.repoPath);
            expect(fs.existsSync(marker)).toBe(true);
        } finally {
            fs.rmSync(managedRoot, {recursive: true, force: true});
        }
    });

    test('a foreign occupant at the derived path is a conflict — fail-closed, never clobbered', async () => {
        const managedRoot = freshManagedRoot();
        try {
            const repoPath = deriveAgentRepoPath({managedRoot, agentId: 'agent-c', repoSlug: 'fixture/repo'});
            fs.mkdirSync(repoPath, {recursive: true});
            fs.writeFileSync(path.join(repoPath, 'foreign.txt'), 'do not clobber');

            await expect(ensureAgentRepo({managedRoot, agentId: 'agent-c', repoSlug: 'fixture/repo', cloneUrl: sourceRepo}))
                .rejects.toThrow();

            // the foreign content survived — the chain never clobbered an occupant
            expect(fs.readFileSync(path.join(repoPath, 'foreign.txt'), 'utf8')).toBe('do not clobber');
        } finally {
            fs.rmSync(managedRoot, {recursive: true, force: true});
        }
    });
});
