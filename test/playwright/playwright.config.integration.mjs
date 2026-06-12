import {defineConfig} from '@playwright/test';

export default defineConfig({
    testDir      : './integration',
    outputDir    : './test-results/integration/artifacts',
    fullyParallel: false,
    workers      : 1,
    timeout      : 120000,

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/integration/results.json'}]
    ],

    use: {
        trace: 'on-first-retry'
    },

    webServer: {
        command: 'node ./integration/fixtures/composeWebServer.mjs',
        url: 'http://127.0.0.1:13090/ready',
        timeout: 240000,
        reuseExistingServer: false,
        stdout: 'pipe',
        stderr: 'pipe',
        gracefulShutdown: {
            signal: 'SIGTERM',
            timeout: 30000
        }
    }
});
