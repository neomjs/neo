import {expect, test} from '@playwright/test';

test.use({viewport: {width: 1100, height: 820}});

test('Circle owns one item drag proxy through release, cancellation, and a pending start', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/examples/component/circle/index.html');

    const circle = page.locator('.neo-circle-component'),
          proxy  = page.locator('.neo-dragproxy');

    await expect(circle).toBeVisible();
    await page.getByText('Expand', {exact: true}).click();

    const circleId    = await circle.getAttribute('id'),
          worker      = page.workers().find(worker => worker.url().includes('/worker/App.mjs')),
          readOpacity = () => circle.evaluate(node => ({inline: node.style.opacity, computed: getComputedStyle(node).opacity})),
          opacity     = await readOpacity();

    await expect.poll(() => worker.evaluate(id => Boolean(Neo.get(id).dragListenersAdded), circleId)).toBe(true);

    // The expanded items move into position. Grab a ring item that the browser actually hit-tests.
    const startDrag = async (previousItem = null) => {
        let start;

        await expect.poll(async () => {
            start = await circle.locator('.neo-circle-item.neo-draggable').evaluateAll((items, previous) => {
                for (const item of items) {
                    const {x, y, width, height} = item.getBoundingClientRect(),
                          centerX               = x + width / 2,
                          centerY               = y + height / 2,
                          image                 = item.querySelector('img'),
                          src                   = image?.getAttribute('src');

                    if (src && item.id !== previous?.id && src !== previous?.src &&
                        document.elementFromPoint(centerX, centerY)?.closest('.neo-circle-item') === item) {
                        return {id: item.id, x: centerX, y: centerY, width, height, src, imageRadius: getComputedStyle(image).borderRadius}
                    }
                }

                return null
            }, previousItem);

            return Boolean(start)
        }).toBe(true);

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 70, start.y + 15, {steps: 10});
        return start
    };

    let previousItem;

    for (const terminal of ['release', 'release', 'escape']) {
        try {
            const item = await startDrag(previousItem);
            previousItem = item;

            await expect(proxy).toHaveCount(1);
            await expect(proxy).not.toHaveClass(/neo-circle-component/);
            await expect(proxy.locator('img')).toHaveCount(1);
            await expect(proxy.locator('img')).toHaveAttribute('src', item.src);

            const drag = await proxy.evaluate(node => {
                const rect = node.getBoundingClientRect();
                return {
                    circleItems: Number(node.matches('.neo-circle-item')) + node.querySelectorAll('.neo-circle-item').length,
                    width      : rect.width,
                    height     : rect.height,
                    imageRadius: getComputedStyle(node.querySelector('img')).borderRadius
                }
            });

            expect(drag.circleItems).toBe(1);
            expect(Math.abs(drag.width - item.width)).toBeLessThan(1);
            expect(Math.abs(drag.height - item.height)).toBeLessThan(1);
            expect(drag.imageRadius).toBe(item.imageRadius);

            if (terminal === 'escape') {
                await page.keyboard.press('Escape');
                await expect(proxy).toHaveCount(0);
                await expect.poll(readOpacity).toEqual(opacity)
            }
        } finally {
            await page.mouse.up()
        }

        await expect(proxy).toHaveCount(0);
        await expect.poll(readOpacity).toEqual(opacity)
    }

    // Main installs the gesture normally. Hold only the acknowledgement to the App worker so release
    // can arrive before the DragZone creates the proxy.
    await worker.evaluate(id => {
        const hook      = Neo.main.addon.DragDrop,
              configure = hook.setConfigs,
              zone      = Neo.get(id).dragZone,
              start     = zone.dragStart;

        let release;
        const pending = new Promise(resolve => {release = resolve}),
              probe   = globalThis.circleStartProbe = {entered: false, settled: null};

        probe.release = () => {
            hook.setConfigs = configure;
            zone.dragStart  = start;
            release()
        };

        hook.setConfigs = async function (...args) {
            const result = await configure.apply(this, args);
            probe.entered = true;
            await pending;
            return result
        };

        zone.dragStart = function (...args) {
            probe.settled = start.apply(this, args);
            return probe.settled
        }
    }, circleId);

    try {
        try {
            await startDrag();
            await expect.poll(() => worker.evaluate(() => globalThis.circleStartProbe.entered)).toBe(true)
        } finally {
            await page.mouse.up()
        }

        await expect.poll(() => worker.evaluate(id => !Neo.get(id).dragStartAbortController, circleId)).toBe(true)
    } finally {
        await worker.evaluate(async () => {
            const probe = globalThis.circleStartProbe;
            probe.release();
            await probe.settled;
            delete globalThis.circleStartProbe
        })
    }

    await expect(proxy).toHaveCount(0);
    await expect.poll(readOpacity).toEqual(opacity);
    expect(errors).toEqual([])
});
