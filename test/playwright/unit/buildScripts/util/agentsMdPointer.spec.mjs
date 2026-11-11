import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';

import {AGENTS_MD_POINTER}                       from '../../../../../buildScripts/util/agentsMdPointer.mjs';
import {refreshAgentsMd, registerAgentsMdFilter} from '../../../../../buildScripts/util/prepare.mjs';

const
    __filename = fileURLToPath(import.meta.url),
    repoRoot   = path.resolve(path.dirname(__filename), '../../../../..'),
    git        = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8'});

/**
 * @summary `AGENTS.md` is a pointer in git and the generated rules in the working copy: the clean filter that
 * `prepare` registers answers any working copy with the pointer, so `git status` stays clean.
 */
test.describe('buildScripts/util/agentsMdPointer', () => {
    test('the committed AGENTS.md is the pointer', () => {
        // The index, not the working copy: an installed checkout holds the generated rules there
        expect(git(repoRoot, 'show', ':AGENTS.md')).toBe(AGENTS_MD_POINTER);
        expect(git(repoRoot, 'check-attr', 'filter', '--', 'AGENTS.md')).toBe('AGENTS.md: filter: neo-agents-md\n')
    });

    test('generated rules in the working copy leave git clean, and git keeps the pointer', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-md-pointer-'));

        try {
            // The filter command runs the module by its repository path, so the fixture carries it there
            fs.mkdirSync(path.join(root, 'buildScripts/util'), {recursive: true});
            ['agentsMdPointer.mjs', 'isEntryModule.mjs'].forEach(file =>
                fs.copyFileSync(path.join(repoRoot, 'buildScripts/util', file), path.join(root, 'buildScripts/util', file)));
            fs.copyFileSync(path.join(repoRoot, '.gitattributes'), path.join(root, '.gitattributes'));
            fs.writeFileSync(path.join(root, 'AGENTS.md'), AGENTS_MD_POINTER);

            git(root, 'init', '--quiet');
            git(root, 'add', '.');
            git(root, '-c', 'user.name=spec', '-c', 'user.email=spec@example.com', 'commit', '--quiet', '-m', 'pointer');

            expect(registerAgentsMdFilter({root, spawnFn: spawnSync})).toBe(0);

            // Larger than a pipe buffer, so a filter that does not drain stdin would break the write
            fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Generated rules\n' + 'a rule\n'.repeat(20000));

            // Git trusts the changed size until the index reads the file through the filter
            expect(git(root, 'status', '--porcelain')).toBe(' M AGENTS.md\n');

            refreshAgentsMd({root, spawnFn: spawnSync});

            expect(git(root, 'status', '--porcelain')).toBe('');
            expect(git(root, 'diff')).toBe('');

            git(root, 'add', 'AGENTS.md');

            expect(git(root, 'diff', '--cached')).toBe('');
            expect(git(root, 'show', ':AGENTS.md')).toBe(AGENTS_MD_POINTER)
        } finally {
            fs.rmSync(root, {force: true, recursive: true})
        }
    })
});
