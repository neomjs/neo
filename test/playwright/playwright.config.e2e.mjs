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
            ...devices['Desktop Chrome'],
            launchOptions: {
                args: [
                    '--use-gl=desktop',
                    '--js-flags=--max_old_space_size=4096',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ]
            }
        }
    }]
});
