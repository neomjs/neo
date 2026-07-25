import './configTemplateResolver.mjs';

import {defineConfig, devices} from '@playwright/test';
import {resolveFreePortSync}   from './resolveFreePort.mjs';
import {E2E_LAUNCH_ARGS}       from './e2e/utils/gpuIntent.mjs';
import {BASE_LAUNCH_ARGS}      from './e2e/utils/gpuIntent.mjs';

// Film-take launch profile: capture needs frames ON GLASS. `--disable-frame-rate-limit`
// suppresses headed compositing entirely on retina hosts (page.screenshot starves for the
// full test timeout; every screen-capture grain records black while worker-truth stays
// green), and the GPU-intent args are benchmark claims a film take does not make. The
// backgrounding-disable trio STAYS: a newborn tear-out vessel is an occluded window whose
// renderer must keep running long enough to join the shared heap, or vessels are never
// born. Bisect receipt table: the film-profile ticket this block cites.
// NEO_FILM_KEEP_GPU: bisect knob — the film profile changed TWO things at once
// (dropped the frame-rate-limit flag AND the four GPU-intent flags); this isolates the
// second half: E2E args minus ONLY the frame-limiter.
const FILM_LAUNCH_ARGS = (process.env.NEO_FILM_KEEP_GPU ? E2E_LAUNCH_ARGS : BASE_LAUNCH_ARGS)
    .filter(arg => arg !== '--disable-frame-rate-limit');

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
        use      : {channel: 'chrome', launchOptions: {args: E2E_LAUNCH_ARGS}}
    }, {
        name        : 'chromium',
        dependencies: ['gl-probe'],
        use         : {
            // Use local Google Chrome instead of Playwright's Chromium binary.
            // NEO_FILM_CHROMIUM: bisect knob — the bundled Chromium carries a DIFFERENT
            // macOS bundle id, so per-bundle desktop state (Space assignment, the AllSpaces Dock
            // binding) does not apply: it isolates bundle-environmental effects on vessel birth.
            ...(process.env.NEO_FILM_CHROMIUM ? {} : {channel: 'chrome'}),
            // Declared once in e2e/utils/gpuIntent.mjs so the boot probe reads the same list this
            // launches with. A second copy here would drift, and drift between two statements of one
            // fact is how a dead GL flag stayed invisible for five months.
            launchOptions: {args: process.env.NEO_FILM_TAKE ? FILM_LAUNCH_ARGS : E2E_LAUNCH_ARGS}
        }
    }]
});
