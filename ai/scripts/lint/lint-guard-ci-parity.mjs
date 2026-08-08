#!/usr/bin/env node
/**
 * @summary Requires every `lint-staged` guard to be invoked by some CI workflow, or to carry an
 * explicit registry entry saying why it is client-only. A guard nobody mirrors is bypassed by
 * `git commit --no-verify` with nothing downstream.
 *
 * ## The rule, and where it comes from
 *
 * This repo already states the convention, in the header of `ticket-archaeology-lint.yml`:
 *
 * > *CI mirror of the `.husky/pre-commit` guard, so `git commit --no-verify` cannot bypass it.*
 *
 * Four guards follow it. Five do not, and one of those is a **syntax** check. This guard makes the
 * convention mechanical so the next unmirrored guard fails on arrival instead of being discovered
 * by someone whose merge needed `--no-verify`.
 *
 * ## Why this reports a DEFECT, where `lint-retry-bounds` reports `unclassified`
 *
 * Its sibling deliberately never says "unbounded", because its discovery patterns have a larger
 * false-positive family than true-positive set, and a guard that cries wolf gets suppressed.
 *
 * This guard is the opposite case and the distinction matters. The population is **exact**: it is
 * read from `package.json`'s `lint-staged` config, not inferred from syntax. A guard listed there
 * either is or is not invoked by a workflow. So "unmirrored" is a defect claim, and the registry
 * exists to record *accepted* ones with a reason — not to absorb false positives.
 *
 * ## Why comment lines are stripped before matching
 *
 * A workflow that merely *names* a guard in prose does not invoke it, and counting it would be a
 * false green inside the guard whose entire purpose is catching false greens.
 *
 * Stated precisely, because the tempting version is overstated: `ticket-archaeology-lint.yml`
 * does mention `block-alignment` in a comment, but as the bare phrase — **not** as
 * `check-block-alignment.mjs`. Matching on the full basename, as this file does, would therefore
 * NOT have been fooled by that particular comment. Measured, not assumed.
 *
 * The stripping is kept anyway, as a guard against the real class rather than a fix for an
 * observed failure: a comment naming a full script path is entirely ordinary — *"we deliberately
 * do not run `buildScripts/util/check-parse.mjs` here"* would read as invocation to any substring
 * match. A spec pins the behaviour so the next person to "simplify" this knows what it protects.
 *
 * ## Scope
 *
 * The population is `lint-staged` only. The `ai/scripts/lint/lint-*.mjs` family has its own
 * coverage question and is a separate lane; it is named in the registry's `$schema.outOfScope` so
 * the boundary is recorded rather than implied.
 */

import fs   from 'fs';
import path from 'path';
import url  from 'url';

const
    __dirname     = path.dirname(url.fileURLToPath(import.meta.url)),
    REPO_ROOT     = path.resolve(__dirname, '../../..'),
    WORKFLOW_DIR  = path.join(REPO_ROOT, '.github/workflows'),
    REGISTRY_REL  = 'ai/scripts/lint/guard-ci-parity-registry.json',
    REGISTRY_PATH = path.join(REPO_ROOT, REGISTRY_REL),
    PKG_PATH      = path.join(REPO_ROOT, 'package.json');

/**
 * @summary Every distinct guard script invoked by `lint-staged`, derived — never hardcoded.
 *
 * Deriving is the point: adding a tenth guard with no workflow must fail without anyone editing
 * this file. A hardcoded list would answer today's question and rot.
 *
 * @returns {String[]} script paths as written in `lint-staged`, e.g. `buildScripts/util/check-parse.mjs`
 */
function discoverGuards() {
    const
        pkg      = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')),
        commands = Object.values(pkg['lint-staged'] || {}).flat(),
        scripts  = new Set();

    commands.forEach(command => {
        const match = `${command}`.match(/([\w./-]*(?:check|lint)-[\w.-]+\.mjs)/);

        match && scripts.add(match[1].replace(/^\.\//, ''))
    });

    return [...scripts].sort()
}

/**
 * @summary Workflow YAML with comment lines removed, so a guard NAMED in prose is not counted as
 * a guard INVOKED by the workflow.
 *
 * @returns {Object[]} `{file, body}` per workflow
 */
function workflowBodies() {
    if (!fs.existsSync(WORKFLOW_DIR)) {
        return []
    }

    return fs.readdirSync(WORKFLOW_DIR)
        .filter(file => /\.ya?ml$/.test(file))
        .map(file => ({
            file,
            body: fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')
                .split('\n')
                .filter(line => !line.trim().startsWith('#'))
                .join('\n')
        }))
}

/**
 * @param {String}   script
 * @param {Object[]} workflows
 * @returns {String[]} workflow filenames that invoke `script`
 */
function mirrorsOf(script, workflows) {
    const basename = path.basename(script);

    return workflows.filter(({body}) => body.includes(basename)).map(({file}) => file)
}

/**
 * @returns {Object} `{exitCode}`
 */
function runLint() {
    const
        guards     = discoverGuards(),
        workflows  = workflowBodies(),
        registry   = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')),
        accepted   = new Map(Object.entries(registry.clientOnly || {})),
        unmirrored = [],
        stale      = [];

    guards.forEach(script => {
        const
            key     = path.basename(script),
            mirrors = mirrorsOf(script, workflows);

        if (mirrors.length === 0) {
            !accepted.has(key) && unmirrored.push(key)
        } else if (accepted.has(key)) {
            stale.push(`${key} — now mirrored by ${mirrors.join(', ')}; remove its registry entry`)
        }
    });

    // A registry entry for a guard that left `lint-staged` is also stale: it would quietly widen the
    // accepted set if that guard ever returned.
    [...accepted.keys()].forEach(key => {
        !guards.some(script => path.basename(script) === key) &&
            stale.push(`${key} — no longer a lint-staged guard; remove its registry entry`)
    });

    const invalid = [...accepted.entries()]
        .filter(([, entry]) => !entry || !entry.reason || !entry.witness)
        .map(([key]) => `${key} — every entry needs BOTH a reason and a witness; one without them is a suppression, not an acceptance`);

    if (unmirrored.length === 0 && stale.length === 0 && invalid.length === 0) {
        console.log(`[lint-guard-ci-parity] OK (${guards.length} lint-staged guards, ${accepted.size} accepted client-only)`);
        return {exitCode: 0}
    }

    console.error('[lint-guard-ci-parity] FAILED');

    if (unmirrored.length) {
        console.error(`\n  ${unmirrored.length} guard(s) invoked by lint-staged but by NO workflow:\n`);
        unmirrored.forEach(key => console.error(`    ${key}`));
        console.error(`\n  A guard with no CI mirror is skipped entirely by \`git commit --no-verify\`, and a merge`);
        console.error('  commit stages files the author never touched — so the bypass is routine, not careless.');
        console.error(`  Add a workflow that invokes it, or record it in ${REGISTRY_REL} with a reason and a witness.\n`)
    }

    if (stale.length) {
        console.error(`  ${stale.length} STALE registry entr(ies):\n`);
        stale.forEach(problem => console.error(`    ${problem}`));
        console.error('\n  The registry must shrink visibly. A stale entry silently widens the accepted set.\n')
    }

    if (invalid.length) {
        console.error(`  ${invalid.length} INVALID registry entr(ies):\n`);
        invalid.forEach(problem => console.error(`    ${problem}`));
        console.error('')
    }

    return {exitCode: 1}
}

process.exit(runLint().exitCode);
