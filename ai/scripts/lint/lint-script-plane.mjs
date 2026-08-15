import {createRequire} from 'node:module';
import fs              from 'node:fs';
import * as yaml       from 'js-yaml';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {buildTaskDefinitions}   from '../../daemons/orchestrator/taskDefinitions.mjs';
import {TASK_AUTHORITY_BY_NAME} from '../../daemons/orchestrator/taskAuthority.mjs';
import {
    FINDING,
    resolveEntrypointPlane,
    walkCapabilityClosure
}                              from './scriptPlaneClosure.mjs';

/**
 * Fails a build when an `ai/scripts` entrypoint's declared execution authority disagrees with what
 * its code actually reaches.
 *
 * The entrypoint population is read from `package.json`'s `ai:*` scripts rather than from a directory
 * listing, because the npm entry is the real invocation contract: a file nobody can invoke has no
 * plane to be wrong about, and a file invoked under a name is exactly where a wrong plane bites.
 *
 * **Two failure classes, deliberately not equal:**
 *
 * - An **authority conflict** fails the build. The orchestrator declares a task's class and the
 *   closure found the opposite; one of them is wrong, and shipping either way means a script that
 *   breaks on the plane it is declared for.
 * - An **unresolved edge** does NOT fail on sight — it is ratcheted. A dynamic import on a
 *   runtime-computed path cannot be followed statically, and a large pre-existing population of them
 *   exists today (one site in the config provider accounts for most of it). Failing on all of them
 *   would put the lint permanently red, and a permanently red lint is a lint everyone routes around.
 *   Failing on an INCREASE keeps the population honest without pretending it is already zero.
 *
 * The ratchet baseline is a measured number, not a target. It must only ever be lowered — the same
 * discipline the fixed-sleep baseline carries, and for the same reason: a baseline that can be raised
 * to accommodate drift is a counter, not a gate.
 */

const
    __filename   = fileURLToPath(import.meta.url),
    PROJECT_ROOT = path.resolve(path.dirname(__filename), '../../..'),
    require      = createRequire(import.meta.url);

/**
 * @summary Paths this lint reads. Imported by the workflow scan-root parity spec as the SSOT.
 *
 * `ai/**` is deliberately broad: the closure walks transitively, so a capability introduced anywhere
 * a script can reach changes a verdict here. Narrowing this to `ai/scripts/**` would mean the guard
 * does not RUN on the edit that changes its own answer — the failure mode the parity spec exists to
 * prevent.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze([
    'package.json',
    'ai/**',
    'ai/scripts/lint/lint-script-plane.mjs',
    'ai/scripts/lint/scriptPlaneClosure.mjs',
    '.github/workflows/script-plane-lint.yml'
]);

/**
 * @summary Highest number of unresolved edges tolerated across the entrypoint population.
 *
 * MEASURED on `dev`, not chosen. Lower it when an edge is genuinely resolved; never raise it to make
 * a red build pass — that inverts the gate into a record of whatever we happen to have.
 *
 * Re-measured at 38 when the census was corrected: the old 40 was taken over a population that
 * counted five duplicate npm aliases as separate entrypoints and omitted four workflow-invoked
 * modules. A ratchet inherited across a population change is not a ratchet.
 * @type {Number}
 */
export const UNRESOLVED_EDGE_BASELINE = 38;

/**
 * @summary Maps an `ai:*` npm script to the `ai/scripts` module it invokes.
 * @param {Object} [scripts] `package.json` scripts block.
 * @returns {Array<{name: String, rel: String}>}
 */
export function readEntrypoints(scripts = require(path.join(PROJECT_ROOT, 'package.json')).scripts) {
    const byRel = new Map();

    Object.entries(scripts).forEach(([name, command]) => {
        const rel = command.match(/(ai\/scripts\/[\w./-]+\.mjs)/)?.[1];

        // Two npm aliases can point at one script (`defragChromaDB` has two); the population is
        // MODULES with a plane, not invocation names, so it dedupes on the path.
        if (rel && !byRel.has(rel)) {
            byRel.set(rel, {name, rel, via: 'npm'})
        }
    });

    readWorkflowEntrypoints().forEach(rel => {
        if (!byRel.has(rel)) {
            byRel.set(rel, {name: rel, rel, via: 'workflow'})
        }
    });

    return [...byRel.values()]
}

/**
 * @summary `ai/scripts` modules a GitHub workflow invokes directly, without going through npm.
 *
 * The npm block is not the whole invocation surface. Several workflows run a script straight —
 * `run: node ./ai/scripts/lint/lint-guard-ci-parity.mjs` — so an npm-only census misses them, and the
 * omission was self-demonstrating: **this lint invokes itself from a workflow and did not score
 * itself.** A guard blind to its own execution path is the shape it exists to catch.
 *
 * Steps are read through the YAML parser rather than by grepping the file, so a path inside a comment
 * or an unrelated key cannot be mistaken for an invocation. The command is then matched inside the
 * step's `run` text, because that text is shell, not structure.
 *
 * @param {Object} [options]
 * @returns {String[]} repo-relative module paths, deduped.
 */
export function readWorkflowEntrypoints({
    workflowDir = path.join(PROJECT_ROOT, '.github/workflows')
} = {}) {
    if (!fs.existsSync(workflowDir)) {
        return []
    }

    const found = new Set();

    fs.readdirSync(workflowDir)
        .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
        .forEach(name => {
            let doc;

            try {
                doc = yaml.load(fs.readFileSync(path.join(workflowDir, name), 'utf8'))
            } catch {
                // An unparseable workflow is not this lint's subject; the workflow-syntax gates own it.
                return
            }

            Object.values(doc?.jobs ?? {}).forEach(job => {
                (job?.steps ?? []).forEach(step => {
                    const run = typeof step?.run === 'string' ? step.run : '';

                    for (const match of run.matchAll(/node\s+\.?\/?(ai\/scripts\/[\w./-]+\.mjs)/g)) {
                        found.add(match[1])
                    }
                })
            })
        });

    return [...found].sort()
}

/**
 * @summary Joins orchestrator tasks to the module each one actually executes.
 *
 * **Keyed on the script PATH, never on a name.** The first version of this transformed the npm entry
 * into a task name — `ai:sync-github-workflow` → `syncGithubWorkflow` — and the authority map's key
 * is `githubWorkflowSync`. Same words, opposite order. That join matched **1 of 62** entrypoints, so
 * the authority cross-check was very nearly inert and the `githubWorkflowSync` fixture, which the
 * whole rule exists to catch, was not among the matches.
 *
 * A task definition already carries the joinable fact: its `args` contain the resolved module path.
 * Two names for one lane can disagree; a path is what the process actually runs.
 *
 * @param {Object} [options]
 * @returns {Object} repo-relative script path -> `{taskName, authorityClass}`.
 */
export function buildAuthorityByScript({
    definitions     = buildTaskDefinitions({}),
    authorityByName = TASK_AUTHORITY_BY_NAME,
    projectRoot     = PROJECT_ROOT
} = {}) {
    const byScript = {};

    Object.entries(definitions).forEach(([taskName, definition]) => {
        const script = (definition?.args ?? []).find(arg => typeof arg === 'string' && arg.endsWith('.mjs'));

        if (!script || !(taskName in authorityByName)) {
            return
        }

        byScript[path.relative(projectRoot, path.resolve(script))] = {
            taskName,
            authorityClass: authorityByName[taskName]
        }
    });

    return byScript
}

/**
 * @summary Per-folder plane tally over the npm-declared entrypoints, for the structure map.
 *
 * The navigational answer the map could not give before: `ai/scripts` names its folders after the
 * VERB (`maintenance`, `diagnostics`, `runners`) and never the plane, so "can this run where there is
 * no host shell" required opening the file. A folder carrying more than one plane is flagged `mixed`,
 * because that is the case a reader most needs to see and the one a folder name most reliably hides.
 *
 * Entrypoints whose plane is unresolved are counted under `unresolved` rather than folded into a
 * class — a folder that is half-unknown must not read as homogeneous.
 *
 * @param {Object} [options]
 * @returns {Object} `{folder: {planes, mixed, entrypoints}}`, folder-keyed and sorted.
 */
export function buildPlaneProjection({
    entrypoints       = readEntrypoints(),
    authorityByScript = buildAuthorityByScript(),
    projectRoot       = PROJECT_ROOT
} = {}) {
    const byFolder = {};

    entrypoints.forEach(({rel}) => {
        const
            folder    = rel.slice(0, rel.lastIndexOf('/')),
            closure   = walkCapabilityClosure({entrypoint: path.join(projectRoot, rel)}),
            authority = authorityByScript[rel] ?? null,
            {plane}   = resolveEntrypointPlane({
                closure,
                authorityClass: authority?.authorityClass ?? null,
                taskName      : authority?.taskName ?? null,
                entrypoint    : rel
            }),
            key       = plane ?? 'unresolved';

        byFolder[folder] ??= {planes: {}, mixed: false, entrypoints: {}};
        byFolder[folder].planes[key] = (byFolder[folder].planes[key] ?? 0) + 1;
        byFolder[folder].entrypoints[rel.slice(folder.length + 1)] = key;
    });

    Object.values(byFolder).forEach(entry => {
        entry.mixed = Object.keys(entry.planes).length > 1
    });

    return Object.fromEntries(Object.entries(byFolder).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * @summary Runs the lint over every npm-declared `ai/scripts` entrypoint.
 * @param {Object} [options]
 * @returns {{exitCode: Number, conflicts: Object[], unresolved: Number, planes: Object}}
 */
export function runLint({
    entrypoints      = readEntrypoints(),
    authorityByScript = buildAuthorityByScript(),
    baseline         = UNRESOLVED_EDGE_BASELINE,
    projectRoot      = PROJECT_ROOT
} = {}) {
    const
        conflicts = [],
        planes    = {'host-edge': 0, 'container-plane': 0, 'shared-primitive': 0, unresolved: 0};

    let unresolved = 0;

    entrypoints.forEach(({rel}) => {
        const
            closure   = walkCapabilityClosure({entrypoint: path.join(projectRoot, rel)}),
            authority = authorityByScript[rel] ?? null,
            result    = resolveEntrypointPlane({
                closure,
                authorityClass: authority?.authorityClass ?? null,
                taskName      : authority?.taskName ?? null,
                entrypoint    : rel
            });

        planes[result.plane ?? 'unresolved'] = (planes[result.plane ?? 'unresolved'] ?? 0) + 1;

        result.findings.forEach(finding => {
            if (finding.kind === FINDING.unresolvedEdge) {
                unresolved++
            } else {
                conflicts.push(finding)
            }
        })
    });

    const viaNpm      = entrypoints.filter(entry => entry.via !== 'workflow').length,
          viaWorkflow = entrypoints.length - viaNpm;

    console.log(`[lint-script-plane] ${entrypoints.length} ai/scripts entrypoint(s) — `
        + `${viaNpm} npm-declared, ${viaWorkflow} workflow-invoked`);
    console.log(`  host-edge ${planes['host-edge']} · container-plane ${planes['container-plane']} `
        + `· shared-primitive ${planes['shared-primitive']} · unresolved ${planes.unresolved}`);

    if (conflicts.length === 0 && unresolved <= baseline) {
        console.log(`  OK — no authority conflicts; ${unresolved} unresolved edge(s), baseline ${baseline}.`);
        return {exitCode: 0, conflicts, unresolved, planes}
    }

    if (conflicts.length > 0) {
        console.error(`\n[lint-script-plane] FAILED — ${conflicts.length} authority conflict(s):\n`);

        conflicts.forEach(finding => {
            console.error(`  ${finding.entrypoint}  (task: ${finding.taskName})`);
            console.error(`    ${finding.message}`);
            (finding.evidence ?? []).forEach(site => console.error(`      reached: ${site}`));
            console.error('')
        });

        console.error('  The orchestrator\'s declared class and the code\'s capability closure disagree.');
        console.error('  Fix whichever is wrong — do NOT silence this by widening the taxonomy.\n')
    }

    if (unresolved > baseline) {
        console.error(`\n[lint-script-plane] FAILED — unresolved edges rose to ${unresolved} `
            + `(baseline ${baseline}).\n`);
        console.error('  A new dynamic import on a runtime-computed path makes an entrypoint\'s plane');
        console.error('  underivable. Resolve the edge, or lower the baseline only when one is genuinely');
        console.error('  removed. Raising it records drift instead of gating it.\n')
    }

    return {exitCode: 1, conflicts, unresolved, planes}
}

// Import-safe, per the house pattern in `lint-guard-ci-parity.mjs`: the workflow scan-root parity
// spec imports SCAN_SURFACE from this module, and a bare `process.exit()` at module scope would
// terminate the test process on import.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exit(runLint().exitCode)
}
