import './configTemplateResolver.mjs';

import {defineConfig, devices} from '@playwright/test';
import {resolveFreePortSync}   from './resolveFreePort.mjs';
import {activeLaunchArgs}      from './e2e/utils/gpuIntent.mjs';

// Per-process by default: this suite renders ITS OWN checkout (reuseExistingServer:false below), so a
// fixed default would silently adopt a foreign dev-server squatting on 8080 — that server serves the
// WRONG tree to every spec (the convicted cross-serving class). An explicit NEO_E2E_PORT pin still wins.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);
// Pin it back into the env: Playwright re-imports this config in the webServer + each worker process,
// and resolveFreePortSync returns a FRESH port per call — without pinning, the webServer and a worker's
// baseURL land on different ports (ERR_CONNECTION_REFUSED). Children inherit this; a real pin is a no-op.
process.env.NEO_E2E_PORT = String(PORT);

export default defineConfig({
    testDir      : './e2e',
    outputDir    : './test-results/e2e/artifacts',
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
        command            : `node ./e2e/globalSetup.mjs && npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        // NEVER reuse: an already-listening server from a foreign clone satisfies the readiness URL
        // and silently serves the wrong tree to every spec (false reds AND, worse, false greens).
        reuseExistingServer: false
    },

    projects: [{
        // Boot gate: observes that the GPU-intent flags below actually resolve to hardware
        // GL before a single benchmark attributes a number to acceleration it may not have. Launches
        // with the SAME args as the suite — probing a different browser would prove nothing.
        name     : 'gl-probe',
        testMatch: /gl\.setup\.mjs$/,
        use      : {channel: 'chrome', launchOptions: {args: activeLaunchArgs()}}
    }, {
        name        : 'chromium',
        dependencies: ['gl-probe'],
        use         : {
            channel      : 'chrome', // Use local Google Chrome instead of Playwright's Chromium binary
            // Declared once in e2e/utils/gpuIntent.mjs so the boot probe reads the same list this
            // launches with. A second copy here would drift, and drift between two statements of one
            // fact is how a dead GL flag stayed invisible for five months. The mode selection
            // (film vs benchmark) lives in the same module for the same reason.
            launchOptions: {args: activeLaunchArgs()}
        }
    }]
});
