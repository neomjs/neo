import {test, expect}                            from '@playwright/test';
import {spawnSync}                               from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync}        from 'node:fs';
import path                                      from 'node:path';
import process                                   from 'node:process';
import {fileURLToPath}                           from 'node:url';
import {ESCAPE_MARKER, findWriteThenRenamePairs} from '../../../../../../buildScripts/util/check-atomic-write-shape.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * @summary Self-test for the write-temp-then-rename shape guard.
 *
 * The guard exists because the obvious predicate — grep for `rename` — is wrong in FOUR directions
 * at once, and each direction is a real caller in this repo. The negative tests below are therefore
 * the load-bearing ones: a guard that flags a log rotation, a file relocation, or a directory-rename
 * mutex gets switched off, and a switched-off guard protects nothing.
 */
test.describe('check-atomic-write-shape guard', () => {
    test('flags the PAIR: a name written to, then renamed away', () => {
        const source = [
            "const tmpPath = `${filePath}.tmp`;",
            "await writeFile(tmpPath, body, 'utf8');",
            'await rename(tmpPath, filePath);'
        ].join('\n');

        expect(findWriteThenRenamePairs(source).map(hit => hit.line)).toEqual([3])
    });

    test('flags every call spelling, including a DESTRUCTURED rename import', () => {
        // The destructured form is why this guard exists rather than a verb grep: `\.rename\(` never
        // matched `await rename(tmp, file)`, and four real sites hid behind exactly that.
        const shapes = [
            "writeFileSync(t, b); renameSync(t, f);",
            "fs.outputJsonSync(t, b);\nfs.renameSync(t, f);",
            "await fsModule.writeFile(t, b);\nawait fsModule.rename(t, f);",
            "await writeFile(t, b);\nawait rename(t, f);"
        ];

        shapes.forEach(source => expect(findWriteThenRenamePairs(source).length, source).toBeGreaterThan(0))
    });

    test('does NOT flag LOG ROTATION — a move of an existing file, no scratch', () => {
        expect(findWriteThenRenamePairs('fs.renameSync(logFile, `${logFile}.${fileDay}`);')).toEqual([])
    });

    test('does NOT flag a plain RELOCATION', () => {
        expect(findWriteThenRenamePairs('await fs.rename(oldAbsolutePath, targetPath);')).toEqual([])
    });

    /*
     * The subtlest negative. lifecycleGuard writes a file INSIDE a staging directory and renames the
     * DIRECTORY — the rename failing is the mutual exclusion. The written name and the renamed name
     * are different, so the pair predicate stays silent where a verb predicate would fire.
     */
    test('does NOT flag the directory-rename MUTEX', () => {
        const source = [
            'await fsModule.mkdir(stagingPath);',
            "await fsModule.writeFile(path.join(stagingPath, ownerFileName), '', 'utf8');",
            'await fsModule.rename(stagingPath, guardPath);'
        ].join('\n');

        expect(findWriteThenRenamePairs(source)).toEqual([])
    });

    test('does NOT flag a pair that lives in a string or a comment', () => {
        expect(findWriteThenRenamePairs([
            "const generated = 'await fs.writeFile(tmpPath, x);';",
            "const more = 'await fs.rename(tmpPath, envelopePath);';"
        ].join('\n'))).toEqual([]);

        expect(findWriteThenRenamePairs([
            '// await writeFile(tmpPath, x);',
            '// await rename(tmpPath, filePath);'
        ].join('\n'))).toEqual([])
    });

    /*
     * @neo-gpt's re-review found the first version blind in three ways at once, and all three shared
     * one root: it matched line by line against a fixed list of fs write functions, so its vocabulary
     * was mistaken for the population. A clean run meant "nothing I can see".
     */
    test('MULTILINE: ordinary formatting is not a bypass', () => {
        expect(findWriteThenRenamePairs([
            'await writeFile(tmpPath, body);',
            'await fs.rename(',
            '    tmpPath,',
            '    filePath',
            ');'
        ].join('\n')).length, 'wrapped rename arguments must still be seen').toBe(1);

        expect(findWriteThenRenamePairs([
            'await fs.writeFile(',
            '    tmpPath,',
            '    body',
            ');',
            'await fs.rename(tmpPath, filePath);'
        ].join('\n')).length, 'a wrapped WRITE must still register the scratch').toBe(1)
    });

    test('a CUSTOM writer counts — the scratch does not have to be written by an fs function', () => {
        // `receiverState._replace` writes through `this._writeSynced(tempPath, record)`. A fixed
        // fs-function list never had it, so a live pair sat outside the census.
        expect(findWriteThenRenamePairs([
            'await this._writeSynced(tempPath, record);',
            'await fs.rename(tempPath, recordPath);'
        ].join('\n')).length).toBe(1)
    });

    test('a HANDLE-based write counts — the scratch is created by open(), then written through the handle', () => {
        // `buildReceiverManifest` and `offHostSyncStore` never pass the scratch NAME to a write call
        // at all; it reaches `open()` and everything after goes through the returned handle.
        expect(findWriteThenRenamePairs([
            "const handle = await fs.open(stagingPath, 'wx', 0o600);",
            'await handle.writeFile(body);',
            'await fs.rename(stagingPath, targetPath);'
        ].join('\n')).length).toBe(1)
    });

    test('honors the escape marker on the rename line', () => {
        const source = [
            'await writeFile(tmpPath, body);',
            `await rename(tmpPath, filePath); // ${ESCAPE_MARKER}: assertHeld() must fence between write and rename`
        ].join('\n');

        expect(findWriteThenRenamePairs(source)).toEqual([])
    });

    test('CLI: a hand-rolled pair fails the build', () => {
        const checker    = path.join(repoRoot, 'buildScripts/util/check-atomic-write-shape.mjs'),
              fixtureDir = path.join(repoRoot, `ai/.tmp-atomic-shape-${process.pid}`);

        mkdirSync(fixtureDir, {recursive: true});

        const fixture = path.join(fixtureDir, 'fixture.mjs'),
              rel     = path.relative(repoRoot, fixture).split(path.sep).join('/');

        try {
            writeFileSync(fixture, "await writeFile(tmpPath, body);\nawait rename(tmpPath, filePath);\n");

            const result = spawnSync(process.execPath, [checker, rel], {cwd: repoRoot, encoding: 'utf-8'});

            expect(result.status, 'a hand-rolled pair must fail the build').toBe(1);
            expect(result.stderr).toContain('write-temp-then-rename');
            expect(result.stdout).not.toContain('0 hand-rolled pairs')
        } finally {
            rmSync(fixtureDir, {recursive: true, force: true})
        }
    });

    test('CLI: the live ai/ tree is clean — the migration is complete, not merely started', () => {
        const checker = path.join(repoRoot, 'buildScripts/util/check-atomic-write-shape.mjs'),
              result  = spawnSync(process.execPath, [checker], {cwd: repoRoot, encoding: 'utf-8'});

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('0 hand-rolled pairs')
    });
});
