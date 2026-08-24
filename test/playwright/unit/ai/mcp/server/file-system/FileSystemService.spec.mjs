import {test, expect}    from '@playwright/test';
import fs                from 'fs-extra';
import os                from 'os';
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
        root        = path.resolve(process.cwd()),
        suiteRoot   = path.join(root, 'test', 'playwright'),
        suiteTmpDir = path.join(suiteRoot, `.fs-service-spec-${process.pid}`),
        tmpDir      = path.join(root, 'tmp', `fs-service-spec-${process.pid}`),
        falseSuite  = path.join(tmpDir, 'atest', 'playwright'),
        falseSpec   = path.join(falseSuite, 'probe.spec.mjs'),
        inSuiteSpec = path.join(
            suiteRoot,
            'unit',
            'ai',
            'mcp',
            'server',
            'file-system',
            'toolServiceDispatch.spec.mjs'
        ),
        aliasInSuite = path.join(suiteTmpDir, 'outside-alias'),
        // A space AND a semicolon: the space alone splits argv-vs-shell, the semicolon is what turns
        // a split into command execution. Both are legal in a POSIX filename and both pass the jail.
        hostile      = path.join(tmpDir, 'probe ;.mjs');

    test.beforeAll(async () => {
        await fs.ensureDir(tmpDir);
        await fs.ensureDir(falseSuite);
        await fs.ensureDir(suiteTmpDir);
        await fs.writeFile(hostile, 'export const ok = 1;\n', 'utf-8');
        await fs.writeFile(falseSpec, 'export const outsideSuite = true;\n', 'utf-8');
        await fs.symlink(tmpDir, aliasInSuite, 'dir');
    });

    test.afterAll(async () => {
        await fs.remove(suiteTmpDir).catch(() => {});
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

    /**
     * @summary The guard message must describe what it ENFORCES, not a containment we do not have.
     *
     * It read "Operation jailed to <root>". The jail binds this ARGUMENT; it does not bind the
     * process. `run_playwright_test` executes a spec, a spec is arbitrary JavaScript, and its read
     * set is the whole host — so `write_file` plus `run_playwright_test` reaches outside the root
     * without either call violating a guard, reported externally and reproduced from source.
     *
     * A false boundary is worse than a stated absence of one, because it is trusted. This arm exists
     * so the stronger wording cannot come back without someone deciding to bring it back.
     */
    test('#16481: the message scopes the jail to the ARGUMENT and names execution as unjailed', async () => {
        const attempt = FileSystemService.readFile({absolutePath: '/tmp/OUTSIDE_SECRET.txt'});

        await expect(attempt).rejects.toThrow(/This ARGUMENT is jailed to/);
        await expect(attempt).rejects.toThrow(/execution tools are not/);
        // The claim this ticket exists to remove: a promise of operation-wide containment.
        await expect(attempt).rejects.not.toThrow(/Operation jailed to/);
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

    test('#15818 an in-root SYMLINK to an outside directory is rejected — lexical containment is not canonical', async () => {
        // The escape @neo-gpt-emmy executed against the prior head: `path.resolve`/`path.relative`
        // normalize SEGMENTS, they do not dereference symlinks. An in-root alias pointing outside
        // spells perfectly in-root, so the lexical check answered "is this path spelled inside the
        // root" when the contract is "is the object this reaches inside the root".
        const
            outsideDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-service-outside-')),
            sentinel    = path.join(outsideDir, 'sentinel.txt'),
            aliasInRoot = path.join(tmpDir, 'alias');

        await fs.writeFile(sentinel, 'OUTSIDE-SECRET\n', 'utf-8');
        await fs.symlink(outsideDir, aliasInRoot, 'dir');

        try {
            await expect(FileSystemService.readFile({absolutePath: path.join(aliasInRoot, 'sentinel.txt')}))
                .rejects.toThrow(/403 Forbidden: Path traversal detected/);

            // The sentinel must be untouched AND unread — the guard has to fire before any fs call.
            expect(await fs.readFile(sentinel, 'utf-8')).toBe('OUTSIDE-SECRET\n');
        } finally {
            await fs.remove(aliasInRoot).catch(() => {});
            await fs.remove(outsideDir).catch(() => {});
        }
    });

    test('#15818 a NOT-YET-EXISTING write target under a symlinked-outside parent is rejected', async () => {
        // The create case: `fs.realpath` cannot canonicalize a file that does not exist yet, so the
        // guard canonicalizes the deepest EXISTING ancestor. That is the security-relevant part —
        // a create target can only escape through a parent that already exists and already points out.
        const
            outsideDir  = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-service-outside-w-')),
            aliasInRoot = path.join(tmpDir, 'alias-w');

        await fs.symlink(outsideDir, aliasInRoot, 'dir');

        try {
            await expect(FileSystemService.writeFile({
                absolutePath: path.join(aliasInRoot, 'implanted.txt'),
                content     : 'should never land'
            })).rejects.toThrow(/403 Forbidden: Path traversal detected/);

            // Nothing was created outside the root.
            expect(await fs.pathExists(path.join(outsideDir, 'implanted.txt'))).toBe(false);
        } finally {
            await fs.remove(aliasInRoot).catch(() => {});
            await fs.remove(outsideDir).catch(() => {});
        }
    });

    test('#15818 an INDETERMINATE canonical resolution fails closed, classified as a refusal', async () => {
        // The third state. Contained and outside are both verdicts; "could not establish" is not,
        // and it must be refused rather than surfaced as a raw fs error. A bare EACCES reads to a
        // caller — and to an agent reading the tool result — as an I/O problem worth retrying, when
        // the truth is the jail could not answer. Unproven containment is not permission.
        const
            locked = path.join(tmpDir, 'locked'),
            inner  = path.join(locked, 'inner');

        await fs.ensureDir(inner);
        await fs.writeFile(path.join(inner, 'f.txt'), 'x\n', 'utf-8');
        await fs.chmod(locked, 0o000);   // canonical resolution cannot proceed past this ancestor

        try {
            const attempt = FileSystemService.readFile({absolutePath: path.join(inner, 'f.txt')});

            // Classified as a containment refusal — NOT a bare EACCES escaping under its own name.
            await expect(attempt).rejects.toThrow(/403 Forbidden: Canonical containment could not be established/);
            await expect(attempt).rejects.toThrow(/NOT a verdict that the path is safe/);
        } finally {
            await fs.chmod(locked, 0o755).catch(() => {});
        }
    });

    test('#15818 a DANGLING in-root alias is not "not yet created" — the write must not follow it out', async () => {
        // @neo-gpt-emmy's cycle-3 falsifier, reproduced: `realpath` returns ENOENT for TWO states —
        // the entry is absent, or the entry EXISTS as a symlink whose target is missing. Collapsing
        // them treated a dangling alias as a create target, and `writeFile` FOLLOWED it: the file
        // landed outside the root. `lstat` distinguishes them because it reports on the link itself.
        const
            outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-service-dangling-')),
            dest       = path.join(outsideDir, 'implanted.txt'),   // deliberately does NOT exist
            alias      = path.join(tmpDir, 'dangling.txt');

        await fs.symlink(dest, alias);   // the link exists; its target does not

        try {
            await expect(FileSystemService.writeFile({absolutePath: alias, content: 'ESCAPED'}))
                .rejects.toThrow(/403 Forbidden/);

            expect(await fs.pathExists(dest)).toBe(false);   // nothing landed outside the root
        } finally {
            await fs.remove(alias).catch(() => {});
            await fs.remove(outsideDir).catch(() => {});
        }
    });

    test('#15818 a dangling alias pointing INSIDE the root is still a legitimate create target', async () => {
        // The narrowing must not break real work: a dangling link whose target resolves in-root is
        // an ordinary create. Rejecting it would make the guard reject writes it should allow.
        const
            inRootDest = path.join(tmpDir, 'not-yet-there.txt'),
            alias      = path.join(tmpDir, 'inner-dangling.txt');

        await fs.symlink(inRootDest, alias);

        try {
            expect(await FileSystemService.writeFile({absolutePath: alias, content: 'fine\n'})).toBe('success');
            expect(await fs.readFile(inRootDest, 'utf-8')).toBe('fine\n');
        } finally {
            await fs.remove(alias).catch(() => {});
            await fs.remove(inRootDest).catch(() => {});
        }
    });

    test('#15818 legitimate creates and in-root symlinks still work — the jail narrowed, it did not close', async () => {
        // Canonicalization must not break the ordinary cases: creating a new file, and following a
        // symlink that stays inside the root. A guard that rejects real work gets switched off.
        const newFile = path.join(tmpDir, 'freshly-created.txt');

        expect(await FileSystemService.writeFile({absolutePath: newFile, content: 'ok\n'})).toBe('success');
        expect((await FileSystemService.readFile({absolutePath: newFile})).content).toBe('ok\n');

        const innerAlias = path.join(tmpDir, 'inner-alias');
        await fs.symlink(tmpDir, innerAlias, 'dir');

        try {
            // Reaches an in-root object through an in-root alias — canonically contained, so admitted.
            expect((await FileSystemService.readFile({absolutePath: path.join(innerAlias, 'freshly-created.txt')})).content)
                .toBe('ok\n');
        } finally {
            await fs.remove(innerAlias).catch(() => {});
        }
    });

    test('#15818 runPlaywrightTest still refuses a sandboxed path outside test/playwright/', async () => {
        // The directory guard is independent of the argv change and must survive it.
        await expect(FileSystemService.runPlaywrightTest({absolutePath: hostile}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });

    test('#16508 a substring-shaped path outside the Playwright suite is refused', async () => {
        // The old guard admitted this exact shape: `/atest/playwright/` contains the literal
        // `test/playwright/`, even though the canonical file is nowhere inside the suite root.
        await expect(FileSystemService.runPlaywrightTest({absolutePath: falseSpec}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });

    test('#16508 a legitimate spec inside the Playwright suite still crosses the guard', async () => {
        const result = await FileSystemService.runPlaywrightTest({absolutePath: inSuiteSpec});

        // The runner outcome is deliberately not asserted here: this method currently invokes the
        // generic Playwright CLI, whose config contract belongs to a different ticket. Either result
        // proves the suite guard admitted the canonical in-suite path instead of refusing everything.
        expect(result).toMatch(/^Test (?:Passed|Failed):/);
    });

    test('#16508 traversal that normalizes outside the Playwright suite is refused', async () => {
        const traversal = [suiteRoot, '..', '..', path.relative(root, hostile)].join(path.sep);

        await expect(FileSystemService.runPlaywrightTest({absolutePath: traversal}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });

    test('#16508 an in-suite symlink resolving outside the Playwright suite is refused', async () => {
        await expect(FileSystemService.runPlaywrightTest({absolutePath: path.join(aliasInSuite, path.basename(hostile))}))
            .rejects.toThrow(/403 Forbidden: Can only execute Playwright specs/);
    });
});
