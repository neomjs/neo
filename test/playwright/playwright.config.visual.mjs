
import {defineConfig, devices} from '@playwright/test';
import {resolveFreePortSync}   from './resolveFreePort.mjs';

// Per-process by default: this suite must render ITS OWN checkout (reuseExistingServer:false),
// so a fixed default both collides with a foreign dev-server squatting on 8080 AND wedges
// concurrent visual runs on the shared multi-agent machine (see resolveFreePort.mjs). An
// explicit NEO_E2E_PORT pin still wins for deliberate isolation.
const PORT = resolveFreePortSync(process.env.NEO_E2E_PORT);

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
        trace        : 'on-first-retry'
    },

    webServer: {
        command: `npm run server-start -- --port ${PORT} --no-open`,
        url    : `http://localhost:${PORT}`,
        // NEVER reuse: a design-authority suite must render ITS OWN checkout — an already-
        // listening server from a foreign clone satisfies the readiness URL and silently
        // bakes the wrong tree's pixels into goldens (the convicted cross-serving class)
        reuseExistingServer: false
    },

    projects: [{
        name: 'chromium',
        // the viewport lands AFTER the device spread on purpose — the spread carries its own
        // viewport (1280×720), and a project-level `use` merges over the top-level block, so
        // a top-level declaration is dead config that silently mis-sizes every golden
        use : {...devices['Desktop Chrome'], viewport: {height: 900, width: 1600}}
    }]
});
