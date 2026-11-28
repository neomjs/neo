import {test, expect} from '@playwright/test';

test.use({hasTouch: true});

/**
 * @summary Registers actual App listeners and captures native cancellation and contacts separately.
 * @param {import('@playwright/test').Page} page
 * @param {String} touchAction
 * @returns {Promise<Object>}
 */
async function bootTransforms(page, touchAction) {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    const worker = page.workers().find(item => item.url().includes('/worker/App'));

    await worker.evaluate(async () => {
        const [{default: Component}, {default: Container}] = await Promise.all([
                  import('../component/Base.mjs'), import('../container/Base.mjs')
              ]),
              viewport = Neo.getComponent('component-test-viewport'),
              target   = Neo.create(Component, {id: 'transform-target', text: 'Transform target'}),
              host     = Neo.create(Container, {id: 'transform-host', items: [target]});

        viewport.add(host);
        target.transformPhases = {pinch: [], rotate: []};
        target.domListeners = ['pinch', 'rotate'].flatMap(family => ['start', 'move', 'end', 'cancel'].map(phase => ({
            [`${family}:${phase}`]: data => {
                const {changed, contacts, elapsed, gestureId, rotation, scale, trusted, x, y} = data;

                target.transformPhases[family].push({changed, contacts, elapsed, gestureId, phase, rotation, scale, trusted, x, y})
            }
        })))
    });

    const target = page.locator('#transform-target'),
          host   = page.locator('#transform-host');

    await expect(target).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof Neo.main.addon?.Gesture?.on)).toBe('function');
    await page.addStyleTag({content: `
        #transform-host {display: block; flex: none; width: 480px; max-height: 460px; overflow-y: auto}
        #transform-target {display: block; flex: none; min-height: 900px; touch-action: ${touchAction}}
    `});
    await expect.poll(() => host.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);

    await page.evaluate(() => {
        window.transformNative = {cancels: 0, activeMoves: [], afterLift: []};

        document.addEventListener('pointercancel', event => {
            if (event.pointerType === 'touch' && event.isTrusted) window.transformNative.cancels++
        }, {capture: true, passive: true});
        document.addEventListener('touchmove', event => {
            if (event.isTrusted) window.transformNative.activeMoves.push(event.touches.length)
        }, {capture: true, passive: true});
        document.addEventListener('touchend', event => {
            if (event.isTrusted) window.transformNative.afterLift.push(Array.from(event.touches, point => point.identifier))
        }, {capture: true, passive: true})
    });

    const cdp    = await page.context().newCDPSession(page),
          origin = await target.boundingBox(),
          touch  = (id, dx, dy) => ({id, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy)});

    return {
        cdp,
        host,
        touch,
        target,
        send  : (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints}),
        phases: () => worker.evaluate(() => Neo.getComponent('transform-target').transformPhases),
        native: () => page.evaluate(() => window.transformNative)
    }
}

test('pinch and rotation share native motion, then restart cleanly after either partial lift', async ({page}) => {
    const {cdp, touch, send, phases, native} = await bootTransforms(page, 'none');

    try {
        const a          = touch(17, 95, 285), b = touch(31, 135, 285),
              expanded   = [touch(17, 90, 295), touch(31, 170, 295)],
              clockwise  = [touch(17, 130, 255), touch(31, 130, 335)],
              contracted = [touch(17, 120, 295), touch(31, 140, 295)];

        for (const [trial, lift] of [0, 1].entries()) {
            const startsBefore = (await phases()).pinch.filter(event => event.phase === 'start').length;

            await send('touchStart', a, b);
            await expect.poll(async () => (await phases()).pinch.filter(event => event.phase === 'start').length).toBe(startsBefore + 1);
            let result = await phases();
            expect(result.pinch.at(-1)).toMatchObject({phase: 'start', scale: 1, x: 115, y: 285, trusted: true});
            expect(result.rotate.at(-1)).toMatchObject({phase: 'start', rotation: 0, x: 115, y: 285, trusted: true});
            expect(result.pinch.at(-1).gestureId).not.toBe(result.rotate.at(-1).gestureId);

            if (trial === 0) {
                await send('touchMove', ...expanded);
                await expect.poll(async () => (await phases()).pinch.at(-1)).toMatchObject({phase: 'move', scale: 2, x: 130, y: 295});
                await send('touchMove', ...clockwise);
                await expect.poll(async () => (await phases()).rotate.at(-1)).toMatchObject({phase: 'move', rotation: 90, x: 130, y: 295});
                await send('touchMove', ...expanded);
                await expect.poll(async () => (await phases()).rotate.at(-1).rotation).toBe(0);
                await send('touchMove', ...contracted);
                await expect.poll(async () => (await phases()).pinch.at(-1).scale).toBe(0.5)
            }

            const pair        = trial === 0 ? contracted : [a, b],
                  survivors   = pair[1 - lift],
                  previousIds = [(await phases()).pinch.at(-1).gestureId, (await phases()).rotate.at(-1).gestureId];

            await send('touchEnd', pair[lift]);
            await expect.poll(async () => (await native()).afterLift.at(-1)).toEqual([survivors.id]);
            await expect.poll(async () => (await phases()).rotate.at(-1)).toMatchObject({phase: 'end', contacts: [], changed: [lift]});
            expect((await phases()).pinch.at(-1)).toMatchObject({phase: 'end', scale: trial === 0 ? 0.5 : 1, contacts: [], changed: [lift]});

            await send('touchStart', survivors, touch(71, 215, 295));
            await expect.poll(async () => (await phases()).rotate.at(-1)).toMatchObject({phase: 'start', rotation: 0, contacts: [{id: 0}, {id: 1}]});
            result = await phases();
            expect(result.pinch.at(-1)).toMatchObject({phase: 'start', scale: 1, contacts: [{id: 0}, {id: 1}]});
            expect(result.pinch.at(-1).gestureId).not.toBe(previousIds[0]);
            expect(result.rotate.at(-1).gestureId).not.toBe(previousIds[1]);

            await send('touchCancel');
            await expect.poll(async () => (await phases()).rotate.at(-1).phase).toBe('cancel');
            expect((await phases()).pinch.at(-1)).toMatchObject({phase: 'cancel', contacts: []})
        }
    } finally {
        await cdp.detach()
    }
});

test('late two-contact moves do not recognize after native scrolling takes ownership', async ({page}) => {
    const {cdp, host, touch, send, phases, native, target} = await bootTransforms(page, 'pan-y');

    try {
        await send('touchStart', touch(17, 120, 325));
        for (let step = 1; step <= 5; step++) {
            await send('touchMove', touch(17, 120, 325 - step * 23))
        }

        await expect.poll(() => host.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await expect.poll(async () => (await native()).cancels).toBeGreaterThan(0);

        await send('touchStart', touch(17, 120, 210), touch(71, 210, 248));
        await send('touchMove', touch(17, 120, 185), touch(71, 210, 226));
        await expect.poll(async () => (await native()).activeMoves).toContain(2);
        await send('touchEnd');
        expect(await phases()).toEqual({pinch: [], rotate: []});

        await host.evaluate(node => {node.scrollTop = 0});
        const fresh = [touch(17, 120, 325), touch(71, 210, 325)];

        await send('touchStart', ...fresh);
        await expect.poll(async () => (await phases()).rotate.at(-1)).toMatchObject({phase: 'start', rotation: 0});
        expect((await phases()).pinch.at(-1)).toMatchObject({phase: 'start', scale: 1});

        await target.evaluate(node => node.replaceWith(node.cloneNode(true)));
        await expect.poll(async () => (await phases()).rotate.at(-1)).toMatchObject({phase: 'cancel', contacts: []});
        expect((await phases()).pinch.at(-1)).toMatchObject({phase: 'cancel', contacts: []});
        await send('touchEnd');

        await send('touchStart', ...fresh);
        await expect.poll(async () => (await phases()).rotate.map(event => event.phase)).toEqual(['start', 'cancel', 'start']);
        await send('touchEnd')
    } finally {
        await cdp.detach()
    }
});
