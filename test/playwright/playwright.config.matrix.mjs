
import {defineConfig}        from '@playwright/test';
import {resolveFreePortSync} from './resolveFreePort.mjs';

// Foreign-tree evidence is structurally impossible here: an explicit NEO_E2E_PORT pin wins,
// otherwise an OS-assigned free port is probed per process — and the webServer below never
// adopts an existing listener, so every probe run serves exactly THIS checkout's tree.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);

// Pin the resolved authority for every process that re-imports this config. The specs navigate
// relative to baseURL, but child helpers and future matrix rows must still observe the same port
// as the webServer instead of resolving a second free port during worker bootstrap.
process.env.NEO_E2E_PORT = String(PORT);

/**
 * The tear-out portability-matrix runner (see
 * `learn/guides/specificfeatures/TearOutPortabilityMatrix.md` — the evidence ledger).
 *
 * Deliberately SEPARATE from `playwright.config.e2e.mjs`: that config can opt into engine
 * launch flags (GPU rasterization overrides) calibrated for throughput benchmarks, and any
 * GL/GPU override would distort exactly the native placement semantics this suite measures.
 * The matrix contract requires headed real-browser runs on platform defaults.
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
    testDir  : './e2e',
    testMatch: [
        '**/colors/tearOutMatrix.spec.mjs',
        '**/agentos/TearOutMatrixRows4To7NL.spec.mjs',
        '**/agentos/DemoBVesselConversionNL.spec.mjs',
        '**/agentos/DemoBCrossWindowDragNL.spec.mjs',
        '**/agentos/DemoBThirdClaimantStageNL.spec.mjs',
        '**/agentos/FleetPermanenceMatrixRow4NL.spec.mjs'
    ],
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
        command: `npm run server-start -- --port ${PORT} --no-open`,
        url    : `http://localhost:${PORT}`,
        // NEVER adopt an existing listener: reuse is how a server from ANOTHER checkout silently
        // serves the wrong tree to every probe (the foreign-server evidence class).
        reuseExistingServer: false
    },

    projects: [{
        // Real Google Chrome, matching the ledger's "macOS Chrome" receipts — the bare project
        // would launch bundled Chromium, a different browser than the one the evidence names.
        name: 'chrome',
        use : {channel: 'chrome'}
    }]
});
