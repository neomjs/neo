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
 * argument does not invoke it. Eligible `*-lint.yml/.yaml` workflows must gate `dev` pull requests;
 * their YAML is parsed, then only unmasked `jobs.*.steps[].run` strings are inspected for direct
 * `node … <script>.mjs` commands. Counting any wider population would create a false green inside the
 * guard whose purpose is catching false greens.
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
    HOOK_REL     = '.husky/pre-commit',
    HOOK_PATH    = path.join(REPO_ROOT, HOOK_REL),
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
    HOOK_REL,
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
 * @summary Extracts only scripts directly executed by standalone static `node … <script>.mjs` lines.
 *
 * Other `.mjs` tokens inside the shell body are arguments or prose, not execution evidence. Shell
 * control operators, runtime expressions, directory changes, and masked commands remain unclassified
 * rather than being credited optimistically. Declarative workflow `working-directory` is the supported
 * path carrier; the execution step itself must not override its environment.
 *
 * @param {String} command
 * @param {String} [workingDirectory='.']
 * @returns {String[]}
 */
function executedNodeScripts(command, workingDirectory = '.') {
    const statements = `${command}`.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    if (statements.length !== 1) {
        return []
    }

    const classifiedStatement = statements[0];

    if (classifiedStatement.includes('${{') || /&&|\|\||[;|&]/.test(classifiedStatement)) {
        return []
    }

    const match = classifiedStatement.match(
        /^node\s+(['"]?)([\w./-]+\.mjs)\1(?:\s+[^#;&|]*)?(?:\s+#.*)?$/
    );

    const script = match && normalizeScriptPath(match[2], workingDirectory);

    return script ? [script] : []
}

/**
 * @summary Proves the configured lint-staged guard remains reachable from the real Git hook.
 *
 * The hook carrier is intentionally exact and unmasked: lint-staged must be the terminal substantive
 * command, and only standalone Node pre-checks may precede it. If the project changes this sequence,
 * the predicate and its witness must change together instead of silently assuming reach.
 *
 * @returns {Boolean}
 */
function hasLintStagedHookCarrier() {
    if (!fs.existsSync(HOOK_PATH)) {
        return false
    }

    const statements = fs.readFileSync(HOOK_PATH, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

    if (statements.pop() !== 'npx lint-staged') {
        return false
    }

    return statements.every(statement => executedNodeScripts(statement).length === 1)
}

/**
 * @summary Returns whether a workflow is an unconditional pull-request gate for the `dev` branch.
 *
 * Manual, post-close, ignored-path, and other-branch workflows may execute a guard eventually, but
 * they cannot prevent a no-verify change from merging. Complex branch patterns stay unclassified;
 * literal `dev` or an unfiltered pull-request trigger are the reviewable merge-gate shapes.
 *
 * @param {Object} workflow
 * @returns {Boolean}
 */
function hasDevPullRequestGate(workflow) {
    const triggers = workflow.on ?? workflow[true];

    if (triggers === 'pull_request' || Array.isArray(triggers) && triggers.includes('pull_request')) {
        return true
    }

    if (!triggers || typeof triggers !== 'object' || !Object.hasOwn(triggers, 'pull_request')) {
        return false
    }

    const pullRequest = triggers.pull_request;

    if (pullRequest == null) {
        return true
    }

    if (
        typeof pullRequest !== 'object' ||
        Object.hasOwn(pullRequest, 'branches-ignore') ||
        Object.hasOwn(pullRequest, 'paths-ignore') ||
        Object.hasOwn(pullRequest, 'types')
    ) {
        return false
    }

    if (!Object.hasOwn(pullRequest, 'branches')) {
        return true
    }

    const branches = [pullRequest.branches].flat();

    return branches.includes('dev') && !branches.some(branch => `${branch}`.startsWith('!'))
}

/**
 * @summary Every distinct guard script invoked by `lint-staged`, derived — never hardcoded.
 *
 * Deriving is the point: adding another guard with no workflow must fail without anyone editing
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
        .filter(file => /-lint\.ya?ml$/.test(file))
        .map(file => {
            const
                workflow = yaml.load(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')) || {},
                executed = new Set();

            if (
                !hasDevPullRequestGate(workflow) ||
                Object.hasOwn(workflow, 'env') ||
                Object.hasOwn(workflow.defaults?.run || {}, 'shell')
            ) {
                return {file, executed}
            }

            const workflowDirectory = workflow.defaults?.run?.['working-directory'] || '.';

            Object.values(workflow.jobs || {}).forEach(job => {
                if (
                    !job ||
                    Object.hasOwn(job, 'env') ||
                    Object.hasOwn(job, 'if') ||
                    Object.hasOwn(job.defaults?.run || {}, 'shell') ||
                    job['continue-on-error']
                ) {
                    return
                }

                const jobDirectory = job?.defaults?.run?.['working-directory'] || workflowDirectory;

                (job?.steps || []).forEach(step => {
                    if (
                        typeof step?.run !== 'string' ||
                        Object.hasOwn(step, 'env') ||
                        Object.hasOwn(step, 'if') ||
                        Object.hasOwn(step, 'shell') ||
                        step['continue-on-error']
                    ) {
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

    !hasLintStagedHookCarrier() && invalid.push(
        `${HOOK_REL} — direct \`npx lint-staged\` carrier missing; configured guards are not commit-time reachable`
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
