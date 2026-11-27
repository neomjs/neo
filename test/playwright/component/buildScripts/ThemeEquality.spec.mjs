import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    evaluateExpectedDiffs,
    runThemeEquality
} from '../../../../buildScripts/util/theme-equality.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)),
      REPO_ROOT = path.resolve(__dirname, '../../../..'),
      DIST_CSS  = path.join(REPO_ROOT, 'dist/development/css');

/**
 * @summary End-to-end headless Chromium verification of `runThemeEquality`:
 * 1. Two independent copies of the same built CSS tree report zero differences across all 5 themes.
 * 2. Mutating one component variable (`--button-primary-background-color-hover`) in one theme (`theme-neo-light`)
 *    reports solely `button[primary]` in `neo-theme-neo-light` at `hover` on `background-color`, and nothing else.
 * 3. Declaring that difference in `expected` passes, whereas declaring an extra difference that did not occur fails.
 */
test.describe('theme-equality headless Chromium integration', () => {
    const tempDirs = [];

    function copyBuiltTree() {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-eq-e2e-'));
        tempDirs.push(dir);
        fs.cpSync(DIST_CSS, path.join(dir, 'css'), {recursive: true});
        fs.copyFileSync(path.join(REPO_ROOT, 'resources/theme-map.json'), path.join(dir, 'theme-map.json'));
        return path.join(dir, 'css')
    }

    test.afterAll(() => {
        tempDirs.forEach(dir => fs.rmSync(dir, {force: true, recursive: true}))
    });

    test('reports zero differences on two builds of the same commit across all five themes', async () => {
        test.setTimeout(90000);

        const baseCopy = copyBuiltTree(),
              headCopy = copyBuiltTree(),
              result   = await runThemeEquality({base: baseCopy, head: headCopy, repoRoot: REPO_ROOT});

        expect(result.ok).toBe(true);
        expect(result.diffs).toEqual([]);
        expect(result.unexpectedDiffs).toEqual([]);
        expect(result.totalComparisons).toBeGreaterThan(5000)
    });

    test('isolates a single component variable mutation in one theme and enforces expected-diff rules', async () => {
        test.setTimeout(90000);

        const baseCopy   = copyBuiltTree(),
              headCopy   = copyBuiltTree(),
              targetFile = path.join(headCopy, 'theme-neo-light/button/Base.css'),
              original   = fs.readFileSync(targetFile, 'utf8'),
              mutated    = original.replace(
                  /--button-primary-background-color-hover\s*:\s*[^;]+;/,
                  '--button-primary-background-color-hover: rgb(251, 13, 199);'
              );

        expect(mutated).not.toBe(original);
        fs.writeFileSync(targetFile, mutated);

        // Undeclared mutation fails and names solely the affected component, theme, state, and property
        const undeclaredRun = await runThemeEquality({base: baseCopy, head: headCopy, repoRoot: REPO_ROOT});

        expect(undeclaredRun.ok).toBe(false);
        expect(undeclaredRun.diffs).toEqual([{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            property : 'background-color',
            part     : '.neo-button',
            base     : expect.any(String),
            head     : 'rgb(251, 13, 199)'
        }]);

        // Declaring the exact expected diff passes; declaring a non-existent expected diff fails
        const passingVerdict = evaluateExpectedDiffs(undeclaredRun.diffs, [{
            component: 'button[primary]',
            theme    : 'neo-theme-neo-light',
            state    : 'hover',
            property : 'background-color'
        }]);
        expect(passingVerdict.ok).toBe(true);

        const unmetVerdict = evaluateExpectedDiffs(undeclaredRun.diffs, [
            {
                component: 'button[primary]',
                theme    : 'neo-theme-neo-light',
                state    : 'hover',
                property : 'background-color'
            },
            {
                component: 'button',
                theme    : 'neo-theme-neo-dark',
                state    : 'active',
                property : 'color'
            }
        ]);
        expect(unmetVerdict.ok).toBe(false);
        expect(unmetVerdict.unmetExpected).toHaveLength(1)
    })
});
