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
 * Five guards follow it. Six do not, and one of those is a **syntax** check. This guard makes the
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
    __filename   = url.fileURLToPath(import.meta.url),
    __dirname    = path.dirname(__filename),
    REPO_ROOT    = path.resolve(__dirname, '../../..'),
    WORKFLOW_DIR = path.join(REPO_ROOT, '.github/workflows'),
    REGISTRY_REL = 'ai/scripts/lint/guard-ci-parity-registry.json',
    PKG_PATH     = path.join(REPO_ROOT, 'package.json'),

    /**
     * The committed registry, unless a spec points this at a fixture.
     *
     * The override exists so the sibling spec can prove this guard goes RED without mutating the
     * real registry — a red-proof that edits the tree it is proving things about would leave the
     * repo dirty on failure and could not run in parallel. Production never sets it.
     */
    REGISTRY_PATH = process.env.NEO_GUARD_CI_PARITY_REGISTRY
        ? path.resolve(process.env.NEO_GUARD_CI_PARITY_REGISTRY)
        : path.join(REPO_ROOT, REGISTRY_REL);

/**
 * @summary Every surface whose contents can change this lint's verdict — the SSOT its CI workflow's
 * path filter must cover.
 *
 * Exported so the sibling `scanned ⊆ watched` spec takes it as authority rather than a hand-copied
 * duplicate: widening what this predicate reads widens this array in the same edit, and an unwidened
 * workflow filter then fails that spec without anyone remembering to update a registry.
 *
 * That is the `scanned ⊆ watched` invariant, and this lint is subject to it like any other — which
 * is how it should be, since a guard exempting itself from a coverage rule is the joke it exists to
 * prevent.
 *
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    'package.json',
    '.github/workflows/**',
    REGISTRY_REL
]);

/**
 * @summary Every distinct guard script invoked by `lint-staged`, derived — never hardcoded.
 *
 * Deriving is the point: adding a tenth guard with no workflow must fail without anyone editing
 * this file. A hardcoded list would answer today's question and rot.
 *
 * **No naming allowlist.** An earlier revision matched `check-*` / `lint-*`, which is a filter on the
 * NAME rather than on the configuration — so a guard called `validate-json.mjs`, or any existing one
 * renamed, would vanish from the population silently. That is the exact failure this ticket exists to
 * fix, reproduced inside the fix: the hand census that motivated it missed the `lint-*` family for
 * precisely this reason. The population is now every `.mjs` a configured command executes.
 *
 * @returns {String[]} script paths as written in `lint-staged`, e.g. `buildScripts/util/check-parse.mjs`
 */
function discoverGuards() {
    const
        pkg      = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')),
        commands = Object.values(pkg['lint-staged'] || {}).flat(),
        scripts  = new Set();

    commands.forEach(command => {
        // `node ./path/to/whatever.mjs …` — the executed script, whatever it is called.
        const match = `${command}`.match(/\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*([\w./-]+\.mjs)/);

        match && scripts.add(match[1].replace(/^\.\//, ''))
    });

    return [...scripts].sort()
}

/**
 * @summary Per workflow, the set of scripts its `run:` steps actually EXECUTE.
 *
 * ## Why execution and not mention
 *
 * A workflow can name a guard without running it, and the commonest way is `on.paths`: a trigger
 * filter listing the guard so edits to it re-run the workflow. `aiconfig-antipattern-lint.yml` lists
 * `check-aiconfig-test-mutation.mjs` in `on.paths` twice while its `run:` step executes
 * `check-aiconfig-antipatterns.mjs` — a different guard.
 *
 * A mention-based match therefore credits coverage that does not exist. That is the **same
 * false-green class this lint audits, reproduced one layer above the guards it governs**: an earlier
 * revision stripped comments to stop prose counting as coverage, and left the larger hole open —
 * trigger filters are not executions either.
 *
 * Comments are still stripped, because a commented-out `run:` is not an execution.
 *
 * @returns {Object[]} `{file, executed:Set<String>}` per workflow, keyed by script basename
 */
function workflowExecutions() {
    if (!fs.existsSync(WORKFLOW_DIR)) {
        return []
    }

    return fs.readdirSync(WORKFLOW_DIR)
        .filter(file => /\.ya?ml$/.test(file))
        .map(file => {
            const
                lines    = fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8').split('\n'),
                executed = new Set();

            let inRun = false;

            lines.forEach(line => {
                if (line.trim().startsWith('#')) {
                    return
                }

                // A `run:` step opens a shell block; its continuation lines are indented further.
                /^\s*(-\s*)?run\s*:/.test(line) && (inRun = true);

                if (inRun) {
                    for (const m of line.matchAll(/([\w./-]+\.mjs)/g)) {
                        executed.add(path.basename(m[1]))
                    }
                }

                // Any new key at step level closes the run block.
                /^\s*(-\s*)?(name|uses|with|env|if|id)\s*:/.test(line) && (inRun = false)
            });

            return {file, executed}
        })
}

/**
 * @param {String}   script
 * @param {Object[]} workflows
 * @returns {String[]} workflow filenames whose `run:` steps execute `script`
 */
function mirrorsOf(script, workflows) {
    const basename = path.basename(script);

    return workflows.filter(({executed}) => executed.has(basename)).map(({file}) => file)
}

/**
 * @returns {Object} `{exitCode}`
 */
function runLint() {
    const
        guards     = discoverGuards(),
        workflows  = workflowExecutions(),
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

    // The registry is a RATCHET: it may shrink freely and may not grow silently.
    //
    // Asserting equality would be the obvious check and the wrong one — it would fail the moment
    // someone mirrors a guard and removes its entry, i.e. it would block the shrinkage this registry
    // exists to enable. `baselineAtIntroduction` is a historical high-water mark, not a current count.
    //
    // Enforced rather than documented because it was documented, and went stale: the baseline read 5
    // beside six entries until a reviewer noticed. A number no predicate checks is a census.
    const baseline = registry.$schema?.baselineAtIntroduction;

    Number.isInteger(baseline) && accepted.size > baseline && invalid.push(
        `the registry GREW: ${accepted.size} accepted entries against a baseline of ${baseline}. ` +
        'Adding an accepted client-only guard is a deliberate act — mirror it instead, or raise ' +
        '`baselineAtIntroduction` in the same commit with the reason in the PR body.'
    );

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

// Import-safe, per the house pattern in `lint-retry-bounds.mjs` and `lint-config-template-ssot.mjs`:
// the sibling `scanned ⊆ watched` spec imports SCAN_SURFACE from this module, and a bare
// `process.exit()` at module scope would terminate the test process on import.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exit(runLint().exitCode)
}
