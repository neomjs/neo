import './configTemplateResolver.mjs';

import {defineConfig, devices} from '@playwright/test';

// Overridable so agent/dev runs can isolate from a foreign dev-server already squatting on 8080
// (a server started from ANOTHER checkout silently serves the wrong tree to every spec).
const PORT = process.env.NEO_E2E_PORT || 8080;

/**
 * The tear-out portability-matrix runner (see
 * `learn/guides/specificfeatures/TearOutPortabilityMatrix.md`).
 *
 * Deliberately SEPARATE from `playwright.config.e2e.mjs`: the e2e config's benchmark launch
 * flags (`--use-gl=desktop`, GPU rasterization overrides) are headless-calibrated — in HEADED
 * mode on macOS they crash Chrome's GPU process ("GPU process isn't usable"), and the matrix
 * contract requires headed real-browser runs. Beyond the crash, GL/GPU overrides would distort
 * exactly the native placement semantics this suite exists to measure — the matrix browser
 * runs on stock launch defaults, so receipts describe the platform, not our flags.
 *
 * Note for row 2 (acquisition): Playwright's default launch args include
 * `--disable-popup-blocking`; the acquisition cells manage popup-blocking state explicitly
 * per measurement instead of trusting the harness default.
 */
export default defineConfig({
    testDir      : './e2e/colors',
    testMatch    : 'tearOutMatrix.spec.mjs',
    outputDir    : './test-results/matrix/artifacts',
    fullyParallel: false, // native window placement is a global resource — strictly serial
    workers      : 1,
    timeout      : 120000,

    reporter: [['list']],

    use: {
        baseURL: `http://localhost:${PORT}`,
        trace  : 'on-first-retry'
    },

    webServer: {
        command            : `npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium',
        use : {...devices['Desktop Chrome']}
    }]
});
