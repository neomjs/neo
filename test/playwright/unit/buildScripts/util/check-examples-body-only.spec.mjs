import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import path           from 'node:path';

// The Playwright unit runner executes with cwd = repo root, so resolve against it rather than
// __dirname arithmetic — the latter is brittle across nesting depth and git-worktree layouts.
const
    repoRoot   = process.cwd(),
    scriptPath = path.join(repoRoot, 'buildScripts/util/check-examples-body-only.mjs'),
    fixtureDir = path.join(repoRoot, 'examples', '__check_examples_body_only_fixture__');

/**
 * Writes throwaway files under a dedicated `examples/` fixture dir, runs the guard as a subprocess,
 * then removes the fixture dir (one recursive remove, even if the assertion throws).
 *
 * @param {Object<String,String>} files Map of path-relative-to-fixtureDir -> file contents.
 * @returns {{exitCode:number, output:string}}
 */
function runWithFixture(files) {
    let exitCode = 0,
        output   = '';

    try {
        for (const [rel, content] of Object.entries(files)) {
            const abs = path.join(fixtureDir, rel);
            fs.mkdirSync(path.dirname(abs), {recursive: true});
            fs.writeFileSync(abs, content);
        }

        output = execFileSync('node', [scriptPath], {cwd: repoRoot, encoding: 'utf8'});
    } catch (err) {
        exitCode = err.status;
        output   = (err.stdout || '') + (err.stderr || '');
    } finally {
        fs.rmSync(fixtureDir, {recursive: true, force: true});
    }

    return {exitCode, output};
}

/**
 * @summary CI guard test for `buildScripts/util/check-examples-body-only.mjs`.
 *
 * Verifies the guard distinguishes the clean Body-only tree from each misplacement class `build-all`
 * chokes on: an `app.mjs` build target missing `neo-config.json`, and an example importing from `ai/`.
 * A conforming Body fixture (`app.mjs` + `neo-config.json`, no `ai/` import) confirms no false positive.
 * Each case plants throwaway fixtures under `examples/`, runs the guard as a subprocess, asserts, cleans up.
 *
 * @see buildScripts/util/check-examples-body-only.mjs
 */
// `describe.serial` is REQUIRED: fixtures planted on-disk under `examples/` would otherwise leak across
// Playwright's parallel workers (fullyParallel default), racing the clean-tree PASS test against
// another worker's planted fixture.
test.describe.serial('check-examples-body-only CI guard', () => {
    test.afterEach(() => fs.rmSync(fixtureDir, {recursive: true, force: true}));

    test('exits 0 (PASS) on the current clean Body-only tree', () => {
        // The committed examples/ tree must be Body-only after the harness-benchmark relocation.
        const result = execFileSync('node', [scriptPath], {cwd: repoRoot, encoding: 'utf8'});
        expect(result).toContain('PASS');
    });

    test('exits 1 (FAIL) on an app.mjs build target missing neo-config.json', () => {
        const {exitCode, output} = runWithFixture({
            'vanillaComparator/app.mjs'   : 'document.body.innerHTML = "vanilla";\n',
            'vanillaComparator/index.html': '<!doctype html>\n'
        });

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('missing neo-config.json');
        expect(output).toContain('ai/examples/');
    });

    test('exits 1 (FAIL) on an app.mjs build target missing index.html', () => {
        // createStartingPoint reads index.html unconditionally too, so a build target with
        // neo-config.json but no index.html is still a build-all breakage class.
        const {exitCode, output} = runWithFixture({
            'noIndexApp/app.mjs'        : "import Viewport from '../../../src/container/Viewport.mjs';\nexport default Viewport;\n",
            'noIndexApp/neo-config.json': '{}\n'
        });

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('missing index.html');
    });

    test('exits 1 (FAIL) on an example importing from ai/', () => {
        const {exitCode, output} = runWithFixture({
            'harnessProbe/app.mjs'        : "import x from '../../../ai/services/Probe.mjs';\nexport default x;\n",
            'harnessProbe/neo-config.json': '{}\n',
            'harnessProbe/index.html'     : '<!doctype html>\n'
        });

        expect(exitCode).toBe(1);
        expect(output).toContain('FAIL');
        expect(output).toContain('importing from ai/');
    });

    test('exits 0 (PASS) for a conforming Body example fixture — no false positive', () => {
        const {exitCode, output} = runWithFixture({
            'goodBodyExample/app.mjs'        : "import Viewport from '../../../src/container/Viewport.mjs';\nexport default Viewport;\n",
            'goodBodyExample/neo-config.json': '{}\n',
            'goodBodyExample/index.html'     : '<!doctype html>\n'
        });

        expect(exitCode).toBe(0);
        expect(output).toContain('PASS');
    });
});
