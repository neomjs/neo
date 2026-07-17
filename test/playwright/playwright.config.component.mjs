import './configTemplateResolver.mjs';

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
        // --no-open: CI runners are headless; webpack's browser-open attempt is noise there
        // and pointless locally under a test runner. Port/reuse semantics stay untouched:
        // a fixed port + reuseExistingServer can still silently reuse a server from another
        // checkout locally — that trap is a separate concern from CI enablement.
        command            : 'npm run server-start -- --no-open',
        url                : 'http://localhost:8080',
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
