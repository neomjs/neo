import {expect, test}                           from '@playwright/test';
import {
    activeLaunchArgs,
    claimsGpuAcceleration,
    ENGINE_LAUNCH_ARGS,
    GPU_INTENT_ARGS,
    isEngineProfile,
    isFilmTake,
    PRESENTING_LAUNCH_ARGS,
    requiresGlProbe
}                                                from '../../e2e/utils/gpuIntent.mjs';
import {readGlState, SOFTWARE_RENDERER_MARKERS}   from '../../e2e/utils/glState.mjs';

/**
 * @summary Coverage for the E2E boot probe's decision core.
 *
 * `readGlState` takes a Playwright page and calls one `evaluate`, so the browser is an injected seam
 * and every branch is reachable with a fake. That matters more than usual here: the `unobserved`
 * branch cannot be produced by any launch flag — `WEBGL_debug_renderer_info` is available on every
 * seat we run on — so without a fake it would be a branch that only exists in the source. A guard
 * whose third state has never once been observed firing is indistinguishable from one that has two.
 *
 * The `accelerated` and `degraded` states are additionally proven end-to-end against a real Chrome
 * in the PR's red/green evidence; these tests pin the classification, not the browser.
 */
test.describe('e2e/utils/glState', () => {
    const fakePage = value => ({
        evaluate: async () => {
            if (value instanceof Error) throw value;
            return value
        }
    });

    test('#15813 no WebGL context at all is DEGRADED — the #15664 signature', async () => {
        // Measured, not imagined: launching Chrome with --use-gl=desktop + --disable-software-rasterizer
        // returns exactly {context: false}. That is the state the suite shipped in for five months.
        const result = await readGlState(fakePage({context: false}));

        expect(result.state).toBe('degraded');
        expect(result.reason).toBe('no-webgl-context');
        expect(result.renderer).toBeNull();
    });

    test('#15813 a hardware renderer is ACCELERATED', async () => {
        const result = await readGlState(fakePage({
            context : true,
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)',
            vendor  : 'Google Inc. (Apple)',
            generic : 'WebKit WebGL'
        }));

        expect(result.state).toBe('accelerated');
        expect(result.reason).toBeNull();
        expect(result.renderer).toContain('Metal');
    });

    test('#15813 every software marker classifies as DEGRADED, not accelerated', async () => {
        for (const marker of SOFTWARE_RENDERER_MARKERS) {
            const result = await readGlState(fakePage({
                context : true,
                renderer: `ANGLE (Google, Vulkan 1.3 (${marker} Device))`,
                vendor  : 'Google Inc.',
                generic : 'WebKit WebGL'
            }));

            expect(result.state, `marker "${marker}" must classify as degraded`).toBe('degraded');
            expect(result.reason).toContain(marker);
        }
    });

    test('#15813 marker matching is case-insensitive — renderer strings are vendor-formatted', async () => {
        // Renderer strings are whatever the driver prints; "SwiftShader" ships capitalised, and a
        // case-sensitive match would have let the real-world spelling through.
        const result = await readGlState(fakePage({
            context : true,
            renderer: 'ANGLE (Google, Vulkan 1.3 (SwiftShader Device))',
            vendor  : 'Google Inc.',
            generic : 'WebKit WebGL'
        }));

        expect(result.state).toBe('degraded');
    });

    test('#15813 a context WITHOUT a usable renderer string is UNOBSERVED, never accelerated', async () => {
        // The branch this whole module exists for. A context exists, so the naive read is "GL works";
        // but the renderer is unidentifiable, so software rendering cannot be ruled out. Reporting
        // accelerated here would be the absence of evidence spoken as evidence.
        const result = await readGlState(fakePage({
            context : true,
            renderer: null,
            vendor  : null,
            generic : 'WebKit WebGL'
        }));

        expect(result.state).toBe('unobserved');
        expect(result.reason).toBe('webgl-debug-renderer-info-unavailable');
        expect(result.generic).toBe('WebKit WebGL'); // still reported — the reader may want it
    });

    test('#15813 the probe FAILING is not the browser being healthy', async () => {
        const result = await readGlState(fakePage(new Error('Target page, context or browser has been closed')));

        expect(result.state).toBe('unobserved');
        expect(result.reason).toContain('probe-evaluation-failed');
        expect(result.reason).toContain('browser has been closed');
    });

    test('#15813 the demand is armed by the declaration, not hardcoded', async () => {
        // A config that claims nothing must be able to demand nothing, or the gate becomes something
        // a headless lane has to switch off — and a gate people switch off is worse than no gate.
        expect(claimsGpuAcceleration(GPU_INTENT_ARGS)).toBe(true);
        expect(claimsGpuAcceleration(['--no-sandbox', '--disable-dev-shm-usage'])).toBe(false);
        expect(claimsGpuAcceleration([])).toBe(false);

        // Tuning flags do not by themselves claim acceleration and must not arm the demand.
        expect(claimsGpuAcceleration(['--disable-frame-rate-limit', '--force-gpu-mem-available-mb=4096'])).toBe(false);
        expect(claimsGpuAcceleration()).toBe(false)
    });

    test('#16128 presenting is default; only the exact engine sentinel selects the engine profile', () => {
        const
            previousEngine = process.env.NEO_E2E_ENGINE_PROFILE,
            previousFilm   = process.env.NEO_FILM_TAKE;

        try {
            delete process.env.NEO_E2E_ENGINE_PROFILE;
            delete process.env.NEO_FILM_TAKE;

            expect(isEngineProfile()).toBe(false);
            expect(isFilmTake()).toBe(false);
            expect(activeLaunchArgs()).toBe(PRESENTING_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(false);

            process.env.NEO_E2E_ENGINE_PROFILE = '0';
            expect(isEngineProfile()).toBe(false);
            expect(activeLaunchArgs()).toBe(PRESENTING_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(false);

            process.env.NEO_E2E_ENGINE_PROFILE = 'false';
            expect(isEngineProfile()).toBe(false);
            expect(activeLaunchArgs()).toBe(PRESENTING_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(false);

            process.env.NEO_E2E_ENGINE_PROFILE = 'engine';
            expect(isEngineProfile()).toBe(false);
            expect(activeLaunchArgs()).toBe(PRESENTING_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(false);

            delete process.env.NEO_E2E_ENGINE_PROFILE;
            process.env.NEO_FILM_TAKE = '1';
            expect(isFilmTake()).toBe(true);
            expect(activeLaunchArgs()).toBe(PRESENTING_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(false);

            delete process.env.NEO_FILM_TAKE;
            process.env.NEO_E2E_ENGINE_PROFILE = '1';
            expect(isEngineProfile()).toBe(true);
            expect(activeLaunchArgs()).toBe(ENGINE_LAUNCH_ARGS);
            expect(requiresGlProbe()).toBe(true);
            expect(ENGINE_LAUNCH_ARGS).toContain('--disable-frame-rate-limit');
            expect(PRESENTING_LAUNCH_ARGS).not.toContain('--disable-frame-rate-limit');

            process.env.NEO_FILM_TAKE = '1';
            expect(() => activeLaunchArgs()).toThrow(
                'NEO_FILM_TAKE=1 cannot be combined with NEO_E2E_ENGINE_PROFILE=1'
            )
        } finally {
            if (previousEngine === undefined) {
                delete process.env.NEO_E2E_ENGINE_PROFILE
            } else {
                process.env.NEO_E2E_ENGINE_PROFILE = previousEngine
            }

            if (previousFilm === undefined) {
                delete process.env.NEO_FILM_TAKE
            } else {
                process.env.NEO_FILM_TAKE = previousFilm
            }
        }
    });

    test('#16151 presenting config has one Chrome owner; engine config retains the GL probe', async () => {
        const
            previousEngine      = process.env.NEO_E2E_ENGINE_PROFILE,
            previousFilm        = process.env.NEO_FILM_TAKE,
            previousPort        = process.env.NEO_E2E_PORT,
            previousLifecycleId = process.env.NEO_E2E_LIFECYCLE_RUN_ID;

        try {
            delete process.env.NEO_E2E_ENGINE_PROFILE;
            process.env.NEO_FILM_TAKE = '1';

            const presentingConfig = (
                await import(`../../playwright.config.e2e.mjs?profile=presenting-${Date.now()}`)
            ).default;

            expect(presentingConfig.projects.map(project => project.name)).toEqual(['chromium']);
            expect(presentingConfig.projects[0].dependencies).toBeUndefined();
            expect(presentingConfig.projects[0].use.launchOptions.args).toBe(PRESENTING_LAUNCH_ARGS);

            delete process.env.NEO_FILM_TAKE;
            process.env.NEO_E2E_ENGINE_PROFILE = '1';

            const engineConfig = (
                await import(`../../playwright.config.e2e.mjs?profile=engine-${Date.now()}`)
            ).default;

            expect(engineConfig.projects.map(project => project.name)).toEqual(['gl-probe', 'chromium']);
            expect(engineConfig.projects[1].dependencies).toEqual(['gl-probe']);
            expect(engineConfig.projects[0].use.launchOptions.args).toBe(ENGINE_LAUNCH_ARGS);
            expect(engineConfig.projects[1].use.launchOptions.args).toBe(ENGINE_LAUNCH_ARGS)
        } finally {
            if (previousEngine === undefined) {
                delete process.env.NEO_E2E_ENGINE_PROFILE
            } else {
                process.env.NEO_E2E_ENGINE_PROFILE = previousEngine
            }

            if (previousFilm === undefined) {
                delete process.env.NEO_FILM_TAKE
            } else {
                process.env.NEO_FILM_TAKE = previousFilm
            }

            if (previousPort === undefined) {
                delete process.env.NEO_E2E_PORT
            } else {
                process.env.NEO_E2E_PORT = previousPort
            }

            if (previousLifecycleId === undefined) {
                delete process.env.NEO_E2E_LIFECYCLE_RUN_ID
            } else {
                process.env.NEO_E2E_LIFECYCLE_RUN_ID = previousLifecycleId
            }
        }
    });

    test('#17679 E2E config retains one receipt identity outside outputDir across re-imports', async () => {
        const
            previousEngine      = process.env.NEO_E2E_ENGINE_PROFILE,
            previousFilm        = process.env.NEO_FILM_TAKE,
            previousPort        = process.env.NEO_E2E_PORT,
            previousRunId       = process.env.NEO_E2E_RUN_ID,
            previousLifecycleId = process.env.NEO_E2E_LIFECYCLE_RUN_ID,
            reporterOptions     = config => config.reporter.find(([name]) => (
                name === './e2e/custom-reporter.js'
            ))[1];

        try {
            delete process.env.NEO_E2E_ENGINE_PROFILE;
            delete process.env.NEO_FILM_TAKE;
            delete process.env.NEO_E2E_RUN_ID;
            delete process.env.NEO_E2E_LIFECYCLE_RUN_ID;

            const first = (
                      await import(`../../playwright.config.e2e.mjs?receipt=first-${Date.now()}`)
                  ).default,
                  second = (
                      await import(`../../playwright.config.e2e.mjs?receipt=second-${Date.now()}`)
                  ).default,
                  firstReceipt = reporterOptions(first),
                  secondReceipt = reporterOptions(second);

            expect(first.outputDir).toBe('./test-results/e2e/artifacts');
            expect(firstReceipt.runId).toMatch(/^[a-f0-9-]{36}$/);
            expect(firstReceipt.retentionLimit).toBe(100);
            expect(secondReceipt.runId).toBe(firstReceipt.runId);
            expect(secondReceipt.outputFile).toBe(firstReceipt.outputFile);
            expect(firstReceipt.outputFile).toMatch(
                /^test-results\/e2e\/browser-lifecycle\/receipt-[a-f0-9]{64}\.json$/
            );
            expect(firstReceipt.outputFile.startsWith(first.outputDir.replace(/^\.\//, ''))).toBe(false);

            process.env.NEO_E2E_RUN_ID = 'caller/battery run';
            const supplied = (
                      await import(`../../playwright.config.e2e.mjs?receipt=supplied-${Date.now()}`)
                  ).default,
                  suppliedReceipt = reporterOptions(supplied);

            expect(supplied.outputDir).toBe('./test-results/e2e/battery/caller/battery run/artifacts');
            expect(suppliedReceipt.runId).toBe('caller/battery run');
            expect(suppliedReceipt.outputFile).toMatch(
                /^test-results\/e2e\/browser-lifecycle\/receipt-[a-f0-9]{64}\.json$/
            )
        } finally {
            for (const [name, value] of [
                ['NEO_E2E_ENGINE_PROFILE', previousEngine],
                ['NEO_FILM_TAKE', previousFilm],
                ['NEO_E2E_PORT', previousPort],
                ['NEO_E2E_RUN_ID', previousRunId],
                ['NEO_E2E_LIFECYCLE_RUN_ID', previousLifecycleId]
            ]) {
                if (value === undefined) {
                    delete process.env[name]
                } else {
                    process.env[name] = value
                }
            }
        }
    });
});
