import {test, expect}       from '../fixtures.mjs';
import {median, percentile} from '../../../ai/scripts/benchmark/helpers/stats.mjs';

/**
 * @summary Harness Endurance Benchmark runner — Subject A (Neo).
 *
 * Drives the Neo transcript subject and measures main-thread health under a streamed-append load.
 * The thesis under test: Neo's worker topology keeps the main thread responsive as session age
 * grows, because reconciliation / parse / diff run off-thread. Falsifier honesty: this is a
 * measurement harness, not a claim — the verdict comes from the Subject-A-vs-comparator delta
 * (Subject B lands next), and a null result publishes with equal prominence.
 *
 * Selectors are grounded, not guessed: `.neo-markdown-vdom` is the component's `baseCls`
 * (`src/component/markdown/Component.mjs`); the app name + "Start load" button are authored in
 * `examples/harnessEndurance/neo/`.
 *
 * Metric credibility (two traps closed during authoring, both via output scrutiny):
 *  - The responsiveness signal is **event-loop lag** — a fixed-interval timer whose firing delay
 *    beyond schedule measures how long the main thread was blocked. We do NOT use rAF inter-frame
 *    gaps: rAF free-runs without vsync in headless Chromium (observed ~870fps), so it is not a
 *    faithful jank signal here.
 *  - Each tick measures ITS OWN delay, re-anchored from the moment it is scheduled — NOT a global
 *    expected-time accumulator, which falls behind real time after any late tick and inflates lag
 *    with accumulated drift (an earlier draft reported a spurious ~300ms median from exactly that).
 *
 * The cross-boundary keystroke→echo metric is a separate, later layer (its precise timing needs
 * CDP↔browser clock correlation). Low lag is the GOOD case (Neo responsive) → it is logged as the
 * finding, never asserted against a threshold; the verdict is the cross-subject delta.
 */
test.describe('Harness Endurance Benchmark — Subject A (Neo)', () => {
    test.setTimeout(90000);

    test('mounts, drives the LoadProfile stream, and renders the transcript', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');

        // App Worker reachable → Subject A booted
        const app = await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');
        expect(app).toBeTruthy();

        // the "Start load" toolbar button → MainContainer.startLoad (default LoadProfile config)
        const startButton = page.getByRole('button', {name: 'Start load'});
        await expect(startButton).toBeVisible({timeout: 30000});
        await startButton.click();

        // the streamed appends render into the markdown-vdom transcript
        const transcript = page.locator('.neo-markdown-vdom').first();
        await expect.poll(async () => (await transcript.innerText()).length, {
            message: 'transcript should accumulate streamed markdown under the load',
            timeout: 20000
        }).toBeGreaterThan(0);
    });

    test('samples main-thread event-loop lag + heap under the streamed load', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');
        await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');

        await page.getByRole('button', {name: 'Start load'}).click();

        // Precise IN-BROWSER sampling WHILE the load streams: each fixed-interval timer reports its
        // OWN lateness beyond the intended interval = the main-thread event-loop lag for that tick.
        const {lags, heapStartBytes, heapEndBytes, windowMs, intervalMs} = await page.evaluate(({ms, interval}) => new Promise(resolve => {
            const lags  = [],
                  t0    = performance.now(),
                  heap0 = performance.memory?.usedJSHeapSize ?? null;
            let scheduledAt;

            const tick = () => {
                const now = performance.now();
                lags.push(Math.max(0, now - scheduledAt - interval));   // THIS tick's beyond-interval lag

                if (now - t0 < ms) {
                    scheduledAt = performance.now();
                    setTimeout(tick, interval)
                } else {
                    resolve({
                        lags,
                        heapStartBytes: heap0,
                        heapEndBytes  : performance.memory?.usedJSHeapSize ?? null,
                        windowMs      : ms,
                        intervalMs    : interval
                    })
                }
            };

            scheduledAt = performance.now();
            setTimeout(tick, interval)
        }), {ms: 10000, interval: 16});

        const medianLag = median(lags),
              p95Lag    = percentile(lags, 0.95);

        console.log(`[endurance:neo] window=${windowMs}ms interval=${intervalMs}ms samples=${lags.length} median-lag=${medianLag.toFixed(2)}ms p95-lag=${p95Lag.toFixed(2)}ms`);
        if (heapStartBytes != null) {
            console.log(`[endurance:neo] heap ${(heapStartBytes / 1048576).toFixed(1)}MB → ${(heapEndBytes / 1048576).toFixed(1)}MB`);
        }

        // Foundation assertions: the sampler produced a real lag series with a sane distribution.
        // NOT a perf threshold — low lag is the thesis HOLDING; the verdict is the cross-subject delta.
        expect(lags.length).toBeGreaterThan(100);          // ~625 expected at 16ms over 10s
        expect(Number.isFinite(medianLag)).toBe(true);
        expect(p95Lag).toBeGreaterThanOrEqual(medianLag);
    });
});
