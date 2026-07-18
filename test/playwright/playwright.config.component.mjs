import './configTemplateResolver.mjs';

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

    reporter: [['list']],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on-first-retry'
    },

    webServer: {
        // --no-open: CI runners are headless; webpack's browser-open attempt is noise there and
        // pointless locally under a test runner. NEVER reuse: an already-listening server from a
        // foreign clone satisfies the readiness URL and silently serves the wrong tree to every spec
        // (false reds AND, worse, false greens) — the exact trap this suite hit repeatedly.
        command            : `npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: false
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
