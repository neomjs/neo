import {defineConfig, devices} from '@playwright/test';

// Overridable so agent/dev runs can isolate from a foreign dev-server already squatting on 8080
// (a server started from ANOTHER checkout silently serves the wrong tree to every spec).
const PORT = process.env.NEO_E2E_PORT || 8080;

/**
 * The visual-regression baseline config — pixel-level goldens for the design-led surfaces,
 * captured under a forced-deterministic environment:
 *
 * - `reducedMotion: 'reduce'` collapses EVERY dock/product transition through the motion-token
 *   layer (0ms by construction) — no per-surface animation settling, no timing sleeps;
 * - one fixed viewport per project (the density-evidence desktop breakpoint) — baselines are
 *   per-viewport artifacts, never responsive guesses;
 * - the globalSetup FAILS the run outright when the built theme CSS is older than the newest
 *   SCSS source: a baseline captured over stale artifacts is a poisoned golden (the dist CSS
 *   is a gitignored BUILD artifact — merged styling is invisible until themes rebuild);
 * - baselines live beside their specs (`__screenshots__`) and refresh ONLY through
 *   `--update-snapshots` under THIS config — a refreshed golden is a reviewed design decision
 *   in the PR diff, never a side effect of a passing run.
 *
 * Local-first by design: baselines are rendered-platform artifacts; CI exclusion follows the
 * named-config discipline (this config is simply not wired into the CI workflows).
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test -c test/playwright/playwright.config.visual.mjs --workers=1
 * Refresh: append --update-snapshots (the diff is the review surface)
 */
export default defineConfig({
    testDir      : './visual',
    outputDir    : './test-results/visual/artifacts',
    fullyParallel: false,
    workers      : 1,
    timeout      : 90000,
    globalSetup  : './visual/globalSetup.mjs',

    snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',

    expect: {
        toHaveScreenshot: {
            // tight but not byte-exact: sub-pixel AA drift on identical platforms stays green,
            // a real token/geometry regression does not
            maxDiffPixelRatio: 0.001
        }
    },

    reporter: [
        ['list'],
        ['json', {outputFile: 'test-results/visual/results.json'}]
    ],

    use: {
        baseURL      : `http://localhost:${PORT}`,
        reducedMotion: 'reduce',
        trace        : 'on-first-retry',
        viewport     : {height: 900, width: 1600}
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
