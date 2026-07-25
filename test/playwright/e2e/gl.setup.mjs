import {test as setup, expect}                   from '@playwright/test';
import {activeLaunchArgs, claimsGpuAcceleration} from './utils/gpuIntent.mjs';
import {readGlState}                             from './utils/glState.mjs';

/**
 * @summary Boot gate: the E2E suite refuses to run silently on a GPU it only *claims* to have.
 *
 * Days were spent investigating a suspected vessel/heap-join defect. The actual cause was a
 * launch flag whose text stayed valid while the runtime moved out from under it — GL resolved to
 * `none` at every window birth, Chromium's GPU-crash threshold eventually killed the whole browser
 * mid-suite, and the "GPU-accelerated" benchmark suite had plausibly never rendered one accelerated
 * frame. It was green the entire time, because a green suite proves the tests passed, not that they
 * ran under the conditions they claim to measure.
 *
 * A source-shaped check cannot catch this class: the config's spelling never rotted, the environment
 * rotted beneath it. So this gate observes the *effect* — once, at boot, before any benchmark
 * attributes a number to hardware it may not be using.
 *
 * **Placement.** This is a setup project rather than `globalSetup`, following the `chroma-setup`
 * precedent in `playwright.config.unit.mjs`. `e2e/globalSetup.mjs` runs as a plain node function
 * outside any launched browser, so it structurally cannot observe the browser's GL state — the
 * distinction that matters here is exactly the one between reading a config and running under it.
 *
 * @see test/playwright/e2e/utils/glState.mjs   three-state reading
 * @see test/playwright/e2e/utils/gpuIntent.mjs the declaration this gate holds the run to
 */
setup('E2E boot: GPU-intent flags resolve to real GL', async ({page}) => {
    const
        demandsGl = claimsGpuAcceleration(activeLaunchArgs()),
        gl        = await readGlState(page),
        detail    = `state=${gl.state} renderer=${gl.renderer ?? 'n/a'} vendor=${gl.vendor ?? 'n/a'} generic=${gl.generic ?? 'n/a'} reason=${gl.reason ?? 'none'}`;

    // Logged on every outcome, healthy included: a benchmark number is worth what its rendering path
    // is worth, and the run's own log is where that has to be recoverable afterwards.
    console.log(`[gl-probe] ${detail}`);

    if (!demandsGl) {
        console.log('[gl-probe] launch args carry no GPU-intent flag — nothing claimed, nothing demanded.');
        return
    }

    // "Could not look" is its own outcome and still stops the run. A probe that waves the suite
    // through when its own instrument is missing is the same defect wearing this gate's uniform:
    // it would report the absence of evidence as evidence of health.
    expect(gl.state, [
        `E2E boot probe could not determine the GL state (${gl.reason}).`,
        'This is NOT a pass — the suite claims hardware acceleration and the probe was unable to verify it.',
        `Observed: ${detail}`,
        'Fix the probe or the browser surface before trusting any benchmark from this run.'
    ].join('\n')).not.toBe('unobserved');

    expect(gl.state, [
        'E2E boot probe: GPU-intent launch flags did NOT resolve to hardware GL.',
        `Observed: ${detail}`,
        '',
        'This is the #15664 class — flag rot. The launch arguments still read correctly; the browser',
        'no longer honours them, so this suite would render on nothing while reporting GPU numbers.',
        'Chrome retired --use-gl=desktop via its ANGLE-only allowlist exactly this way.',
        '',
        'Check every GPU-intent flag in test/playwright/e2e/utils/gpuIntent.mjs against the current',
        'Chrome build before assuming a hardware fault. Evidence chain: https://github.com/neomjs/neo/issues/15664'
    ].join('\n')).toBe('accelerated')
});
