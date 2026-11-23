import {spawnSync}    from 'node:child_process';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {test, expect} from '@playwright/test';
import * as yaml      from 'js-yaml';

const
    ROOT       = process.cwd(),
    MODULE_DIR = 'buildScripts/util',
    COMMIT     = 'c40689ef53444ecbb1ee843e2dddb399d131e256',
    folders    = [],
    raw        = fs.readFileSync(path.resolve(ROOT, '.github/workflows/claim-responder.yml'), 'utf8'),
    fetchRun   = String(yaml.load(raw).jobs.respond.steps.find(step => step.name === 'Fetch the reply modules')?.run);

/**
 * @summary Lists the modules the workflow's script imports from the workspace, with every relative import they reach.
 * @returns {String[]} Repository-relative paths, sorted
 */
function importedModules() {
    const
        found = new Set(),
        queue = [...raw.matchAll(/import\(`\$\{process\.env\.GITHUB_WORKSPACE\}\/([^`]+)`\)/g)].map(match => match[1]);

    while (queue.length > 0) {
        const file = queue.pop();

        if (!found.has(file)) {
            found.add(file);

            for (const match of fs.readFileSync(path.resolve(ROOT, file), 'utf8').matchAll(/^import\s[^'"]*['"](\.\.?\/[^'"]+)['"]/gm)) {
                queue.push(path.posix.join(path.posix.dirname(file), match[1]))
            }
        }
    }

    return [...found].sort()
}

/**
 * @summary Runs the fetch step's own shell in an empty folder, with a `gh` stand-in that serves this checkout's files.
 * @param {String} mode What the stand-in does: `serve` the file, answer `empty`, or `fail`
 * @returns {{calls: String[], status: Number, workspace: String}}
 */
function runFetchStep(mode) {
    const
        folder    = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-responder-modules-')),
        bin       = path.join(folder, 'bin'),
        log       = path.join(folder, 'gh-calls.log'),
        workspace = path.join(folder, 'workspace');

    folders.push(folder);
    fs.mkdirSync(bin);
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(folder, 'step.sh'), fetchRun);
    fs.writeFileSync(path.join(bin, 'gh'), [
        '#!/usr/bin/env bash',
        'printf \'%s\\n\' "$*" >> "$GH_STUB_LOG"',
        'url="${@: -1}"',
        'file="${url#repos/neomjs/neo/contents/}"',
        'case "$GH_STUB_MODE" in',
        '    empty) exit 0 ;;',
        '    fail)  exit 1 ;;',
        '    *)     cat "$GH_STUB_ROOT/${file%%\\?*}" ;;',
        'esac',
        ''
    ].join('\n'), {mode: 0o755});

    // The flags GitHub Actions passes to bash for a `run:` step.
    const {status} = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', path.join(folder, 'step.sh')], {
        cwd: workspace,
        env: {
            ...process.env,
            GH_STUB_LOG : log,
            GH_STUB_MODE: mode,
            GH_STUB_ROOT: ROOT,
            PATH        : `${bin}${path.delimiter}${process.env.PATH}`,
            WORKFLOW_SHA: COMMIT
        }
    });

    return {calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [], status, workspace}
}

test.describe('claim-responder rule modules reach the job without a checkout (#21172)', () => {
    test.afterAll(() => {
        folders.forEach(folder => fs.rmSync(folder, {force: true, recursive: true}));
    });

    test('the fetch names every module the script imports, and every module those import', () => {
        const fetched = fetchRun.match(/for module in ([^;]+); do/)[1].trim().split(/\s+/);

        expect(fetched.map(name => `${MODULE_DIR}/${name}`).sort()).toEqual(importedModules());
    });

    test('the step writes each module where the script imports it from, and fails on an empty or refused answer', () => {
        test.skip(process.platform === 'win32', 'the step is a bash script, as on the hosted runner');

        const served = runFetchStep('serve');

        expect(served.status).toBe(0);
        expect(served.calls).toHaveLength(importedModules().length);

        for (const file of importedModules()) {
            expect(fs.readFileSync(path.join(served.workspace, file), 'utf8')).toBe(fs.readFileSync(path.resolve(ROOT, file), 'utf8'));
            expect(served.calls).toContain(`api -H Accept: application/vnd.github.raw repos/neomjs/neo/contents/${file}?ref=${COMMIT}`);
        }

        expect(runFetchStep('empty').status).not.toBe(0);
        expect(runFetchStep('fail').status).not.toBe(0);
    });
});
