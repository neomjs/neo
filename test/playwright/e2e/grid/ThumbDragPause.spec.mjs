import { test, expect } from '@playwright/test';

/**
 * Row pinning must survive a thumb drag that STOPS MOVING while the button is still held.
 *
 * A pause is the state where a drag is live but no events arrive, which is exactly when a
 * disengagement bug is invisible to a moving-drag test: a continuous drag re-enters
 * `applyPinning` on every scroll event, so it repairs its own state and can never observe a
 * pin that was dropped in between. `GridRowScrollPinning` holds `isThumbDragging` from
 * scrollbar `mousedown` until `mouseup` with no inactivity timer, and once pinning engages it
 * stays engaged until the worker catches up. This spec exists to keep that a property rather
 * than an implementation detail.
 *
 * **The pause must land on an ENGAGED pin, and that ordering is the whole test.** An earlier
 * revision paused immediately after `mousedown`, before any scroll had given the pin work to
 * do — so it demonstrated only that a fresh scroll engages pinning after an idle hold, which
 * is not the property in the title. `mousedown` alone calls `applyPinning` with `deltaY` of
 * zero and writes nothing observable. The sequence below therefore engages the pin with a real
 * jump, proves it engaged, and only then stops the world.
 *
 * The observable is `--grid-row-pin-offset` — the CSS custom property `applyPinning` writes
 * onto the body nodes — rather than a screenshot, so the assertion and the defect are the same
 * quantity and no rendering judgement enters the loop.
 */
test.describe('Desktop (1920x1080): BigData Grid Paused Thumb Drag Pinning', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test.beforeEach(async ({ page }) => {
        await page.goto('/examples/grid/bigData/index.html');

        await page.waitForSelector('.neo-grid-container', { state: 'visible', timeout: 30000 });
        await page.waitForTimeout(1000);

        // 100k rows: the pin only has work to do when the thumb jump outruns the App Worker, and a
        // small store lets the worker keep up, which would make every assertion below vacuously true.
        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);

        const rowsInput = page.locator('label:has-text("Amount Rows")').locator('..').locator('.neo-textfield-input').last();

        await rowsInput.click({ force: true });
        await page.locator('.neo-list-item:has-text("100000")').click({ force: true });
        await page.waitForTimeout(5000);

        await page.locator('.controls-container-button').click();
        await page.waitForTimeout(500);
    });

    test('pinning survives a paused thumb drag', async ({ page }) => {
        const geometry = await page.evaluate(() => {
            const wrapper = document.querySelector('.neo-grid-view');
            return {scrollHeight: wrapper.scrollHeight, clientHeight: wrapper.clientHeight}
        });

        // If the 100k-row setup silently failed, every assertion below would be measuring a grid
        // that cannot lag, and a grid that cannot lag never pins.
        expect(geometry.scrollHeight, `grid is deeply scrollable (${JSON.stringify(geometry)})`)
            .toBeGreaterThan(geometry.clientHeight * 10);

        // Record the pin offset on every animation frame. Sampling continuously rather than at the
        // end is what makes a mid-pause drop observable: a single post-drag read cannot distinguish
        // "pinning held throughout" from "pinning dropped and re-engaged on the next scroll event".
        await page.evaluate(() => {
            window.__PIN_SAMPLES = [];

            const read = () => {
                const body = document.querySelector('.neo-grid-body');

                if (body) {
                    const rows        = Array.from(document.querySelectorAll('.neo-grid-row')),
                          wrapper     = document.querySelector('.neo-grid-view'),
                          wrapperRect = wrapper.getBoundingClientRect();

                    let painted = false;

                    if (rows.length > 0) {
                        const rowsTop    = Math.min(...rows.map(row => row.getBoundingClientRect().top)),
                              rowsBottom = Math.max(...rows.map(row => row.getBoundingClientRect().bottom));

                        painted = rowsBottom > wrapperRect.top && rowsTop < wrapperRect.bottom;
                    }

                    window.__PIN_SAMPLES.push({
                        t        : performance.now(),
                        offset   : body.style.getPropertyValue('--grid-row-pin-offset') || '',
                        rowCount : rows.length,
                        painted,
                        scrollTop: wrapper.scrollTop
                    })
                }

                window.__PIN_RAF = requestAnimationFrame(read)
            };

            read()
        });

        // Engage the drag the way the engine sees it. Chrome paints the scrollbar thumb in the
        // compositor, so a synthetic CDP mouse press over it never hit-tests to a scroll — measured
        // as `scrollTop` stuck at 0 through a full press-and-drag. `GridRowScrollPinning` binds
        // `mousedown` to the scrollbar NODE, so dispatching there sets `isThumbDragging` exactly as a
        // real press does, and it makes the pause provably event-free rather than merely still.
        const jump = () => page.evaluate(() => {
            const wrapper = document.querySelector('.neo-grid-view');
            wrapper.scrollTop = wrapper.scrollTop + 120000
        });

        await page.evaluate(() => {
            const scrollbar = document.querySelector('.neo-grid-vertical-scrollbar'),
                  box       = scrollbar.getBoundingClientRect();

            scrollbar.dispatchEvent(new MouseEvent('mousedown', {
                clientX: box.right - 5, clientY: box.top + 40, bubbles: true, cancelable: true
            }))
        });

        // --- Engage the pin BEFORE the pause, and prove it engaged. This is the ordering the
        // --- earlier revision got wrong; without it the pause lands on a pin that never existed.
        await jump();
        await page.waitForTimeout(120);

        const engagement = await page.evaluate(() => {
            const parse = value => parseFloat(value) || 0,
                  peak  = window.__PIN_SAMPLES.reduce(
                      (max, sample) => Math.max(max, Math.abs(parse(sample.offset))), 0
                  );

            return {peakOffset: peak, sampleCount: window.__PIN_SAMPLES.length}
        });

        // The positive control for the whole scenario: the pin did real work — a large reverse
        // translate holding stale rows in view — before anything was asked to survive a pause.
        expect(engagement.peakOffset, `pin engaged with real work before the pause (${JSON.stringify(engagement)})`)
            .toBeGreaterThan(100);

        const pauseStart = await page.evaluate(() => performance.now());

        // Longer than any plausible inactivity timeout. The press is held and nothing moves: no
        // scroll events, so no `applyPinning` re-entry can quietly repair dropped state.
        await page.waitForTimeout(2500);

        const pauseEnd = await page.evaluate(() => performance.now());

        // The first resumed event, then a deliberate wait for the worker to CATCH UP.
        //
        // The catch-up is the discriminator, and it is easy to leave out. `isPinningActive` latches:
        // once engaged it survives on its own until `applyPinning` sees BOTH a released thumb and a
        // settled delta (`!isThumbDragging && Math.abs(deltaY) < 5`). So a jump taken while the latch
        // is still set re-pins regardless of whether the held-thumb state survived the pause — an
        // earlier revision of this spec asserted exactly there and was green against a mutation that
        // cleared `isThumbDragging` outright. Letting the worker settle first is what un-latches it,
        // and only then does the next jump actually ask whether the thumb is still held.
        await jump();

        const settled = await page.evaluate(async () => {
            const body  = document.querySelector('.neo-grid-body'),
                  read  = () => Math.abs(parseFloat(body.style.getPropertyValue('--grid-row-pin-offset')) || 0),
                  start = performance.now();

            while (performance.now() - start < 4000) {
                if (read() < 5) return {caughtUp: true, offset: read(), waitedMs: performance.now() - start};
                await new Promise(resolve => setTimeout(resolve, 50))
            }

            return {caughtUp: false, offset: read(), waitedMs: performance.now() - start}
        });

        // Positive control for the discriminator itself: without a real catch-up the latch never
        // clears, and the final jump below would re-pin under either hypothesis.
        expect(settled.caughtUp, `the worker caught up before the final jump (${JSON.stringify(settled)})`).toBe(true);

        const catchUpEnd = await page.evaluate(() => performance.now());

        // The question the whole spec exists to ask: with the latch cleared, is the thumb STILL held?
        // If the pause dropped that state this jump cannot engage the pin and the pooled rows leave
        // the viewport while the worker chases a 120k-pixel move nothing is holding.
        await jump();
        await page.waitForTimeout(400);

        const afterDrag = await page.evaluate(() => {
            cancelAnimationFrame(window.__PIN_RAF);
            return {
                samples  : window.__PIN_SAMPLES,
                scrollTop: document.querySelector('.neo-grid-view').scrollTop
            }
        });

        await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', {bubbles: true})));

        const {samples}    = afterDrag,
              parseOffset  = value => parseFloat(value) || 0,
              pauseSamples = samples.filter(sample => sample.t >= pauseStart && sample.t <= pauseEnd),
              postSamples  = samples.filter(sample => sample.t > pauseEnd),
              finalSamples = samples.filter(sample => sample.t > catchUpEnd);

        // --- Positive controls. Without these the assertions below pass on a drag that never ran,
        // --- which is how the pre-removal version of this spec could go green having observed nothing.
        expect(samples.length,      'the frame sampler produced samples').toBeGreaterThan(10);
        expect(pauseSamples.length, 'frames were observed DURING the pause').toBeGreaterThan(10);
        expect(postSamples.length,  'frames were observed AFTER the pause').toBeGreaterThan(1);
        expect(afterDrag.scrollTop, 'the post-pause drag actually scrolled the grid').toBeGreaterThan(0);

        // The pause must really have been event-free — otherwise this is a moving-drag test wearing
        // a pause's name, and it cannot speak to the property it claims to cover.
        const pauseScrollTops = new Set(pauseSamples.map(sample => sample.scrollTop));
        expect(pauseScrollTops.size, 'the grid did not scroll during the pause').toBe(1);

        expect(finalSamples.length, 'frames were observed AFTER the catch-up').toBeGreaterThan(1);

        // --- The property, asserted where it is actually separable. The offset legitimately relaxes
        // --- toward zero as the worker catches up — that is the pin working, not dropping — so a
        // --- reading taken while the latch is still set proves nothing. This one is taken after the
        // --- latch cleared, where engagement can only come from a thumb that is still held.
        const engagedAfterCatchUp = finalSamples.some(sample => Math.abs(parseOffset(sample.offset)) > 100);

        expect(engagedAfterCatchUp, 'the still-held thumb re-engages the pin after the latch cleared').toBe(true);

        // Rows stay painted throughout. A dropped held-thumb state shows up here as pooled rows
        // pushed clean out of the viewport while the worker chases a jump nothing is holding.
        const blankFrames = [...pauseSamples, ...postSamples].filter(sample => !sample.painted);

        expect(blankFrames.length, 'no frame blanked during or after the pause').toBe(0)
    })
});
