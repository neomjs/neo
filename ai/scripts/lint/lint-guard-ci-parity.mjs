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
 * Six guards follow it. Six do not, and one of those is a **syntax** check. This guard makes the
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
 * ## Why only parsed `run:` commands count
 *
 * A workflow that merely *names* a guard in prose, `on.paths`, an environment value, or a shell
 * argument does not invoke it. Workflows are parsed as YAML, then only `jobs.*.steps[].run` strings
 * are inspected for direct `node … <script>.mjs` commands. Counting any wider YAML or shell-token
 * population would create a false green inside the guard whose purpose is catching false greens.
 *
 * ## Scope
 *
 * The population is `lint-staged` only. The `ai/scripts/lint/lint-*.mjs` family has its own
 * coverage question and is a separate lane; it is named in the registry's `$schema.outOfScope` so
 * the boundary is recorded rather than implied.
 */

import fs        from 'fs';
import path      from 'path';
import url       from 'url';
import * as yaml from 'js-yaml';

const
    __filename = url.fileURLToPath(import.meta.url),
    __dirname  = path.dirname(__filename),
    REPO_ROOT  = process.env.NEO_GUARD_CI_PARITY_REPO_ROOT
        ? path.resolve(process.env.NEO_GUARD_CI_PARITY_REPO_ROOT)
        : path.resolve(__dirname, '../../..'),
    WORKFLOW_DIR = path.join(REPO_ROOT, '.github/workflows'),
    REGISTRY_REL = 'ai/scripts/lint/guard-ci-parity-registry.json',
    SELF_REL     = 'ai/scripts/lint/lint-guard-ci-parity.mjs',
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
 * @summary Resolves a statically named Node script to one normalized repo-relative identity.
 *
 * Full paths are load-bearing: two different guards may share a basename, and a workflow that
 * executes one must never be credited as the other's mirror. Dynamic or outside-repo paths remain
 * unclassified rather than being collapsed into a reassuring false match.
 *
 * @param {String} script
 * @param {String} [workingDirectory='.']
 * @returns {String|null}
 */
function normalizeScriptPath(script, workingDirectory = '.') {
    const
        scriptPath  = `${script}`.replaceAll('\\', '/'),
        workingPath = `${workingDirectory || '.'}`.replaceAll('\\', '/');

    if (
        scriptPath.startsWith('/') ||
        workingPath.startsWith('/') ||
        scriptPath.includes('${{') ||
        workingPath.includes('${{')
    ) {
        return null
    }

    const normalized = path.posix.normalize(path.posix.join(workingPath, scriptPath)).replace(/^\.\//, '');

    return normalized === '..' || normalized.startsWith('../') ? null : normalized
}

/**
 * @summary Extracts only scripts directly executed by static `node … <script>.mjs` commands.
 *
 * Other `.mjs` tokens inside the shell body are arguments or prose, not execution evidence. The
 * global match supports multiple Node commands in one `run:` block without treating arbitrary YAML
 * mentions as mirrors.
 *
 * @param {String} command
 * @param {String} [workingDirectory='.']
 * @returns {String[]}
 */
function executedNodeScripts(command, workingDirectory = '.') {
    const scripts = [];

    for (const match of `${command}`.matchAll(
        /\bnode\s+(?:(?:--[\w-]+)(?:=[^\s]+)?\s+)*(['"]?)([\w./-]+\.mjs)\1/g
    )) {
        const script = normalizeScriptPath(match[2], workingDirectory);

        script && scripts.push(script)
    }

    return scripts
}

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
        executedNodeScripts(command).forEach(script => scripts.add(script))
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
 * YAML comments, path filters, environment values, and non-Node shell arguments are outside that
 * boundary by construction.
 *
 * @returns {Object[]} `{file, executed:Set<String>}` per workflow, keyed by repo-relative path
 */
function workflowExecutions() {
    if (!fs.existsSync(WORKFLOW_DIR)) {
        return []
    }

    return fs.readdirSync(WORKFLOW_DIR)
        .filter(file => /\.ya?ml$/.test(file))
        .map(file => {
            const
                workflow = yaml.load(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')) || {},
                executed = new Set();

            const workflowDirectory = workflow.defaults?.run?.['working-directory'] || '.';

            Object.values(workflow.jobs || {}).forEach(job => {
                const jobDirectory = job?.defaults?.run?.['working-directory'] || workflowDirectory;

                (job?.steps || []).forEach(step => {
                    if (typeof step?.run !== 'string') {
                        return
                    }

                    const stepDirectory = step['working-directory'] || jobDirectory;

                    executedNodeScripts(step.run, stepDirectory).forEach(script => executed.add(script))
                })
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
    return workflows.filter(({executed}) => executed.has(script)).map(({file}) => file)
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
            key     = script,
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
        !guards.includes(key) &&
            stale.push(`${key} — no longer a lint-staged guard; remove its registry entry`)
    });

    const invalid = [...accepted.entries()]
        .filter(([, entry]) => !entry || !entry.reason || !entry.witness)
        .map(([key]) => `${key} — every entry needs BOTH a reason and a witness; one without them is a suppression, not an acceptance`);

    !guards.includes(SELF_REL) && invalid.push(
        `${SELF_REL} — commit-time carrier missing from package.json lint-staged`
    );

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
