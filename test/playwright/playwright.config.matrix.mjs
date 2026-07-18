import './configTemplateResolver.mjs';

import {defineConfig} from '@playwright/test';

// Overridable so agent/dev runs can isolate from a foreign dev-server already squatting on 8080:
// with `reuseExistingServer` a server started from ANOTHER checkout silently serves the wrong tree
// to every probe — set NEO_E2E_PORT to a private port to guarantee the served tree is this one.
const PORT = process.env.NEO_E2E_PORT || 8080;

/**
 * The tear-out portability-matrix runner (see
 * `learn/guides/specificfeatures/TearOutPortabilityMatrix.md` — the evidence ledger).
 *
 * Deliberately SEPARATE from `playwright.config.e2e.mjs`: the e2e config's benchmark launch
 * flags (`--use-gl=desktop`, GPU rasterization overrides) are headless-calibrated — in HEADED
 * mode on macOS they crash Chrome's GPU process ("GPU process isn't usable"), and the matrix
 * contract requires headed real-browser runs. Beyond the crash, GL/GPU overrides would distort
 * exactly the native placement semantics this suite measures.
 *
 * Measurement-fidelity choices, stated honestly:
 * - **Headed by default** (`headless: false`): headed IS this runner's identity — headless proves
 *   wiring, never native placement. No `--headed` flag needed; CI must not run this config.
 * - **No device preset**: `devices['Desktop Chrome']` would stamp a Windows-shaped profile onto
 *   the local browser — the probes measure THIS platform, so the browser runs its own defaults.
 * - **Popup blocking is NOT controlled yet**: Playwright's default launch args include
 *   `--disable-popup-blocking`, and NO current probe manages blocking state — every acquisition
 *   receipt is measured under blocking-disabled conditions. Blocking-controlled acquisition
 *   cells are future matrix-contract child work (ticket-ref-ok: #15243 is the open 7×3
 *   contract authority this runner serves) and will need their own launch configuration.
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
        baseURL : `http://localhost:${PORT}`,
        headless: false,
        trace   : 'on-first-retry',
        // Explicit NEUTRAL viewport — the one profile field the probe choreography's geometry
        // depends on (drag paths compute against it), set platform-neutrally instead of pulling
        // the full Desktop-Chrome device preset (whose Windows-shaped UA/profile would distort
        // the platform under measurement). Probed: the preset-free default profile reaped the
        // row-1 popup 4/4 — the geometry dependency is real; an explicit viewport restores it.
        viewport: {height: 720, width: 1280}
    },

    webServer: {
        command            : `npm run server-start -- --port ${PORT} --no-open`,
        url                : `http://localhost:${PORT}`,
        reuseExistingServer: !process.env.CI
    },

    projects: [{
        name: 'chromium'
    }]
});
