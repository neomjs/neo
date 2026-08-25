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
 * The assertion reads `--grid-row-pin-offset` — the CSS custom property `applyPinning` writes
 * onto the body nodes — instead of judging paint from a screenshot. A reintroduced inactivity
 * timeout clears the offset to `0px`, so the observable and the defect are the same quantity.
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

        // The pin only has work to do when a thumb jump outruns the worker, which needs a store far
        // taller than the viewport. If the 100k-row setup silently failed, every assertion below
        // would be measuring a grid that cannot lag.
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
        // here as `scrollTop` stuck at 0 through a full press-and-drag. `GridRowScrollPinning` binds
        // `mousedown` to the scrollbar NODE, so dispatching there sets `isThumbDragging` exactly as a
        // real press does, and it makes the pause provably event-free rather than merely still.
        await page.evaluate(() => {
            const scrollbar = document.querySelector('.neo-grid-vertical-scrollbar'),
                  box       = scrollbar.getBoundingClientRect();

            scrollbar.dispatchEvent(new MouseEvent('mousedown', {
                clientX: box.right - 5, clientY: box.top + 40, bubbles: true, cancelable: true
            }))
        });

        // Mark the pause window so the samples inside it can be isolated from the drag around it.
        const pauseStart = await page.evaluate(() => performance.now());

        // Longer than any plausible inactivity timeout. The press is held and nothing moves: no
        // scroll events, so no `applyPinning` re-entry can quietly repair dropped state.
        await page.waitForTimeout(2500);

        const pauseEnd = await page.evaluate(() => performance.now());

        // The resumed drag. Each jump is far larger than the pooled rows can cover, so the worker is
        // demonstrably behind and the pin has something to hold.
        for (const _ of [0, 1]) {
            await page.evaluate(() => {
                const wrapper = document.querySelector('.neo-grid-view');
                wrapper.scrollTop = wrapper.scrollTop + 60000
            });
            await page.waitForTimeout(200)
        }

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
              postSamples  = samples.filter(sample => sample.t > pauseEnd);

        // --- Positive controls. Without these the assertions below pass on a drag that never ran,
        // --- which is how the pre-removal version of this spec could go green having observed nothing.
        expect(samples.length,      'the frame sampler produced samples').toBeGreaterThan(10);
        expect(pauseSamples.length, 'frames were observed DURING the pause').toBeGreaterThan(10);
        expect(postSamples.length,  'frames were observed AFTER the pause').toBeGreaterThan(1);
        expect(afterDrag.scrollTop, 'the post-pause drag actually scrolled the grid').toBeGreaterThan(0);

        // The pause must really have been still — otherwise this is a moving-drag test wearing a
        // pause's name, and it cannot speak to the property it claims to cover.
        const pauseScrollTops = new Set(pauseSamples.map(sample => sample.scrollTop));
        expect(pauseScrollTops.size, 'the grid did not scroll during the pause').toBe(1);

        // --- The property. Pinning engages while the worker is behind, and the pause does not drop it.
        const engagedAfterPause = postSamples.some(sample => Math.abs(parseOffset(sample.offset)) > 0);

        expect(engagedAfterPause, 'pinning engaged on the drag that followed the pause').toBe(true);

        // Rows stay painted across the pause and the drag that follows it. A dropped pin shows up
        // here as pooled rows pushed clean out of the viewport while the worker catches up.
        const blankFrames = [...pauseSamples, ...postSamples].filter(sample => !sample.painted);

        expect(blankFrames.length, 'no frame blanked during or after the pause').toBe(0)
    })
});
