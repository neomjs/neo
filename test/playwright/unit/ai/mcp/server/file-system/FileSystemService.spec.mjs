import {test, expect}    from '@playwright/test';
import fs                from 'fs-extra';
import path              from 'path';
import FileSystemService from '../../../../../../../ai/mcp/server/file-system/services/FileSystemService.mjs';

/**
 * @summary Coverage for the file-system MCP server's path handling.
 *
 * Two defects sat in this module for months: a caller-supplied path was interpolated into a shell
 * command string, and the sandbox jail compared with `startsWith`. Both were reachable from the MCP
 * tool surface, which means from any agent. Neither had a test.
 *
 * The first test is the load-bearing one and it is deliberately behavioural rather than structural.
 * Asserting "the source calls execFile" would pass the moment someone writes the right call and say
 * nothing about what the child process receives. Asserting that a path containing a space and a `;`
 * survives as ONE argument distinguishes argv from shell empirically: under argv `node --check`
 * parses that exact file, and under a shell the command splits at the semicolon and fails.
 */
test.describe('ai/mcp/server/file-system FileSystemService', () => {
    const
        root   = path.resolve(process.cwd()),
        tmpDir = path.join(root, 'tmp', `fs-service-spec-${process.pid}`),
        // A space AND a semicolon: the space alone splits argv-vs-shell, the semicolon is what turns
        // a split into command execution. Both are legal in a POSIX filename and both pass the jail.
        hostile = path.join(tmpDir, 'probe ;.mjs');

    test.beforeAll(async () => {
        await fs.ensureDir(tmpDir);
        await fs.writeFile(hostile, 'export const ok = 1;\n', 'utf-8');
    });

    test.afterAll(async () => {
        await fs.remove(tmpDir).catch(() => {});
    });

    test('#15818 a path with shell metacharacters reaches the child as ONE literal argument', async () => {
        // Under argv this is the syntax check of a real, valid file → 'Syntax OK'.
        // Under a shell the command becomes `node --check <dir>/probe ;.mjs`, which checks a
        // non-existent `<dir>/probe` and then tries to run `.mjs` — a different, failing outcome.
        // The assertion therefore cannot pass if the shell ever comes back.
        expect(await FileSystemService.checkSyntax({absolutePath: hostile})).toBe('Syntax OK');
    });

    test('#15818 the jail rejects a sibling directory whose name merely PREFIXES the root', async () => {
        // `startsWith` admitted this: `<root>-evil` begins with `<root>`, so a directory entirely
        // outside the project passed a guard whose whole job was to exclude it.
        await expect(FileSystemService.readFile({absolutePath: `${root}-evil/secrets.txt`}))
            .rejects.toThrow(/403 Forbidden: Path traversal detected/);
    });

    test('#15818 ordinary traversal is still rejected — no regression of the original guard', async () => {
        await expect(FileSystemService.readFile({absolutePath: path.join(root, '..', 'outside.txt')}))
            .rejects.toThrow(/403 Forbidden: Path traversal detected/);
    });

    test('#15818 legitimate in-root paths are still admitted, including the root itself', async () => {
        // The containment fix must narrow what is admitted without rejecting anything real. A path
        // that resolves to the root gives `path.relative` an empty string — the case an
        // `isAbsolute || startsWith('..')` test gets wrong if the empty string is not handled first.
        expect(await FileSystemService.checkSyntax({absolutePath: hostile})).toBe('Syntax OK');

        await expect(FileSystemService.listDirectory({absolutePath: root})).resolves.toBeTruthy();
        await expect(FileSystemService.listDirectory({absolutePath: tmpDir})).resolves.toBeTruthy();
    });

    test('#15818 runPlaywrightTest still refuses a sandboxed path outside test/playwright/', async () => {
        // The directory guard is independent of the argv change and must survive it.
        await expect(FileSystemService.runPlaywrightTest({absolutePath: hostile}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });
});
