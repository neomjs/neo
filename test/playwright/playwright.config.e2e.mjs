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
        name: 'chromium',
        use : {
            channel      : 'chrome', // Use local Google Chrome instead of Playwright's Chromium binary
            launchOptions: {
                args: [
                    // NEVER pass '--use-gl=desktop' or '--disable-software-rasterizer' here: modern Chrome's
                    // GL allowlist is ANGLE-only (metal/opengl/swiftshader), so 'desktop' resolves to gl=none —
                    // the GPU process then dies at EVERY window birth, and with the software fallback disabled
                    // Chromium's crash threshold kills the whole browser mid-test in headed mode: the second
                    // popup birth crossed it deterministically ("GPU process isn't usable. Goodbye." → SIGTRAP,
                    // all SharedWorkers gone). Without the overrides Chrome selects its supported ANGLE
                    // backend — measured on this seat with this flag set, headed AND headless:
                    // "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)".
                    '--ignore-gpu-blocklist',
                    '--enable-gpu-rasterization',
                    '--enable-zero-copy',
                    '--enable-accelerated-2d-canvas',
                    '--disable-frame-rate-limit',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--js-flags=--max_old_space_size=8192',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-dev-shm-usage',
                    '--disable-ipc-flooding-protection',
                    '--force-gpu-mem-available-mb=4096',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            }
        }
    }]
});
