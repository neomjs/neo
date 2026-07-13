import './configTemplateResolver.mjs';

import {defineConfig, devices} from '@playwright/test';

// Overridable so agent/dev runs can isolate from a foreign dev-server already squatting on 8080
// (a server started from ANOTHER checkout silently serves the wrong tree to every spec).
const PORT = process.env.NEO_E2E_PORT || 8080;

export default defineConfig({
    testDir      : './e2e',
    outputDir    : './test-results/e2e/artifacts',
    fullyParallel: false, // Maintain serial execution for benchmarks
    workers      : 1,     // Maintain serial execution for benchmarks
    timeout      : 90000, // E2E tests (like DevIndex) are heavy rendering apps

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
        command            : `npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {
            channel      : 'chrome', // Use local Google Chrome instead of Playwright's Chromium binary
            launchOptions: {
                args: [
                    '--use-gl=desktop',
                    '--ignore-gpu-blocklist',
                    '--enable-gpu-rasterization',
                    '--enable-zero-copy',
                    '--enable-accelerated-2d-canvas',
                    '--disable-software-rasterizer',
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
