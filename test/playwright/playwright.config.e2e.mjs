import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir      : './e2e',
    outputDir    : './test-results/e2e',
    fullyParallel: false, // Maintain serial execution for benchmarks
    workers      : 1,     // Maintain serial execution for benchmarks

    reporter: [
        ['list'],
        ['html', { outputFolder: 'test-results/e2e/html-report', open: 'never' }],
        ['json', { outputFile: 'test-results/e2e/results.json' }],
        ['./e2e/custom-reporter.js', { outputFile: 'test-results/e2e/benchmark-system-info.json' }]
    ],

    use: {
        baseURL: 'http://localhost:8080',
        trace  : 'on'
    },

    webServer: {
        command            : 'npm run server-start',
        url                : 'http://localhost:8080',
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {
            channel: 'chrome', // Use local Google Chrome instead of Playwright's Chromium binary
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
