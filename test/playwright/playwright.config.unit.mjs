import './configTemplateResolver.mjs';

import {defineConfig}  from '@playwright/test';
import {existsSync}    from 'node:fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../..');

process.env.UNIT_TEST_MODE = 'true';

// Retry backoff bases resolve to 1ms for the whole unit run.
//
// These belong HERE rather than in the leaf. A `process.env.UNIT_TEST_MODE ? 1 : 1000` branch inside
// `leaf(...)` bakes imperative env-resolution into the declarative config SSOT, and a per-spec write
// to the resolved config mutates a singleton every other spec shares. The env layer is the sanctioned
// seam: the leaf keeps one declarative default, and the test context overrides it the same way any
// deployment would.
// ticket-ref-ok: ADR-0019 names both shapes (A4, B4) and is the authority a reader needs to check
// this placement against; the rule outlives any ticket.
//
// What this buys is coverage that was previously traded away for seconds. A retry spec asserts the
// retry DEPTH and the terminal disposition; the sleep between attempts is not under test, so paying
// it in real wall-clock is pure cost. The leaseYield spec had already shrunk its `maxRetries` to fit
// a timeout — a workaround that quietly tested a shallower retry than production ships. Pinning the
// base lets those specs assert the real depth for free.
//
// A spec that genuinely tests timing must not rely on these values; it sets its own and says so.
process.env.NEO_KB_EMBEDDING_BACKOFF_BASE_MS = '1';

// Brain specs retain the Chroma capability by default. Body-focused runs do not select this
// project, so Playwright omits its setup dependency entirely instead of booting Chroma before it
// knows what the command selected. The structural boundary is deliberately conservative: a Brain
// test may freely exercise Memory Core / KB transitively without maintaining a fragile filename
// allow-list, while every non-Brain spec remains a genuinely pure Node.js unit run.
export const brainTestMatch = /[\\/]ai[\\/].*\.spec\.mjs$/;

// The daemon imports the eager Tier-1 + Memory Core config graph. Config-template unit specs
// intentionally unregister those singleton namespaces during their fixtures, so worker reuse can
// leave the redirected module cached after its namespace was removed. Give the daemon its own
// project/worker realm while retaining the same run-scoped Chroma capability.
export const orchestratorDaemonTestMatch =
    /[\\/]ai[\\/]daemons[\\/]orchestrator[\\/]daemon\.spec\.mjs$/;

// These config specs intentionally unregister and re-register their runtime namespaces. A reused
// worker cannot replay an already-cached template/base module after a namespace is deleted, so each
// destructive namespace-isolation spec gets its own process realm.
export const tier1ConfigTemplateTestMatch = /[\\/]ai[\\/]config\.template\.spec\.mjs$/;
export const knowledgeBaseConfigTemplateTestMatch =
    /[\\/]ai[\\/]mcp[\\/]server[\\/]knowledge-base[\\/]config\.template\.spec\.mjs$/;
export const memoryCoreConfigTemplateTestMatch =
    /[\\/]ai[\\/]mcp[\\/]server[\\/]memory-core[\\/]config\.template\.spec\.mjs$/;

// Profiling specs assert wall-clock performance budgets, which only mean anything on an UNCONTENDED
// CPU. Under multi-worker parallelism the shallow-clone filter has measured ~750ms against its 400ms
// budget — inside the old deep-clone band — so a bulk-parallel run cannot host them. They run in
// their own project instead (see `unit-profiling` below), so the bulk suites can go wide while these
// stay quiet. Keep this list narrow: only genuine wall-clock-budget specs belong here — a spec whose
// timing assertion is a ratio or a loose timeout does NOT (it survives contention and should
// parallelize with the bulk).
export const profilingTestMatch = /[\\/]devindex[\\/](StoreFilter|GridScroll)Profile\.spec\.mjs$/;

// Brain-tier install gate (the two-path install tier: Body default, Brain opt-in).
// A base `npm install` no longer installs the Brain set (`package.brain.json`: better-sqlite3,
// chromadb, @chroma-core/default-embed). Brain specs import `better-sqlite3` directly, so
// without the set they cannot even be COLLECTED — the gate therefore excludes every
// Brain-dependent project at config load (one named skip line) instead of crashing
// mid-collection. `npm run install-brain` arms the set; any plain `npm install` / `npm ci`
// prunes it again (npm removes extraneous packages), which simply re-engages this gate.
//
// Two graph-fixture hook specs live outside the `ai/**` path seam yet statically import
// `better-sqlite3`, so they are Brain-tier by function. Named here per this config's own
// named-match idiom — a THIRD brain-importing hook spec must be added explicitly (that is the
// fragility the path seam exists to avoid; keep the list at two).
export const brainHookTestMatch = /[\\/]hooks[\\/](codexContextHook|kimiTurnPresenceHook)\.spec\.mjs$/;

/**
 * @summary Probes whether the Brain-tier set is installed AND consumable under `rootDir/node_modules`.
 * Directory names alone lie: a pruned or corrupt install can leave three empty husks that
 * false-green CI. The probe therefore checks each root's consumable entrypoint — for
 * `better-sqlite3` including the compiled native artifact (the thing a broken build actually
 * loses). It deliberately stops at artifact presence rather than `require()`: loading the
 * default embedder pulls `@huggingface/transformers` (seconds at every config load), while the
 * only artifact that realistically breaks without leaving a file-level trace is the native one.
 * @param {String} rootDir Repository root containing `node_modules`.
 * @returns {Boolean}
 */
export function hasBrainTier(rootDir) {
    return [
        ['better-sqlite3', 'lib/index.js', 'build/Release/better_sqlite3.node'],
        ['chromadb', 'dist/chromadb.mjs'],
        ['@chroma-core/default-embed', 'dist/default-embed.mjs']
    ].every(([pkg, ...entrypoints]) =>
        entrypoints.every(entry => existsSync(path.join(rootDir, 'node_modules', pkg, entry)))
    )
}

/**
 * @summary The CI admission rule for the Brain tier. A local base install SKIPS its brain
 * projects loudly (the gate's whole point); a CI environment with an absent or partial tier is
 * not a skip — it is silent coverage loss on a green run, so it must fail before collection.
 * @param {Object} options
 * @param {Boolean} options.brainPresent
 * @param {Boolean} options.isCI
 * @throws {Error} when CI runs without a complete Brain tier.
 */
export function assertBrainTierForEnvironment({brainPresent, isCI}) {
    if (isCI && !brainPresent) {
        throw new Error(
            '[playwright.config.unit] CI requires the complete Brain tier (better-sqlite3, chromadb, ' +
            '@chroma-core/default-embed) but it is absent or partial — a skipped brain matrix on a ' +
            'green CI run is silent coverage loss. Run `npm run install-brain` before this suite.'
        )
    }
}

/**
 * @summary Builds the project list for a given Brain-tier state. Pure by injection: specs pass
 * the boolean and never read the environment, so the gate is testable from BOTH install tiers.
 * @param {Object} options
 * @param {Boolean} options.brainPresent
 * @returns {Object[]} Playwright project definitions, in the canonical run order.
 */
export function buildProjects({brainPresent}) {
    const bodyBulk = {
        name      : 'unit',
        testIgnore: [brainTestMatch, brainHookTestMatch, profilingTestMatch]
    };

    const profiling = {
        // Isolation is TWO mechanisms, because neither alone suffices:
        //   1. `dependencies: ['unit']` is the BARRIER — this project does not START until the bulk
        //      body suite finishes, so the multi-worker contention that busts the budgets is already
        //      over. A project-level `workers` cap would NOT achieve this on its own: independent
        //      projects interleave up to the global worker maximum.
        //   2. `workers: 1` is the cross-file serializer — `fullyParallel: false` alone only
        //      serializes WITHIN a file, so the two profiling specs (separate files) would still run
        //      concurrent and contend with each other. `workers: 1` (a valid TestProject field in the
        //      pinned Playwright) caps this project to one worker while the global stays wide for
        //      the bulk-parallelism win. Each profiling spec then measures truly alone.
        // Depends on `unit` only, not `unit-brain`: the profiling specs are pure body runs, and
        // dragging the brain project (hence a Chroma boot) into a body-only invocation would break
        // the config's pure-body-run boundary for a measurement that never touches the Brain.
        name         : 'unit-profiling',
        dependencies : ['unit'],
        testMatch    : profilingTestMatch,
        fullyParallel: false,
        workers      : 1
    };

    if (!brainPresent) return [bodyBulk, profiling];

    return [{
        name     : 'chroma-setup',
        testMatch: /chroma\.setup\.mjs$/,
        teardown : 'chroma-teardown'
    }, {
        name     : 'chroma-teardown',
        testMatch: /chroma\.teardown\.mjs$/
    },
        bodyBulk,
    {
        name        : 'unit-brain',
        dependencies: ['chroma-setup'],
        testIgnore  : [
            orchestratorDaemonTestMatch,
            tier1ConfigTemplateTestMatch,
            knowledgeBaseConfigTemplateTestMatch,
            memoryCoreConfigTemplateTestMatch
        ],
        testMatch   : [brainTestMatch, brainHookTestMatch]
    }, {
        name        : 'unit-brain-orchestrator-daemon',
        dependencies: ['chroma-setup'],
        testMatch   : orchestratorDaemonTestMatch
    }, {
        name        : 'unit-brain-tier1-config',
        dependencies: ['chroma-setup'],
        testMatch   : tier1ConfigTemplateTestMatch
    }, {
        name        : 'unit-brain-knowledge-base-config',
        dependencies: ['chroma-setup'],
        testMatch   : knowledgeBaseConfigTemplateTestMatch
    }, {
        name        : 'unit-brain-memory-core-config',
        dependencies: ['chroma-setup'],
        testMatch   : memoryCoreConfigTemplateTestMatch
    },
        profiling
    ];
}

const brainPresent = hasBrainTier(repoRoot);

assertBrainTierForEnvironment({brainPresent, isCI: !!process.env.CI});

if (!brainPresent) {
    console.info('[playwright.config.unit] Brain-tier set not installed (see package.brain.json) — skipping chroma-setup + unit-brain* projects. Run `npm run install-brain` to arm them.');
}

export default defineConfig({
    testDir      : path.join(__dirname, 'unit'),
    outputDir    : path.join(__dirname, 'test-results/unit'),
    fullyParallel: true,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    // Re-land of the measured ~2.7× win. `1` was not a preference — it was the mask: single-worker
    // ordering hides cross-file isolation defects, three of which were found and fixed by the
    // enabler leaves before this flip became re-attemptable.
    //
    // Local is NOT the instrument. The local runner cannot hold a wide unit run (the Chroma/web-server
    // lifecycle contends), and single-worker local green says nothing about ordering that only exists
    // at four. The falsifier lives in CI, which is why this ships as a probe rather than a claim.
    //
    // Read `retries: 2` above together with this line: a retry can convert an isolation flake into a
    // reported pass, so a green sample is only evidence when its retry count is ZERO. Green-after-retry
    // is the failure this flip exists to surface, wearing a pass.
    workers : process.env.CI ? 4 : undefined,
    reporter: [['json', {outputFile: path.join(__dirname, 'test-results/unit/test-results.json')}]],
    use     : {trace: 'on-first-retry'},
    projects: buildProjects({brainPresent})
});
