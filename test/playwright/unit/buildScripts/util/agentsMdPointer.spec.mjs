import {test, expect}  from '@playwright/test';
import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {AGENTS_MD_POINTER}                             from '../../../../../buildScripts/util/agentsMdPointer.mjs';
import {ensureAgentsMdFilter, refreshAgentsMd, runGit} from '../../../../../buildScripts/util/prepare.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    repoRoot   = path.resolve(path.dirname(__filename), '../../../../..'),
    git        = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8'}),
    gitIn      = root => args => runGit(root, args),
    generated  = '# Generated rules\n' + 'a rule\n'.repeat(20000),
    roots      = [];

/**
 * @summary A checkout holding the committed pointer, the `.gitattributes` line and the pointer module at its
 * repository path, which the filter command runs. No filter is registered yet.
 * @returns {String}
 */
function checkout() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-pointer-'));

    roots.push(root);
    fs.mkdirSync(path.join(root, 'buildScripts/util'), {recursive: true});
    ['agentsMdPointer.mjs', 'isEntryModule.mjs'].forEach(file =>
        fs.copyFileSync(path.join(repoRoot, 'buildScripts/util', file), path.join(root, 'buildScripts/util', file)));
    fs.copyFileSync(path.join(repoRoot, '.gitattributes'), path.join(root, '.gitattributes'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), AGENTS_MD_POINTER);

    git(root, 'init', '--quiet');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'commit', '--quiet', '-m', 'pointer');

    return root
}

const indexHoldsPointer = root => git(root, 'show', ':AGENTS.md') === AGENTS_MD_POINTER;

/**
 * @summary `AGENTS.md` is a pointer in git and the generated rules in the working copy. The required clean
 * filter answers any working copy with the pointer, and no step of the stage ever writes file content to the index.
 */
test.describe('buildScripts/util/agentsMdPointer', () => {
    test.afterAll(() => roots.forEach(root => fs.rmSync(root, {force: true, recursive: true})));

    test('the committed AGENTS.md is the pointer', () => {
        // The index, not the working copy: an installed checkout holds the generated rules there
        expect(git(repoRoot, 'show', ':AGENTS.md')).toBe(AGENTS_MD_POINTER);
        expect(git(repoRoot, 'check-attr', 'filter', '--', 'AGENTS.md')).toBe('AGENTS.md: filter: neo-agents-md\n')
    });

    test('with the filter registered, generated rules leave git clean and git keeps the pointer', () => {
        const root = checkout();

        expect(ensureAgentsMdFilter({root, git: gitIn(root)})).toBe('registered');

        // Larger than a pipe buffer, so a filter that does not drain stdin would break the write
        fs.writeFileSync(path.join(root, 'AGENTS.md'), generated);

        // Git trusts the changed size until the index reads the file through the filter
        expect(git(root, 'status', '--porcelain')).toBe(' M AGENTS.md\n');

        refreshAgentsMd({root, git: gitIn(root)});

        expect(git(root, 'status', '--porcelain')).toBe('');
        expect(git(root, 'diff')).toBe('');

        git(root, 'add', 'AGENTS.md');

        expect(git(root, 'diff', '--cached')).toBe('');
        expect(indexHoldsPointer(root)).toBe(true)
    });

    test('without a filter, the refresh stages nothing: the index keeps the pointer and git shows the change', () => {
        const root = checkout();

        fs.writeFileSync(path.join(root, 'AGENTS.md'), generated);
        refreshAgentsMd({root, git: gitIn(root)});

        expect(indexHoldsPointer(root), 'before any git add').toBe(true);
        expect(git(root, 'status', '--porcelain')).toBe(' M AGENTS.md\n')
    });

    test('a filter that cannot be registered throws before anything is written', () => {
        const root = checkout();

        // A concurrent writer holds the config lock, so `git config` cannot write
        fs.writeFileSync(path.join(root, '.git/config.lock'), '');

        expect(() => ensureAgentsMdFilter({root, git: gitIn(root)})).toThrow(/cannot register filter\.neo-agents-md\.clean, filter\.neo-agents-md\.smudge, and filter\.neo-agents-md\.required/);
        expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toBe(AGENTS_MD_POINTER);
        expect(indexHoldsPointer(root)).toBe(true)
    });

    test('a filter registered earlier is found while the config lock is held', () => {
        const root = checkout();

        ensureAgentsMdFilter({root, git: gitIn(root)});
        fs.writeFileSync(path.join(root, '.git/config.lock'), '');

        expect(ensureAgentsMdFilter({root, git: gitIn(root)})).toBe('present')
    });

    test('with the filter registered, a checkout writes the pointer: a new worktree is clean', () => {
        const root  = checkout(),
              trees = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-worktree-'));

        roots.push(trees);
        ensureAgentsMdFilter({root, git: gitIn(root)});

        git(root, 'worktree', 'add', '--quiet', '--detach', path.join(trees, 'with-smudge'), 'HEAD');

        expect(fs.readFileSync(path.join(trees, 'with-smudge/AGENTS.md'), 'utf8')).toBe(AGENTS_MD_POINTER);
        expect(git(path.join(trees, 'with-smudge'), 'status', '--porcelain')).toBe('');

        // The control: required, with no smudge, fails every write of the file into a working tree
        git(root, 'config', '--local', '--unset', 'filter.neo-agents-md.smudge');

        expect(runGit(root, ['worktree', 'add', '--detach', path.join(trees, 'without-smudge'), 'HEAD']).status).not.toBe(0);
        expect(fs.existsSync(path.join(trees, 'without-smudge/AGENTS.md'))).toBe(false)
    });

    test('a registered filter that cannot run refuses to store the file, and the refresh says so', () => {
        const root = checkout();

        ensureAgentsMdFilter({root, git: gitIn(root)});
        // The command fails as it would with no node on git's PATH
        git(root, 'config', '--local', 'filter.neo-agents-md.clean', 'false');
        fs.writeFileSync(path.join(root, 'AGENTS.md'), generated);

        expect(() => refreshAgentsMd({root, git: gitIn(root)})).toThrow(/git could not run the neo-agents-md filter/);
        expect(runGit(root, ['add', 'AGENTS.md']).status, 'a required filter refuses, never passes raw content through').not.toBe(0);
        expect(indexHoldsPointer(root)).toBe(true)
    })
});
