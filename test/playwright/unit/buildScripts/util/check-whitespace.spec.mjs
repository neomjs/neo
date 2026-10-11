import { test, expect }  from '@playwright/test';
import { execSync }      from 'node:child_process';
import path              from 'node:path';
import fs                from 'node:fs';
import os                from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const utilDir    = path.resolve(__dirname, '../../../../../buildScripts/util');

/**
 * Self-test for the trailing-whitespace guard, focused on the merge-inheritance boundary.
 *
 * The guard reads the staged set, and a merge stages every file it brings in — including the sync
 * pipeline's content, whose trailing whitespace is CORRECT (markdown hard line breaks) and which the
 * pipeline itself commits with `--no-verify` for exactly that reason. That escape belongs to a
 * trusted CI job; a maintainer inheriting those commits through `git merge origin/dev` has no such
 * hatch, so an inherited file must not be blamed on the merging branch. A file hand-edited during
 * the merge is still authoring and still fails.
 */
test.describe('check-whitespace.mjs — merge inheritance', () => {
    let tempDir, scriptPath;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-ws-test-'));
        execSync('git init', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git config user.name "Test User"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit --allow-empty -m "Init"', { cwd: tempDir, stdio: 'ignore' });

        // The script anchors to the repo that owns it, so it must live inside the temp repo — and it
        // needs its shared helper alongside, exactly as it sits on disk.
        scriptPath = path.join(tempDir, 'buildScripts/util/check-whitespace.mjs');
        fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
        fs.copyFileSync(path.join(utilDir, 'check-whitespace.mjs'), scriptPath);
        fs.copyFileSync(path.join(utilDir, 'mergeInheritance.mjs'), path.join(tempDir, 'buildScripts/util/mergeInheritance.mjs'));

        execSync('git checkout -b dev', { cwd: tempDir, stdio: 'ignore' });
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const runOn = files => {
        try {
            execSync(`node ${scriptPath} ${files.join(' ')}`, { cwd: tempDir, encoding: 'utf-8', stdio: 'pipe' });
            return { status: 0, output: '' };
        } catch (error) {
            return { status: error.status, output: error.stderr || error.stdout || '' };
        }
    };

    const writeFile = (relPath, content) => {
        const full = path.join(tempDir, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
        return relPath;
    };

    // Trailing whitespace as the sync pipeline legitimately produces it: markdown hard line breaks.
    const PIPELINE_CONTENT = 'a line ending in a hard break   \nanother   \n';

    const startMergeCarryingWhitespace = () => {
        execSync('git checkout -b sync-pipeline-source', { cwd: tempDir, stdio: 'ignore' });
        writeFile('resources/content/discussions/d-1.md', PIPELINE_CONTENT);
        execSync('git add -A', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit -m "chore(data): Hourly data sync pipeline update"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git merge --no-commit --no-ff sync-pipeline-source', { cwd: tempDir, stdio: 'ignore' });
    };

    test('an ORDINARY commit still fails on trailing whitespace — the guard is intact', () => {
        writeFile('src/foo.mjs', 'const a = 1;   \n');
        execSync('git add -A', { cwd: tempDir, stdio: 'ignore' });

        const result = runOn(['src/foo.mjs']);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Trailing whitespace found in src/foo.mjs:1');
    });

    test('a merge-INHERITED file passes — the pipeline authored it, this branch did not', () => {
        startMergeCarryingWhitespace();

        expect(runOn(['resources/content/discussions/d-1.md']).status).toBe(0);
    });

    test('a file HAND-EDITED during the merge still fails — authoring in a merge is still authoring', () => {
        startMergeCarryingWhitespace();

        // Different bytes than the merge brought in: this is an edit, so it diverges from MERGE_HEAD.
        writeFile('resources/content/discussions/d-1.md', PIPELINE_CONTENT + 'hand-edited   \n');
        execSync('git add resources/content/discussions/d-1.md', { cwd: tempDir, stdio: 'ignore' });

        const result = runOn(['resources/content/discussions/d-1.md']);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Trailing whitespace found in');
    });

    test('inherited and authored files are judged per-file inside ONE merge', () => {
        startMergeCarryingWhitespace();

        writeFile('src/mine.mjs', 'const b = 2;   \n');
        execSync('git add src/mine.mjs', { cwd: tempDir, stdio: 'ignore' });

        const result = runOn(['resources/content/discussions/d-1.md', 'src/mine.mjs']);

        expect(result.status).toBe(1);
        expect(result.output).toContain('src/mine.mjs');
        expect(result.output).not.toContain('d-1.md');
    });

    test('absolute paths resolve the same as repo-relative ones — lint-staged passes absolute', () => {
        startMergeCarryingWhitespace();

        expect(runOn([path.join(tempDir, 'resources/content/discussions/d-1.md')]).status).toBe(0);
    });

    // NOTE ON WHAT IS *NOT* PINNED HERE. Two obvious-looking witnesses were written and deleted for
    // being vacuous — they passed against the un-fixed helper, so they proved nothing:
    //   · an INHERITED tab-bearing path: absent from the diverged set either way (quoted or not), so
    //     both versions skip it. Same verdict, different reason — it cannot discriminate.
    //   · a Windows-separator candidate: on POSIX `path.sep` IS `/`, so the normalization is an
    //     identity no-op and the assertion cannot fail on this CI. The Win32 arm of
    //     `.split(path.sep).join('/')` is reasoned, not proven — stated in the PR rather than
    //     dressed in a green test.
    // The authored-tab witness below is the real one: it reproduces the fail-open.
    test('a TAB-bearing path AUTHORED during the merge still fails — without -z, git quotes it and the guard SKIPS it', () => {
        execSync('git checkout -b sync-odd-names-2', { cwd: tempDir, stdio: 'ignore' });
        writeFile('resources/content/discussions/tab\there.md', PIPELINE_CONTENT);
        execSync('git add -A', { cwd: tempDir, stdio: 'ignore' });
        execSync('git commit -m "chore(data): Hourly data sync pipeline update"', { cwd: tempDir, stdio: 'ignore' });
        execSync('git checkout dev', { cwd: tempDir, stdio: 'ignore' });
        execSync('git merge --no-commit --no-ff sync-odd-names-2', { cwd: tempDir, stdio: 'ignore' });

        // Diverge it: now it is authored here, quoting or not.
        writeFile('resources/content/discussions/tab\there.md', PIPELINE_CONTENT + 'edited   \n');
        execSync('git add -A', { cwd: tempDir, stdio: 'ignore' });

        const result = runOn(['"resources/content/discussions/tab\there.md"']);

        expect(result.status).toBe(1);
        expect(result.output).toContain('Trailing whitespace found in');
    });

});
