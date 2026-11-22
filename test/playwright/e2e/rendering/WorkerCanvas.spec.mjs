import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/worker/canvas`: a canvas the canvas worker draws keeps moving while the page's main thread is
 * blocked. Both sides are read: the page's own animation frames show how long its main thread was away, and the
 * renderer's frame count, which the example writes into its result line, shows what the canvas worker painted in
 * that time. The renderer also times the arrivals of the app's clock, which reaches it worker to worker, and a click
 * made during the block shows that the page answers only afterwards.
 */
const
    BUTTON  = 'Block the main thread for 5 seconds',
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

        // The page's own clock for the press and for the theme change: the instruction tells the visitor to try the
        // theme button during the block
        await page.evaluate(label => {
            const viewport = document.querySelector('.neo-viewport'), before = viewport.className;

            document.addEventListener('click', event => {
                if (event.target.closest('button')?.textContent.includes(label)) {
                    window.pressedAt = performance.timeOrigin + performance.now()
                }
            }, true);

            new MutationObserver((records, observer) => {
                if (viewport.className !== before) {
                    window.themeChangedAt = performance.timeOrigin + performance.now();
                    observer.disconnect()
                }
            }).observe(viewport, {attributeFilter: ['class'], attributes: true})
        }, BUTTON);

        const
            result = page.locator('.neo-examples-worker-canvas-result'),
            box    = await page.locator('.neo-theme-switcher').first().boundingBox(),
            mouse  = {button: 'left', clickCount: 1, x: box.x + box.width / 2, y: box.y + box.height / 2},
            cdp    = await page.context().newCDPSession(page);

        let clickedAt;

        // A click 2.5 s from now, by this process's timer and straight through the browser: a call that reads the
        // page would wait for the main thread.
        // wall-clock-under-test: the click has to arrive inside the example's 5 s block, half way through it
        const click = new Promise(resolve => setTimeout(resolve, 2500)).then(() => {
            clickedAt = Date.now();

            return cdp.send('Input.dispatchMouseEvent', {...mouse, type: 'mousePressed'})
                .then(() => cdp.send('Input.dispatchMouseEvent', {...mouse, type: 'mouseReleased'}))
        });

        await page.getByRole('button', {name: BUTTON}).click();
        await expect(result, 'the page reports the block once its main thread is back').toHaveAttribute('data-result', /frames/, {timeout: 20000});
        await click;

        const
            {blockedMs, clockGap, clockWrites, frames} = JSON.parse(await result.getAttribute('data-result')),
            gap                                        = await page.evaluate(() => window.frameGap.max);

        expect(blockedMs,   'the loop ran for the five seconds it was asked for').toBeGreaterThanOrEqual(4900);
        expect(gap,         'the page painted no frame of its own while the loop ran').toBeGreaterThanOrEqual(4500);
        // 20 frames a second is far below what the worker paints and far above a canvas that stood still
        expect(frames,      'the canvas worker painted through the block').toBeGreaterThanOrEqual(100);
        // The clock is set ten times a second: the App Worker went on while the page could apply nothing
        expect(clockWrites, 'the app kept running through the block').toBeGreaterThanOrEqual(40);
        // The renderer times the arrivals itself: the same clock, sent worker to worker, never stood in the canvas
        expect(clockGap,    `the app's clock reached the canvas all through the block`).toBeLessThan(500);

        await expect(result).toContainText(`painted ${frames} frames, and the app's clock never stopped`);
        await expect(page.getByRole('button', {name: BUTTON}), 'the button can be pressed again').toBeEnabled();

        // The page promises that it answers a click only afterwards
        await expect(page.locator('.neo-viewport'), 'the click made during the block landed').toHaveClass(/neo-theme-neo-light/);

        const {pressedAt, themeChangedAt} = await page.evaluate(() => ({pressedAt: window.pressedAt, themeChangedAt: window.themeChangedAt}));

        // The block starts a tenth of a second after the press and lasts five seconds
        expect(clickedAt - pressedAt,      'the click was made after the block began').toBeGreaterThan(300);
        expect(clickedAt - pressedAt,      'the click was made before the block ended').toBeLessThan(4800);
        expect(themeChangedAt - pressedAt, 'and the page answered it only afterwards').toBeGreaterThanOrEqual(4500);

        expect(foreign, 'the example runs from the repository alone').toEqual([]);
        expect(errors).toEqual([])
    });

    test('a write sent into the block is late, not wedged: the watchdog reports nothing', async ({page}) => {
        const wedged = [];

        page.on('console', message => /vdom update wedged/.test(message.text()) && wedged.push(message.text()));

        await page.goto(EXAMPLE);
        await expect(page.locator('canvas[data-drawn="true"]'), 'the first frame is painted').toBeVisible({timeout: 30000});

        // The App Worker, found by what it holds: its address differs between the environments
        let app;

        for (const worker of page.workers()) {
            if (await worker.evaluate(() => typeof Neo !== 'undefined' && !!Neo.examples?.worker?.canvas?.MainContainer).catch(() => false)) {
                app = worker
            }
        }

        // A watchdog shorter than the block: without the example's own care, every press would be reported
        await app.evaluate(() => {Neo.manager.VDomUpdate.watchdogThreshold = 4000});

        await page.getByRole('button', {name: BUTTON}).click();
        await expect(page.locator('.neo-examples-worker-canvas-result'), 'the block is over').toHaveAttribute('data-result', /frames/, {timeout: 20000});

        expect(await app.evaluate(() => Neo.manager.VDomUpdate.watchdogThreshold), 'the watchdog has its own value back').toBe(4000);
        expect(wedged, 'no update was reported as wedged').toEqual([])
    });

    test('the example opens in Neo Light when the address names it', async ({page}) => {
        await page.goto(`${EXAMPLE}?theme=neo-theme-neo-light`);

        await expect(page.locator('canvas[data-drawn="true"]')).toBeVisible({timeout: 30000});
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-neo-light/)
    });
});
