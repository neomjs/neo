import {defineConfig, devices}    from '@playwright/test';
import {assertInstallMatchesLock} from '../../buildScripts/util/check-installed-dependencies.mjs';
import {resolveFreePortSync}      from './resolveFreePort.mjs';

assertInstallMatchesLock();

/**
 * Opt-in 3-engine (`chromium`, `webkit`, `firefox`) browser verification for `Neo.main.addon.Clipboard`
 * against the real OS clipboard under genuine keyboard gestures (`Cmd/Ctrl+C`, `Cmd/Ctrl+X`, `Cmd/Ctrl+V`)
 * with zero Playwright clipboard-permission overrides.
 *
 * Kept out of the default `npm test` / `test-components` / `test-e2e` gates because real clipboard writes
 * mutate the host machine's shared OS clipboard and hosted CI runners install Chromium only.
 *
 * Run deliberately via:
 *     npm run test-clipboard
 */
const PORT = resolveFreePortSync(process.env.NEO_CLIPBOARD_PORT);
process.env.NEO_CLIPBOARD_PORT = String(PORT);

export default defineConfig({
    testDir      : './clipboard',
    outputDir    : './test-results/clipboard/artifacts',
    fullyParallel: false,
    workers      : 1,
    retries      : 0,

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/clipboard/results.json'}]
    ],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on-first-retry'
    },

    webServer: {
        command            : `node ./e2e/globalSetup.mjs && npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: false
    },

    projects: [
        {
            name: 'chromium',
            use : {...devices['Desktop Chrome']}
        },
        {
            name: 'webkit',
            use : {...devices['Desktop Safari']}
        },
        {
            name: 'firefox',
            use : {...devices['Desktop Firefox']}
        }
    ]
});
