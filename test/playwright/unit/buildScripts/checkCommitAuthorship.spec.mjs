import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'fs-extra';
import os              from 'os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    repoRoot  = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
    guardPath = path.join(repoRoot, 'buildScripts/util/check-commit-authorship.mjs');

/**
 * @summary The authorship guard, run against real git repositories rather than a mocked `execSync`.
 *
 * The guard's entire job is reading git's actual answers — which working tree it is in, and who
 * authored what. A suite that stubbed `execSync` would prove only that the guard parses strings the
 * test invented, and the defect it exists to catch (a real worktree silently resolving a real global
 * identity) lives precisely in the part a stub replaces.
 *
 * So these build throwaway repos on disk: a main checkout, and a linked worktree of it.
 */
test.describe('check-commit-authorship — the operator must not author from an agent worktree', () => {
    let tmpRoot;

    const git = (cwd, args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});

    /**
     * @summary Runs the guard in `cwd` with an injected global identity.
     * @param {String} cwd
     * @param {String} globalEmail The operator identity the guard should treat as the leak source.
     * @returns {{status: Number, stderr: String}}
     */
    function runGuard(cwd, globalEmail) {
        // HOME is redirected so the guard reads THIS as `git config --global user.email` rather than
        // the real developer's — the global config is an input to the rule, so the test owns it.
        const home = path.join(tmpRoot, 'home');
        fs.outputFileSync(path.join(home, '.gitconfig'), `[user]\n\temail = ${globalEmail}\n\tname = Operator\n`);

        try {
            execFileSync('node', [guardPath], {cwd, encoding: 'utf8', env: {...process.env, HOME: home}, stdio: ['pipe', 'pipe', 'pipe']});
            return {status: 0, stderr: ''}
        } catch (error) {
            return {status: error.status, stderr: `${error.stderr || ''}`}
        }
    }

    /**
     * @summary A main checkout with an `origin/dev` to measure the push range against.
     * @returns {String} the main checkout path
     */
    function createMainCheckout() {
        const main = path.join(tmpRoot, 'main');

        fs.ensureDirSync(main);
        git(main, ['init', '-b', 'dev', '--quiet']);
        git(main, ['config', 'user.email', 'operator@example.com']);
        git(main, ['config', 'user.name', 'Operator']);
        fs.outputFileSync(path.join(main, 'seed.txt'), 'seed\n');
        git(main, ['add', '.']);
        git(main, ['commit', '-m', 'seed', '--quiet', '--no-verify']);

        // the guard measures `origin/dev..HEAD`; a self-remote gives it a real ref to resolve
        git(main, ['remote', 'add', 'origin', main]);
        git(main, ['fetch', 'origin', '--quiet']);

        return main
    }

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'authorship-guard-'))
    });

    test.afterEach(() => fs.removeSync(tmpRoot));

    test('FIRES on an operator-authored commit in a linked worktree — and names the commit', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);

        // the defect exactly: the worktree sets no identity, so git resolves the operator's global one
        fs.outputFileSync(path.join(tree, 'work.txt'), 'agent work\n');
        git(tree, ['add', '.']);
        git(tree, ['-c', 'user.email=operator@example.com', '-c', 'user.name=Operator',
            'commit', '-m', 'feat: work the agent actually did', '--quiet', '--no-verify']);

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('authored as the operator');
        // naming the commit matters: a count tells nobody which commit to repair
        expect(result.stderr).toContain('feat: work the agent actually did')
    });

    test('SILENT in the operator\'s OWN checkout — his commits there are correct', () => {
        const main = createMainCheckout();

        git(main, ['checkout', '-b', 'agent/lane', '--quiet']);
        fs.outputFileSync(path.join(main, 'work.txt'), 'operator work\n');
        git(main, ['add', '.']);
        git(main, ['commit', '-m', 'feat: operator work', '--quiet', '--no-verify']);

        // The false positive that would make the guard unusable. The main checkout answers
        // `--git-dir` relatively and `--git-common-dir` relatively too, so a naive string compare
        // reports it as linked and blocks every commit the operator makes in his own repo.
        const result = runGuard(main, 'operator@example.com');

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('')
    });

    test('SILENT in a linked worktree that authors correctly — the guard targets identity, not worktrees', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);
        fs.outputFileSync(path.join(tree, 'work.txt'), 'agent work\n');
        git(tree, ['add', '.']);
        git(tree, ['-c', 'user.email=ada@neomjs.com', '-c', 'user.name=Ada',
            'commit', '-m', 'feat: properly attributed work', '--quiet', '--no-verify']);

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(0)
    });

    test('catches an operator commit buried among correctly-authored ones', () => {
        const
            main = createMainCheckout(),
            tree = path.join(tmpRoot, 'wt');

        git(main, ['worktree', 'add', '-b', 'agent/lane', tree, 'dev', '--quiet']);

        // one bad commit in the middle: scanning only HEAD would miss it, and the real incident was
        // 38 commits deep across branches nobody re-read
        [['ada@neomjs.com', 'feat: first'], ['operator@example.com', 'feat: the buried one'], ['ada@neomjs.com', 'feat: third']]
            .forEach(([email, subject], index) => {
                fs.outputFileSync(path.join(tree, `work-${index}.txt`), `${subject}\n`);
                git(tree, ['add', '.']);
                git(tree, ['-c', `user.email=${email}`, '-c', 'user.name=Author', 'commit', '-m', subject, '--quiet', '--no-verify'])
            });

        const result = runGuard(tree, 'operator@example.com');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('1 commit(s)');
        expect(result.stderr).toContain('feat: the buried one');
        expect(result.stderr).not.toContain('feat: first')
    })
});
