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

    const circleId = await circle.getAttribute('id'),
          worker   = page.workers().find(worker => worker.url().includes('/worker/App.mjs')),
          state    = () => worker.evaluate(id => {
              const instance = Neo.get(id);

              return {
                  dragging      : Boolean(instance.isDragging),
                  listenersReady: Boolean(instance.dragListenersAdded)
              }
          }, circleId);

    await expect.poll(async () => (await state()).listenersReady).toBe(true);

    // The expanded items move into position. Grab a ring item that the browser actually hit-tests.
    const startDrag = async () => {
        let start;

        await expect.poll(async () => {
            start = await circle.locator('.neo-circle-item.neo-draggable').evaluateAll(items => {
                for (const item of items) {
                    const rect = item.getBoundingClientRect(),
                          x    = rect.x + rect.width / 2,
                          y    = rect.y + rect.height / 2;

                    if (document.elementFromPoint(x, y)?.closest('.neo-circle-item') === item) {
                        return {x, y}
                    }
                }

                return null
            });

            return Boolean(start)
        }).toBe(true);

        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 70, start.y + 15, {steps: 10})
    };

    for (const terminal of ['release', 'release', 'escape']) {
        try {
            await startDrag();
            await expect(proxy).toHaveCount(1);
            await expect.poll(async () => (await state()).dragging).toBe(true);

            if (terminal === 'escape') {
                await page.keyboard.press('Escape');
                await expect(proxy).toHaveCount(0)
            }
        } finally {
            await page.mouse.up()
        }

        await expect(proxy).toHaveCount(0);
        await expect.poll(async () => (await state()).dragging).toBe(false)
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

        await expect.poll(async () => (await state()).dragging).toBe(false)
    } finally {
        await worker.evaluate(async () => {
            const probe = globalThis.circleStartProbe;
            probe.release();
            await probe.settled;
            delete globalThis.circleStartProbe
        })
    }

    await expect(proxy).toHaveCount(0);
    expect(errors).toEqual([])
});
