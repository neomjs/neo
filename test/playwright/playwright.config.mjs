import {defineConfig, devices} from '@playwright/test';
import path                    from 'path';
import {fileURLToPath}         from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default defineConfig({
    testDir      : __dirname,
    testMatch    : /.*\.spec\.mjs/,
    outputDir    : path.join(__dirname, 'test-results/all'),
    fullyParallel: false,
    forbidOnly   : !!process.env.CI,
    retries      : process.env.CI ? 2 : 0,
    workers      : 1,

    reporter: [['json', {outputFile: path.join(__dirname, 'test-results/all/test-results.json')}]],

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
