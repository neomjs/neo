import {test, expect}  from '@playwright/test';
import {spawnSync}     from 'node:child_process';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __filename = fileURLToPath(import.meta.url),
    repoRoot   = path.resolve(path.dirname(__filename), '../../../../..'),
    run        = (file, args, input) => spawnSync(file, args, {cwd: repoRoot, encoding: 'utf8', input});

test.describe('buildScripts/util/agentsMdPointer', () => {
    test('the clean command an older worktree registers answers the committed pointer from this checkout', () => {
        // Git pipes the whole working copy in: the command must drain it and answer the blob git stores
        const committed = run('git', ['show', 'HEAD:AGENTS.md']).stdout,
              result    = run(process.execPath, ['buildScripts/util/agentsMdPointer.mjs'], 'generated rules\n'.repeat(16384));

        expect(committed.startsWith('<!-- neo-agents-md: pointer -->')).toBe(true);
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(committed)
    })
});
