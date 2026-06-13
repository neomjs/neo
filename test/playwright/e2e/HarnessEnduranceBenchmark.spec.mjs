import {test, expect}       from '../fixtures.mjs';
import {median, percentile} from '../../../ai/scripts/benchmark/helpers/stats.mjs';

/**
 * @summary Harness Endurance Benchmark runner — Subject A (Neo) vs Subject B (main-thread comparator).
 *
 * Drives each subject under the SAME deterministic LoadProfile stream and measures main-thread health.
 * The thesis under test: Neo's worker topology keeps the main thread responsive as session age grows,
 * because reconciliation / parse / diff run off-thread. Falsifier honesty: this is a measurement
 * harness, not a claim — the verdict is the cross-subject delta under a CALIBRATED load (the current
 * MVP load is deliberately light, so a small/zero delta here is expected, not a refutation), and a
 * null result publishes with equal prominence.
 *
 * Grounded selectors: `.neo-markdown-vdom` is the Neo component's `baseCls`; the Neo app name +
 * "Start load" button + the comparator's `globalThis.__enduranceComparator` are authored in
 * `examples/harnessEndurance/`.
 *
 * Metric credibility: main-thread responsiveness = event-loop lag (a fixed-interval timer's lateness
 * beyond schedule, each tick re-anchored). NOT rAF inter-frame gaps (free-run without vsync in
 * headless Chromium). Low lag = the GOOD case → logged as the finding, never asserted to a threshold.
 */

/**
 * Sample main-thread event-loop lag + heap over a window, in-browser, while a load streams.
 * @param {import('@playwright/test').Page} page
 * @param {Object} [opts]
 * @param {Number} [opts.windowMs=10000]
 * @param {Number} [opts.intervalMs=16]
 * @returns {Promise<{lags:Number[], heapStartBytes:Number|null, heapEndBytes:Number|null}>}
 */
function sampleEventLoopLag(page, {windowMs = 10000, intervalMs = 16} = {}) {
    return page.evaluate(({ms, interval}) => new Promise(resolve => {
        const
            lags  = [],
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
                resolve({lags, heapStartBytes: heap0, heapEndBytes: performance.memory?.usedJSHeapSize ?? null})
            }
        };

        scheduledAt = performance.now();
        setTimeout(tick, interval)
    }), {ms: windowMs, interval: intervalMs});
}

test.describe('Harness Endurance Benchmark', () => {
    test.setTimeout(120000);

    test('Subject A (Neo) mounts, drives the LoadProfile stream, and renders the transcript', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');

        const app = await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');
        expect(app).toBeTruthy();

        const startButton = page.getByRole('button', {name: 'Start load'});
        await expect(startButton).toBeVisible({timeout: 30000});
        await startButton.click();

        const transcript = page.locator('.neo-markdown-vdom').first();
        await expect.poll(async () => (await transcript.innerText()).length, {
            message: 'transcript should accumulate streamed markdown under the load',
            timeout: 20000
        }).toBeGreaterThan(0);
    });

    test('Subject A (Neo) — event-loop lag + heap under the streamed load', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');
        await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');
        await page.getByRole('button', {name: 'Start load'}).click();

        const {lags, heapStartBytes, heapEndBytes} = await sampleEventLoopLag(page, {windowMs: 10000});

        console.log(`[endurance:neo] samples=${lags.length} median-lag=${median(lags).toFixed(2)}ms p95-lag=${percentile(lags, 0.95).toFixed(2)}ms`);
        if (heapStartBytes != null) {
            console.log(`[endurance:neo] heap ${(heapStartBytes / 1048576).toFixed(1)}MB → ${(heapEndBytes / 1048576).toFixed(1)}MB`);
        }

        expect(lags.length).toBeGreaterThan(100);
        expect(Number.isFinite(median(lags))).toBe(true);
    });

    test('Subject B (main-thread comparator) — event-loop lag under the same load', async ({page}) => {
        await page.goto('/examples/harnessEndurance/comparator/index.html');
        await page.waitForFunction(() => globalThis.__enduranceComparator?.start);
        await page.evaluate(() => { globalThis.__enduranceComparator.start() });   // fire-and-forget (8h default loop; we sample a window)

        const {lags} = await sampleEventLoopLag(page, {windowMs: 10000});

        console.log(`[endurance:comparator] samples=${lags.length} median-lag=${median(lags).toFixed(2)}ms p95-lag=${percentile(lags, 0.95).toFixed(2)}ms`);

        expect(lags.length).toBeGreaterThan(100);
        expect(Number.isFinite(median(lags))).toBe(true);
    });

    test('cross-subject delta — Neo vs main-thread comparator (same load, same sampler)', async ({page, neuralLink}) => {
        await page.goto('/examples/harnessEndurance/neo/index.html');
        await neuralLink.connectToApp('Neo.examples.harnessEndurance.neo');
        await page.getByRole('button', {name: 'Start load'}).click();
        const neo = await sampleEventLoopLag(page, {windowMs: 8000});

        await page.goto('/examples/harnessEndurance/comparator/index.html');
        await page.waitForFunction(() => globalThis.__enduranceComparator?.start);
        await page.evaluate(() => { globalThis.__enduranceComparator.start() });   // fire-and-forget (8h default loop; we sample a window)
        const comparator = await sampleEventLoopLag(page, {windowMs: 8000});

        const neoMed = median(neo.lags), cmpMed = median(comparator.lags);
        console.log(`[endurance:delta] Neo median-lag=${neoMed.toFixed(2)}ms | comparator median-lag=${cmpMed.toFixed(2)}ms | delta=${(cmpMed - neoMed).toFixed(2)}ms (positive = comparator laggier)`);

        // Both produced real series; the verdict (delta significance) awaits a calibrated heavier load.
        expect(neo.lags.length).toBeGreaterThan(50);
        expect(comparator.lags.length).toBeGreaterThan(50);
    });
});
