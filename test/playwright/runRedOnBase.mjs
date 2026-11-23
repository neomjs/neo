#!/usr/bin/env node
import {execFileSync, spawnSync}                                                    from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path                                                                         from 'node:path';
import {compareRedOnBase, indexReport, redOnBaseSummary, redOnBaseWarnings}         from './compareRedOnBase.mjs';

/**
 * @module test/playwright/runRedOnBase
 * @summary Runs changed head specs twice in an ephemeral CI checkout, restoring only non-test changes between runs.
 */
const root      = process.cwd(),
      artifacts = path.resolve('test/playwright/test-results/red-on-base'),
      git       = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}),
      summarize = text => process.env.GITHUB_STEP_SUMMARY ? appendFileSync(process.env.GITHUB_STEP_SUMMARY, text) : console.log(text);

/**
 * @summary Produces and validates a JSON report even when assertions or spec imports fail.
 * @param {String} label
 * @param {String[]} specs
 * @param {Boolean} [list=false]
 * @returns {Object}
 */
function report(label, specs, list = false) {
    const args = ['node_modules/@playwright/test/cli.js', 'test', '-c', 'test/playwright/playwright.config.unit.mjs',
        '--reporter=json', '--retries=0', '--workers=1', ...list ? ['--list'] : [],
        ...specs.map(file => file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')],
          result = spawnSync(process.execPath, args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}),
          file = path.join(artifacts, `${label}.json`);

    writeFileSync(file, result.stdout || '');
    writeFileSync(path.join(artifacts, `${label}.log`), result.stderr || String(result.error || ''));
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
        indexReport(parsed)
    } catch (error) {
        throw new Error(`${label} did not produce a readable Playwright report (exit ${result.status}): ${error.message}\n${result.stderr}`)
    }
    return parsed
}

/**
 * @summary Isolates spec collection so one unloadable file does not prevent unrelated specs from running.
 * @param {String} label
 * @param {String[]} specs
 * @param {Boolean} [list=false]
 * @returns {Object}
 */
function reports(label, specs, list = false) {
    const combined = {suites: [], errors: [], errorFiles: []};
    specs.forEach((file, index) => {
        const result = report(`${label}-${index}`, [file], list);
        combined.suites.push(...result.suites);
        combined.errors.push(...result.errors);
        if (result.errors.length) combined.errorFiles.push(file)
    });
    writeFileSync(path.join(artifacts, `${label}.json`), JSON.stringify(combined, null, 2));
    return combined
}

/**
 * @summary Uses the actual merge parent, not a moving dev ref, as the source baseline and emits advisory findings.
 * @returns {void}
 */
function run() {
    const parent  = git('rev-parse', 'HEAD^1').trim(),
          changed = git('diff', '--name-only', '--no-renames', '-z', parent, 'HEAD').split('\0').filter(Boolean),
          specs   = changed.filter(file => /^test\/playwright\/unit\/.*\.spec\.mjs$/.test(file) && existsSync(file)),
          source  = changed.filter(file => !file.startsWith('test/')),
          // The base pass pairs the head install with the head lock, so package.json and package-lock.json stay at the
          // head and assertInstallMatchesLock accepts the install; every other non-test path is restored as before.
          kept    = source.filter(file => file === 'package.json' || file === 'package-lock.json'),
          restore = source.filter(file => !kept.includes(file));

    if (!specs.length || !source.length) {
        summarize(`## Red on base\n\nSkipped: ${!specs.length ? 'no added or modified unit specs' : 'no paths outside test/ changed'}.\n`);
        return
    }
    mkdirSync(artifacts, {recursive: true});
    const head    = reports('head', specs),
          baseHas = file => spawnSync('git', ['cat-file', '-e', `${parent}:${file}`], {cwd: root}).status === 0,
          added   = specs.filter(file => !baseHas(file));

    for (const file of restore) {
        if (baseHas(file)) git('restore', `--source=${parent}`, '--worktree', '--', file);
        else rmSync(file, {force: true})
    }
    const base      = reports('base', specs),
          originals = specs.filter(file => !added.includes(file)),
          saved     = new Map(specs.map(file => [file, readFileSync(file)]));
    let original = {suites: [], errors: []};
    try {
        for (const file of originals) writeFileSync(file, execFileSync('git', ['show', `${parent}:${file}`]));
        // Added specs must not be collected while listing the base copy's original titles.
        if (originals.length) {
            try {
                original = reports('original', originals, true)
            } catch (error) {
                // Only head/base report failure is fatal. Failed title discovery cannot justify warnings.
                original = {suites: [], errors: [{message: error.message}], errorFiles: originals}
            }
        }
    } finally {
        for (const [file, contents] of saved) writeFileSync(file, contents)
    }
    const rows = compareRedOnBase(head, base, original, added);
    for (const warning of redOnBaseWarnings(rows)) console.log(warning);
    summarize(redOnBaseSummary(rows));
    summarize(`\nBaseline: ${parent}. Restored ${restore.length} non-test paths; kept head tests` +
        (kept.length ? ` and ${kept.join(' and ')} with the installed dependencies` : '') + '.\n' +
        `Head collection errors: ${head.errors.length}. Base collection errors: ${base.errors.length}. Inspect the retained reports for details.\n`);
    writeFileSync(path.join(artifacts, 'comparison.json'), JSON.stringify(rows, null, 2))
}

try {
    run()
} catch (error) {
    console.error(error.message);
    process.exitCode = 1
}
