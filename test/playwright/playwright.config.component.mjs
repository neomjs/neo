
import {defineConfig, devices} from '@playwright/test';
import {resolveFreePortSync}   from './resolveFreePort.mjs';

// Per-process by default: this suite renders ITS OWN checkout (reuseExistingServer:false below), so a
// fixed default would silently adopt a foreign dev-server squatting on 8080 — that server serves the
// WRONG tree to every spec (the convicted cross-serving class). An explicit NEO_E2E_PORT pin still wins.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);
// Pin it back into the env: Playwright re-imports this config in the webServer + each worker process,
// and resolveFreePortSync returns a FRESH port per call — without pinning, the webServer and a worker's
// baseURL land on different ports (ERR_CONNECTION_REFUSED). Children inherit this; a real pin is a no-op.
process.env.NEO_E2E_PORT = String(PORT);

export default defineConfig({
    testDir      : './component',
    outputDir    : './test-results/component',
    fullyParallel: false, // CRITICAL
    workers      : 1,     // CRITICAL
    globalSetup  : './e2e/globalSetup.mjs',

    reporter: [['list']],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on-first-retry'
    },

    webServer: {
        // Playwright starts webServer before globalSetup. Run the shared idempotent theme preflight
        // here as well, so a tracked-only checkout cannot serve UA-only layout to component witnesses.
        // --no-open keeps headless CI quiet. NEVER reuse: a foreign server can satisfy readiness while
        // serving the wrong tree (false reds AND, worse, false greens).
        command            : `node ./e2e/globalSetup.mjs && npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: false
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
