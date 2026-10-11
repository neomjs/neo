
import {defineConfig, devices} from '@playwright/test';
import path                    from 'path';
import {fileURLToPath}         from 'url';
import {resolveFreePortSync}   from './resolveFreePort.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Per-process by default: this aggregate runner loads browser-served framework code too, so a fixed
// default would silently adopt a foreign dev-server squatting on 8080 — the WRONG tree for every spec
// (the convicted cross-serving class). An explicit NEO_E2E_PORT pin still wins.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);
// Pin it back into the env: Playwright re-imports this config in the webServer + each worker process,
// and resolveFreePortSync returns a FRESH port per call — without pinning, the webServer and a worker's
// baseURL land on different ports (ERR_CONNECTION_REFUSED). Children inherit this; a real pin is a no-op.
process.env.NEO_E2E_PORT = String(PORT);

export default defineConfig({
    testDir      : __dirname,
    testMatch    : /.*\.spec\.mjs/,
    // The update-chain goal bar is DELIBERATELY red until its legs land, and it is opt-in via its own
    // config. Without this ignore it is collected here too, because `testDir` is the whole tree and
    // `testMatch` takes every spec — so the repo's headline local command would run a scenario built to
    // fail, which is exactly how a permanently-red check gets routed around within a week.
    //
    // Enforced rather than incidental: the aggregate runner also sets `retries` below, which would defeat
    // that project's deliberate `retries: 0` invariant — a goal bar passing on attempt two has already
    // told you the chain is unreliable.
    testIgnore   : /update-chain\//,
    outputDir    : path.join(__dirname, 'test-results/all'),
    fullyParallel: false,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    workers      : 1,

    reporter: [['json', {outputFile: path.join(__dirname, 'test-results/all/test-results.json')}]],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on-first-retry'
    },

    webServer: {
        // NEVER reuse: an already-listening server from a foreign clone satisfies the readiness URL
        // and silently serves the wrong tree to every spec (false reds AND, worse, false greens).
        command            : `npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: false
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
