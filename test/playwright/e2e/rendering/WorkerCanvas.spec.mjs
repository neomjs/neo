import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/worker/canvas`: a canvas the canvas worker draws keeps moving while the page's main thread is
 * blocked. Both sides are read: the page's own animation frames show how long its main thread was away, and the
 * renderer's frame count, which the example writes into its result line, shows what the canvas worker painted in
 * that time.
 */
const
    BUTTON  = 'Block the main thread for 5 s',
    EXAMPLE = '/examples/worker/canvas/index.html';

test.describe('examples/worker/canvas — a canvas keeps moving while the main thread is blocked', () => {
    test.use({viewport: {width: 1000, height: 700}});

    test('the page stops for five seconds and the canvas worker keeps painting', async ({baseURL, page}) => {
        const errors = [], foreign = [];

        page.on('console',   message => message.type() === 'error' && !message.location().url.endsWith('/favicon.ico') && errors.push(message.text()));
        page.on('pageerror', error   => errors.push(String(error)));
        page.on('request',   request => !request.url().startsWith(baseURL) && !request.url().startsWith('data:') && foreign.push(request.url()));

        await page.goto(EXAMPLE);
        await expect(page.locator('canvas[data-drawn="true"]'), 'the first frame is painted').toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-viewport'), 'the example opens dark').toHaveClass(/neo-theme-neo-dark/);

        // The page's own view of its main thread: the longest gap between two of its animation frames
        await page.evaluate(() => {
            window.frameGap = {last: performance.now(), max: 0};

            const tick = now => {
                window.frameGap.max  = Math.max(window.frameGap.max, now - window.frameGap.last);
                window.frameGap.last = now;
                requestAnimationFrame(tick)
            };

            requestAnimationFrame(tick)
        });

        const result = page.locator('.neo-examples-worker-canvas-result');

        await page.getByRole('button', {name: BUTTON}).click();
        await expect(result, 'the page reports the block once its main thread is back').toHaveAttribute('data-result', /frames/, {timeout: 20000});

        const
            {blockedMs, frames} = JSON.parse(await result.getAttribute('data-result')),
            gap                 = await page.evaluate(() => window.frameGap.max);

        expect(blockedMs, 'the loop ran for the five seconds it was asked for').toBeGreaterThanOrEqual(4900);
        expect(gap,       'the page painted no frame of its own while the loop ran').toBeGreaterThanOrEqual(4500);
        // 20 frames a second is far below what the worker paints and far above a canvas that stood still
        expect(frames,    'the canvas worker painted through the block').toBeGreaterThanOrEqual(100);

        await expect(result).toContainText(`painted ${frames} frames`);
        await expect(page.getByRole('button', {name: BUTTON}), 'the button can be pressed again').toBeEnabled();

        expect(foreign, 'the example runs from the repository alone').toEqual([]);
        expect(errors).toEqual([])
    });

    test('the example opens in Neo Light when the address names it', async ({page}) => {
        await page.goto(`${EXAMPLE}?theme=neo-theme-neo-light`);

        await expect(page.locator('canvas[data-drawn="true"]')).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-neo-light/)
    });
});
