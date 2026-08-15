import {createRequire} from 'node:module';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

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
 * @type {Number}
 */
export const UNRESOLVED_EDGE_BASELINE = 40;

/**
 * @summary Maps an `ai:*` npm script to the `ai/scripts` module it invokes.
 * @param {Object} [scripts] `package.json` scripts block.
 * @returns {Array<{name: String, rel: String}>}
 */
export function readEntrypoints(scripts = require(path.join(PROJECT_ROOT, 'package.json')).scripts) {
    return Object.entries(scripts)
        .map(([name, command]) => ({name, rel: command.match(/(ai\/scripts\/[\w./-]+\.mjs)/)?.[1]}))
        .filter(entry => entry.rel)
}

/**
 * @summary Task name for an npm script, when the orchestrator declares one.
 *
 * The npm entry `ai:github-workflow-sync` and the task `githubWorkflowSync` are the same lane under
 * two spellings, so the bridge is a normalisation rather than a second registry to keep in sync.
 *
 * @param {String} npmName e.g. `ai:github-workflow-sync`.
 * @param {Object} [authorityByName] Injectable for tests.
 * @returns {String|null}
 */
export function taskNameFor(npmName, authorityByName = TASK_AUTHORITY_BY_NAME) {
    const camel = npmName.replace(/^ai:/, '').replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

    return camel in authorityByName ? camel : null
}

/**
 * @summary Runs the lint over every npm-declared `ai/scripts` entrypoint.
 * @param {Object} [options]
 * @returns {{exitCode: Number, conflicts: Object[], unresolved: Number, planes: Object}}
 */
export function runLint({
    entrypoints      = readEntrypoints(),
    authorityByName  = TASK_AUTHORITY_BY_NAME,
    baseline         = UNRESOLVED_EDGE_BASELINE,
    projectRoot      = PROJECT_ROOT
} = {}) {
    const
        conflicts = [],
        planes    = {'host-edge': 0, 'container-plane': 0, 'shared-primitive': 0, unresolved: 0};

    let unresolved = 0;

    entrypoints.forEach(({name, rel}) => {
        const
            closure  = walkCapabilityClosure({entrypoint: path.join(projectRoot, rel)}),
            taskName = taskNameFor(name, authorityByName),
            result   = resolveEntrypointPlane({
                closure,
                authorityClass: taskName ? authorityByName[taskName] : null,
                taskName,
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

    console.log(`[lint-script-plane] ${entrypoints.length} npm-declared ai/scripts entrypoint(s)`);
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
