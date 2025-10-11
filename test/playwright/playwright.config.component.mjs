import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir      : './component',
    fullyParallel: false,
    workers      : 1,

    reporter: [['list']],

    use: {
        baseURL: 'http://localhost:8080',
        trace  : 'on-first-retry'
    },

    webServer: {
        command          : 'npm run server-start',
        url              : 'http://localhost:8080',
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
