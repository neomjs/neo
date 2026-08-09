import './configTemplateResolver.mjs';

import {defineConfig, devices}             from '@playwright/test';
import {resolveFreePortSync}               from './resolveFreePort.mjs';
import {activeLaunchArgs, requiresGlProbe} from './e2e/utils/gpuIntent.mjs';

// Per-process by default: this suite renders ITS OWN checkout (reuseExistingServer:false below), so a
// fixed default would silently adopt a foreign dev-server squatting on 8080 — that server serves the
// WRONG tree to every spec (the convicted cross-serving class). An explicit NEO_E2E_PORT pin still wins.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);
// Pin it back into the env: Playwright re-imports this config in the webServer + each worker process,
// and resolveFreePortSync returns a FRESH port per call — without pinning, the webServer and a worker's
// baseURL land on different ports (ERR_CONNECTION_REFUSED). Children inherit this; a real pin is a no-op.
process.env.NEO_E2E_PORT = String(PORT);

// Run-scoped artifact isolation (battery discipline): a battery runs the same spec serially, and
// trace:'on' writes every execution's trace into the same per-test directory — run N+1 overwrites
// run N's trace, so a roving red loses its evidence to a later green. NEO_E2E_RUN_ID scopes the
// artifact root per run; unset keeps the legacy solo/film path. Battery invocation, persisting the
// combined stream — Playwright forwards the webServer's stdout/stderr to the reporter by default
// ('pipe'), so the tee below captures playwright AND server output into the run dir (verified:
// 'inherit' is silently dropped by the runner, never forwarded):
//   cd test/playwright && dir="test-results/e2e/battery/run-1" && mkdir -p "$dir" && \
//   NEO_E2E_RUN_ID=run-1 npx playwright test -c playwright.config.e2e.mjs e2e/<spec> 2>&1 | tee "$dir/run.log"
const RUN_ID        = process.env.NEO_E2E_RUN_ID || null,
      ARTIFACT_ROOT = RUN_ID ? `./test-results/e2e/battery/${RUN_ID}/artifacts` : './test-results/e2e/artifacts';

const
    launchArgs     = activeLaunchArgs(),
    needsGlProbe   = requiresGlProbe(launchArgs),
    browserProject = {
        name: 'chromium',
        use : {
            channel: 'chrome', // Use local Google Chrome instead of Playwright's Chromium binary
            // Declared once in e2e/utils/gpuIntent.mjs so the boot probe reads the same list this
            // launches with. A second copy here would drift, and drift between two statements of one
            // fact is how a dead GL flag stayed invisible for five months. The mode selection
            // (presenting default vs explicit engine profile) lives there for the same reason.
            launchOptions: {args: launchArgs}
        }
    };

export default defineConfig({
    testDir      : './e2e',
    outputDir    : ARTIFACT_ROOT,
    fullyParallel: false, // Maintain serial execution for benchmarks
    workers      : 1,     // Maintain serial execution for benchmarks
    timeout      : 90000, // E2E tests (like DevIndex) are heavy rendering apps
    globalSetup  : './e2e/globalSetup.mjs',

    reporter: [
        ['list'],
        ['html', { outputFolder: 'test-results/e2e/html-report', open: 'never' }],
        ['json', { outputFile: 'test-results/e2e/results.json' }],
        ['./e2e/custom-reporter.js', { outputFile: 'test-results/e2e/benchmark-system-info.json' }]
    ],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on'
    },

    webServer: {
        command: `node ./e2e/globalSetup.mjs && npm run server-start -- --port ${PORT} --no-open`,
        url    : `http://localhost:${PORT}`,
        // NEVER reuse: an already-listening server from a foreign clone satisfies the readiness URL
        // and silently serves the wrong tree to every spec (false reds AND, worse, false greens).
        reuseExistingServer: false
    },

    // A presenting run makes no GPU claim, so its plan contains one branded-Chrome owner. The
    // explicit engine profile keeps the separate live-GL gate and its dependency ordering.
    projects: needsGlProbe ? [{
        // Boot gate: observes that the GPU-intent flags below actually resolve to hardware
        // GL before a single benchmark attributes a number to acceleration it may not have. Launches
        // with the SAME args as the suite — probing a different browser would prove nothing.
        name     : 'gl-probe',
        testMatch: /gl\.setup\.mjs$/,
        use      : {channel: 'chrome', launchOptions: {args: launchArgs}}
    }, {
        ...browserProject,
        dependencies: ['gl-probe']
    }] : [browserProject]
});
