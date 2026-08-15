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
 * @summary Stable identity for one unresolved edge, deliberately WITHOUT its line number.
 *
 * A count is not an identity, and a ratchet on a count is a gate that cannot see substitution: one
 * edge disappears, a different one appears, the total is unchanged and CI stays green while the
 * closure got no sounder. Naming each edge is what makes the ledger below a ratchet rather than a
 * tally.
 *
 * The line is excluded on purpose. Including it would make every edge churn on any edit above it,
 * and a ledger that churns is a ledger nobody reads — the identity has to be about the EDGE, not
 * about where the edge currently sits.
 *
 * @param {Object} finding An `unresolved-edge` finding.
 * @param {String} [projectRoot]
 * @returns {String}
 */
export function edgeIdentity(finding, projectRoot = PROJECT_ROOT) {
    const rel    = finding.module ? path.relative(projectRoot, finding.module) : finding.entrypoint,
          detail = finding.specifier ? finding.specifier
                 : finding.callee    ? `${finding.member}->${finding.callee}`
                 // The owning member is the discriminator of last resort. Without it, two dynamic
                 // imports in one module collapse to a single identity and swapping one for the
                 // other passes a Set-backed ratchet unchanged — the substitution this ledger
                 // exists to catch, scoped inside a file instead of across them.
                 : finding.member    ? finding.member
                 : null;

    return [rel, finding.reason, detail].filter(Boolean).join('::')
}

/**
 * @summary Every unresolved edge known to exist, by identity. The ratchet's whole surface.
 *
 * MEASURED, not chosen, and it may only ever SHRINK. An entry disappears when the edge is genuinely
 * resolved; a new identity fails the build even when one of these vanishes in the same commit, which
 * is the case a count-based baseline waves through.
 *
 * The dominant cause is a single site — `ai/ConfigProvider.mjs`'s `await import(absolutePath)` on a
 * runtime-resolved overlay path. It is deliberately NOT special-cased: a dynamic import on a computed
 * path could statically carry anything, and an exemption to make the number look better is precisely
 * the hand-authored metadata this lane exists to remove.
 * @type {ReadonlyArray<String>}
 */
export const UNRESOLVED_EDGE_LEDGER = Object.freeze([
    // Dynamic imports on runtime-computed paths, keyed by the member that performs them — three of
    // these live in ONE module, and until the identity carried its member they collapsed into a
    // single entry. The measured population was 9 while the real one was 12.
    'ai/ConfigProvider.mjs::dynamic-import::load',
    'ai/mcp/client/config.mjs::dynamic-import::load',
    'ai/scripts/diagnostics/printAiConfig.mjs::dynamic-import::main',
    'ai/scripts/lint/lint-config-template-ssot.mjs::dynamic-import::buildConfigEnvDefaultsForTemplate',
    'ai/scripts/lint/lint-config-template-ssot.mjs::dynamic-import::collectConfigPathKindsFromTemplate',
    'ai/scripts/lint/lint-config-template-ssot.mjs::dynamic-import::withTier1ConfigForLint',
    'ai/scripts/maintenance/defragChromaDB.mjs::dynamic-import::loadConfig',
    'ai/scripts/maintenance/purgeTestCollections.mjs::dynamic-import::resolveChromaEndpoint',

    // A specifier pointing at a module that no longer exists there — the flat-SDK migration left it
    // behind. Not this lane's to repair; the edge is listed so its disappearance is visible.
    'ai/scripts/maintenance/buildKbAgentFaqs.mjs::unresolved-specifier::'
        + '../../mcp/server/knowledge-base/services/KBRecorderService.mjs',

    // Dispatch through a value the closure cannot name, with a capability behind the edge. The
    // callee is part of the identity, so the reader knows WHAT could not be followed.
    'ai/agent/AgentOrchestrator.mjs::unresolved-dispatch::createAgent->agentFactory',
    'ai/agent/AgentOrchestrator.mjs::unresolved-dispatch::emitHandoff->handoffEmitter',
    'ai/services/knowledge-base/DatabaseService.mjs::unresolved-dispatch::createKnowledgeBase->SourceRegistry.getSources'
]);

/**
 * @summary Authority conflicts that are KNOWN, ticketed, and not this lane's to resolve.
 *
 * Every entry carries the ticket that will retire it, and the list may only shrink — a conflict with
 * no ticket is not an entry, it is a silenced failure. This is the same primitive as the edge ledger
 * above and it exists for the same reason: a gate that cannot record a known state either goes red
 * forever, which teaches everyone to route around it, or grows a `default` branch, which is the
 * silent-fallback shape this whole lane was built to remove.
 *
 * The one entry is a disagreement between two accepted things rather than a bug in either.
 * ADR-0014 — ticket-ref-ok: the ADR is the authority whose verdict this entry defers to — deliberately
 * classes `temporal-summary` container-plane, because the container IS the
 * checkout, carrying `.git` at the built revision, which is exactly what
 * `TemporalSummaryAggregationService.execCommand()` reads with `git log`. This lint's capability
 * taxonomy maps ANY `child_process` use to `host-shell`, so it convicts a lane the ADR knowingly
 * accepts. **The taxonomy is the part that is wrong**, and correcting it is a decision about what
 * makes a lane host-edge, which belongs to the ADR and not to a lint that consumes it.
 * @type {ReadonlyArray<String>}
 */
export const KNOWN_AUTHORITY_CONFLICTS = Object.freeze([
    // #17217 — `child_process` is a subprocess predicate, not a plane predicate. ticket-ref-ok: the
    // ticket IS this entry's warrant, and an entry that outlives it fails the lint's own check above.
    'ai/scripts/maintenance/aggregate-temporal-summary.mjs::temporal-summary::authority-conflict-in-plane'
]);

/**
 * @summary Stable identity for one authority conflict.
 * @param {Object} finding A conflict finding.
 * @returns {String}
 */
export function conflictIdentity(finding) {
    return [finding.entrypoint, finding.taskName, finding.kind].join('::')
}

/**
 * @summary Every production executable root, from all three channels that can start one.
 *
 * **A population is a claim, and this one was wrong twice in the same direction.** It began as npm
 * scripts alone, which missed the modules a workflow runs directly — including this lint, which
 * invokes itself from a workflow and did not score itself. Adding workflows still missed the roots the
 * ORCHESTRATOR spawns: two `ai/scripts` modules and three daemons that appear in no npm script and no
 * workflow, and that carry a declared authority class the lint therefore never checked. A gate whose
 * population omits the artifacts with the strongest declarations is not conservative — it is quiet
 * exactly where it is most needed.
 *
 * The third channel is `taskDefinitions`, joined the same way the authority map is: **on the script
 * path from the definition's `args`**, never on a name.
 *
 * Daemons are included even though they are not under `ai/scripts`, and that is deliberate. The
 * population is *executable roots that declare a plane*, not *files in a directory* — a
 * directory-keyed predicate is the exact shape this lane retired, and re-introducing it as a
 * population filter would smuggle it back in through the census.
 *
 * @param {Object} [scripts] `package.json` scripts block.
 * @param {Object} [authorityByScript] Output of `buildAuthorityByScript`.
 * @returns {Array<{name: String, rel: String, via: String}>}
 */
export function readEntrypoints(
    scripts           = require(path.join(PROJECT_ROOT, 'package.json')).scripts,
    authorityByScript = buildAuthorityByScript()
) {
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

    Object.entries(authorityByScript).forEach(([rel, {taskName}]) => {
        if (!byRel.has(rel)) {
            byRel.set(rel, {name: taskName, rel, via: 'task'})
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
/**
 * @summary Placeholder config that makes the task census MAXIMAL rather than default-shaped.
 *
 * `buildTaskDefinitions({})` is the descriptor layer's default, and two production roots exist only
 * when a port is configured — `neuralLinkBridge` (host-edge) and `devServer`. Censusing the default
 * therefore asks "what runs in an unconfigured process" when the question is **"which modules can be
 * spawned as a production root at all"**, and a root that appears only under configuration is still a
 * root whose declared authority nobody was checking.
 *
 * The values are sentinels and are never dialled, connected to, or read back: only the task TABLE's
 * shape depends on their presence. Reading real `AiConfig` here instead would drag a runtime overlay
 * into a static lint and make the population depend on the machine running it — the same
 * environment-shaped answer this whole lane exists to remove.
 * @type {Object}
 */
export const CENSUS_TASK_CONFIG = Object.freeze({
    chromaDataDir                    : '/census',
    chromaHost                       : 'census',
    chromaPort                       : 1,
    devServerLivenessTimeoutMs       : 1,
    devServerPort                    : 1,
    neuralLinkBridgeLivenessTimeoutMs: 1,
    neuralLinkBridgePort             : 1
});

export function buildAuthorityByScript({
    definitions     = buildTaskDefinitions(CENSUS_TASK_CONFIG),
    authorityByName = TASK_AUTHORITY_BY_NAME,
    projectRoot     = PROJECT_ROOT
} = {}) {
    const byScript = {};

    Object.entries(definitions).forEach(([taskName, definition]) => {
        // The executed module is `node`'s FIRST argument, never "the first arg ending in .mjs".
        // `devServer` runs `node …/webpack.js serve -c ./buildScripts/…/webpack.server.config.mjs`,
        // where the `.mjs` is a `-c` VALUE — so the extension heuristic joined a webpack config as
        // if it were the entrypoint and then reported its plane. A config file has no plane.
        const [script] = definition?.args ?? [];

        if (typeof script !== 'string' || !/\.(mjs|js)$/.test(script) || !(taskName in authorityByName)) {
            return
        }

        // A third-party binary is a leaf for the same reason a bare package specifier is: its plane
        // is not ours to derive, and the subject here is what OUR roots require.
        if (script.includes('node_modules/')) {
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
    entrypoints       = readEntrypoints(),
    authorityByScript = buildAuthorityByScript(),
    ledger            = UNRESOLVED_EDGE_LEDGER,
    knownConflicts    = KNOWN_AUTHORITY_CONFLICTS,
    projectRoot       = PROJECT_ROOT
} = {}) {
    const
        conflicts = [],
        // Deduped across the population: the same edge is reached from many entrypoints, and counting
        // it once per entrypoint measures the import graph's shape rather than the closure's soundness.
        edges     = new Set(),
        planes    = {'host-edge': 0, 'container-plane': 0, 'shared-primitive': 0, unresolved: 0};

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
                edges.add(edgeIdentity(finding, projectRoot))
            } else {
                conflicts.push(finding)
            }
        })
    });

    const
        known         = new Set(ledger),
        knownConflict = new Set(knownConflicts),
        appeared      = [...edges].filter(id => !known.has(id)).sort(),
        resolved      = [...known].filter(id => !edges.has(id)).sort(),
        newConflicts  = conflicts.filter(finding => !knownConflict.has(conflictIdentity(finding))),
        heldConflicts = conflicts.filter(finding => knownConflict.has(conflictIdentity(finding))),
        byVia         = via => entrypoints.filter(entry => entry.via === via).length;

    console.log(`[lint-script-plane] ${entrypoints.length} executable root(s) — `
        + `${byVia('npm')} npm-declared, ${byVia('workflow')} workflow-invoked, `
        + `${byVia('task')} orchestrator-task`);
    console.log(`  host-edge ${planes['host-edge']} · container-plane ${planes['container-plane']} `
        + `· shared-primitive ${planes['shared-primitive']} · unresolved ${planes.unresolved}`);

    if (resolved.length > 0) {
        console.log(`\n  ${resolved.length} ledger edge(s) no longer present — remove them from `
            + 'UNRESOLVED_EDGE_LEDGER:');
        resolved.forEach(id => console.log(`    - ${id}`))
    }

    heldConflicts.forEach(finding => {
        console.log(`\n  KNOWN conflict, ticketed and held: ${finding.entrypoint} (${finding.taskName})`);
        console.log(`    ${finding.message}`)
    });

    knownConflicts.filter(id => !conflicts.some(finding => conflictIdentity(finding) === id))
        .forEach(id => console.log(`\n  KNOWN conflict no longer reproduces — remove it from `
            + `KNOWN_AUTHORITY_CONFLICTS:\n    - ${id}`));

    if (newConflicts.length === 0 && appeared.length === 0) {
        console.log(`\n  OK — no new authority conflicts; ${edges.size} unresolved edge(s), all known.`);
        return {exitCode: 0, conflicts, edges: [...edges], appeared, resolved, planes}
    }

    if (newConflicts.length > 0) {
        console.error(`\n[lint-script-plane] FAILED — ${newConflicts.length} authority conflict(s):\n`);

        newConflicts.forEach(finding => {
            console.error(`  ${finding.entrypoint}  (task: ${finding.taskName})`);
            console.error(`    ${finding.message}`);
            (finding.evidence ?? []).forEach(site => console.error(`      ${site}`));
            console.error('')
        });

        console.error('  The orchestrator\'s declared class and the code\'s capability closure disagree.');
        console.error('  Fix whichever is wrong — do NOT silence this by widening the taxonomy.\n')
    }

    if (appeared.length > 0) {
        console.error(`\n[lint-script-plane] FAILED — ${appeared.length} unresolved edge(s) not in the `
            + 'ledger:\n');
        appeared.forEach(id => console.error(`    + ${id}`));
        console.error('\n  A call the closure cannot follow makes a no-host verdict unsound. Resolve the');
        console.error('  edge, or — if it is genuinely unfollowable — add its identity to the ledger with');
        console.error('  the reason. Never swap one identity for another to keep a total steady.\n')
    }

    return {exitCode: 1, conflicts, edges: [...edges], appeared, resolved, planes}
}

// Import-safe, per the house pattern in `lint-guard-ci-parity.mjs`: the workflow scan-root parity
// spec imports SCAN_SURFACE from this module, and a bare `process.exit()` at module scope would
// terminate the test process on import.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    process.exit(runLint().exitCode)
}
