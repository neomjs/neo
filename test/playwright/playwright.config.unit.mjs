import './configTemplateResolver.mjs';

import {defineConfig}      from '@playwright/test';
import {existsSync}        from 'node:fs';
import path                from 'path';
import {fileURLToPath}     from 'url';
import {resolvePackageDir} from './chromaProcess.mjs';

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

// NOTE: this config carried a `unit-profiling` project for wall-clock-budget specs, isolated behind
// a `dependencies` barrier plus `workers: 1` so each measured on an uncontended CPU. Its only two
// members were the DevIndex profiling specs, and both — along with the isolation mechanism — moved
// to `neomjs/devindex` with the app. A project whose `testMatch` selects nothing does not fail; it
// reports zero tests and reads as passing, so the empty scaffold was removed rather than left as a
// green that means nothing. Reintroduce it here the same way if neo ever grows its own wall-clock
// budgets — a ratio or a loose timeout is NOT one, since those survive contention.

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
 * @summary Probes whether the Brain-tier set is installed AND consumable, as resolved from `rootDir`.
 * Directory names alone lie: a pruned or corrupt install can leave three empty husks that
 * false-green CI. The probe therefore checks each root's consumable entrypoint — for
 * `better-sqlite3` including the compiled native artifact (the thing a broken build actually
 * loses). It deliberately stops at artifact presence rather than `require()`: loading the
 * default embedder pulls `@huggingface/transformers` (seconds at every config load), while the
 * only artifact that realistically breaks without leaving a file-level trace is the native one.
 *
 * The husk check is why this cannot simply become `require.resolve`: resolution answers "is there an
 * entrypoint", never "did the native build produce its artifact", so it would report armed for
 * exactly the broken install this probe exists to catch. Resolution is used to find the package
 * DIRECTORY ({@link resolvePackageDir}); the file checks inside it are unchanged.
 * @param {String} rootDir Directory to resolve `node_modules` from — a repo root or a worktree.
 * @returns {Boolean}
 */
export function hasBrainTier(rootDir) {
    return [
        ['better-sqlite3', 'lib/index.js', 'build/Release/better_sqlite3.node'],
        ['chromadb', 'dist/chromadb.mjs'],
        ['@chroma-core/default-embed', 'dist/default-embed.mjs']
    ].every(([pkg, ...entrypoints]) => {
        const packageDir = resolvePackageDir(rootDir, pkg);

        return packageDir !== null && entrypoints.every(entry => existsSync(path.join(packageDir, entry)))
    })
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
        testIgnore: [brainTestMatch, brainHookTestMatch]
    };

    if (!brainPresent) return [bodyBulk];

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
    }];
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
