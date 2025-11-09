import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir      : './component',
    outputDir    : './test-results/component',
    fullyParallel: false, // CRITICAL
    workers      : 1,     // CRITICAL

    reporter: [['list']],

    use: {
        baseURL: 'http://localhost:8080',
        trace  : 'on-first-retry'
    },

    webServer: {
        command            : 'npm run server-start',
        url                : 'http://localhost:8080',
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
