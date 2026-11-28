import {test, expect} from '@playwright/test';

test.use({hasTouch: true});

/**
 * @summary Mounts real pan and swipe subscribers and a scrollable host in the running Engine.
 * @param {import('@playwright/test').Page} page
 * @param {String} policy
 * @returns {Promise<Object>}
 */
async function bootMotion(page, policy) {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    const worker = page.workers().find(item => item.url().includes('/worker/App'));

    await worker.evaluate(async () => {
        const viewport = Neo.getComponent('component-test-viewport');

        await Neo.currentWorker.getAddon('Gesture', viewport.windowId)
    });
    expect(await page.evaluate(() => {
        const registered = Neo.main.gesture?.Translation;

        return Boolean(registered && Object.getPrototypeOf(registered.prototype) === Neo.core.Base.prototype)
    })).toBe(true);

    await page.evaluate(() => {
        const addon = Neo.main.addon.Gesture, register = addon.register.bind(addon);

        window.translationRegistered = false;
        addon.register = data => {
            const result = register(data);

            if (result && data.id === 'translation-target' && data.events.includes('pan:move') && data.events.includes('swipe')) {
                window.translationRegistered = true
            }

            return result
        }
    });

    await worker.evaluate(async () => {
        const [{default: Component}, {default: Container}] = await Promise.all([
                  import('../component/Base.mjs'), import('../container/Base.mjs')
              ]),
              target   = Neo.create(Component, {id: 'translation-target', text: 'Translation target'}),
              host     = Neo.create(Container, {id: 'translation-host', items: [target]});

        Neo.getComponent('component-test-viewport').add(host);
        target.motion = {pan: [], swipes: []};

        target.domListeners = [
            ...['start', 'move', 'end', 'cancel'].map(phase => ({
                [`pan:${phase}`]: data => {
                    const {deltaX, deltaY, elapsed, stepX, stepY, trusted, velocityX, velocityY} = data;

                    target.motion.pan.push({deltaX, deltaY, elapsed, lifted: Object.hasOwn(data, 'lifted'), phase,
                        stepX, stepY, trusted, velocityX, velocityY})
                }
            })),
            {swipe: data => {
                const {contacts, direction, phase, trusted, velocityX, x, y} = data;

                target.motion.swipes.push({contacts, direction, lifted: Object.hasOwn(data, 'lifted'), phase,
                    trusted, velocityX, x, y})
            }}
        ]
    });

    const target = page.locator('#translation-target'),
          host   = page.locator('#translation-host');

    await expect(target).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.translationRegistered)).toBe(true);
    await page.addStyleTag({content: `
        #translation-host {display: block; flex: none; width: 480px; max-height: 460px; overflow-y: auto}
        #translation-target {display: block; flex: none; min-height: 900px; touch-action: ${policy}}
    `});
    await expect.poll(() => host.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);

    await page.evaluate(() => {
        const addon = Neo.main.addon.Gesture;

        window.translationNative = {cancels: 0, frames: [], releases: []};
        addon.on('contact', frame => {
            const {claim, kind, lifted} = frame;

            if (claim.node.id === 'translation-target') {
                window.translationNative.frames.push({
                    family: claim.family, kind, lifted, hasLifted: Object.hasOwn(frame, 'lifted')
                })
            }
        }, addon);

        document.addEventListener('pointercancel', event => {
            if (event.pointerType === 'touch' && event.isTrusted) window.translationNative.cancels++
        }, {capture: true, passive: true});

        document.addEventListener('touchend', event => {
            const point = event.changedTouches[0],
                  rect  = document.getElementById('translation-target').getBoundingClientRect();

            if (event.isTrusted) window.translationNative.releases.push({x: point.clientX - rect.left, y: point.clientY - rect.top})
        }, {capture: true, passive: true})
    });

    const cdp  = await page.context().newCDPSession(page),
          rect = await target.boundingBox();

    return {
        cdp, host,
        motion: () => worker.evaluate(() => Neo.getComponent('translation-target').motion),
        native: () => page.evaluate(() => window.translationNative),
        send  : (type, dx, dy) => cdp.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: dx === undefined ? [] : [{id: 17, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy)}]
        })
    }
}

test('translation accumulates coalesced steps, rebases the centroid, and qualifies only a directional release', async ({page}) => {
    const {cdp} = await bootMotion(page, 'none');

    try {
        const frames = await page.evaluate(async () => {
            const Translation = Neo.main.gesture.Translation,
                  records     = [],
                  point       = (id, x, y=15) => ({id, x, y}),
                  translation = Neo.create(Translation, {
                      doc    : document,
                      publish: (claim, type, data) => {
                          records.push({...data, type});
                          return true
                      },
                      settings: Neo.main.addon.Gesture
                  }),
                  sample = (claim, kind, elapsed, contacts, changed, lifted) => {
                      translation.track({claim, kind, contacts, changed, elapsed, lifted})
                  };

            const pan = {family: 'pan'};
            sample(pan, 'start', 0, [point(3, 20)], [3]);
            sample(pan, 'move', 0, [point(3, 27)], [3]);
            sample(pan, 'move', 10, [point(3, 37)], [3]);
            sample(pan, 'move', 20, [point(3, 57)], [3]);
            await new Promise(resolve => requestAnimationFrame(resolve));

            sample(pan, 'start', 30, [point(3, 57), point(7, 97)], [7]);
            sample(pan, 'end', 40, [point(7, 97)], [3]);
            await new Promise(resolve => requestAnimationFrame(resolve));
            sample(pan, 'move', 50, [point(7, 117)], [7]);
            sample(pan, 'cancel', 60, [], [7]);
            await new Promise(resolve => requestAnimationFrame(resolve));

            const swipe = (moves, [endAt, endX, endY=15]) => {
                const claim = {family: 'swipe'};

                sample(claim, 'start', 0, [point(4, 20)], [4]);

                for (const [time, x, y] of moves) {
                    sample(claim, 'move', time, [point(4, x, y)], [4])
                }

                sample(claim, 'end', endAt, [], [4], [point(4, endX, endY)])
            };

            swipe([[30, 65]], [60, 100]);
            swipe([[220, 65]], [440, 100]);
            swipe([[0, 65]], [0, 100]);
            swipe([[60, 100]], [280, 100]);
            swipe([[30, 65]], [60, 100, 95]);
            swipe([[40, 120], [70, 90]], [90, 70]);
            swipe([[30, 120], [55, 120], [80, 120]], [100, 120]);
            swipe([[30, 120], [55, 120.75], [80, 119.5]], [110, 121]);
            swipe([[30, 20, -65], [45, 20, -64]], [57, 20, -64]);
            swipe([[30, 120]], [80, 120]);
            swipe([[30, 120]], [81, 120]);
            translation.destroy();
            return records
        });

        const pan = frames.filter(event => event.type.startsWith('pan:'));
        expect(pan.map(({type, deltaX, stepX}) => [type, deltaX, stepX])).toEqual([
            ['pan:start', 7, 7], ['pan:move', 37, 30], ['pan:move', 37, 0], ['pan:cancel', 57, 20]
        ]);
        expect(pan[0].velocityX).toBe(0);
        expect(pan[2]).toMatchObject({contacts: [{id: 1, x: 97}], changed: [1, 0]});
        expect(pan[3]).toMatchObject({contacts: [], changed: [1], elapsed: 60});

        const swipes = frames.filter(event => event.type === 'swipe');
        expect(swipes.map(({direction, elapsed}) => [direction, elapsed])).toEqual([
            ['right', 60], ['up', 57], ['right', 80]
        ]);
        expect(swipes[0]).toMatchObject({contacts: [], changed: [0], direction: 'right', elapsed: 60, x: 100, y: 15});
        expect(swipes[0].phase).toBeUndefined();
        expect(swipes[0].velocityX).toBeCloseTo(80 / 60)
    } finally {
        await cdp.detach()
    }
});

test('Translation uses the Main addon policy to cap swipe history', async ({page}) => {
    const {cdp} = await bootMotion(page, 'none');

    try {
        const {defaultLimit, directions} = await page.evaluate(() => {
            const Translation  = Neo.main.gesture.Translation,
                  settings     = Neo.main.addon.Gesture,
                  defaultLimit = settings.swipeSampleLimit,
                  claim        = {family: 'swipe'},
                  start        = {id: 0, x: 0, y: 10},
                  lift         = {id: 0, x: 80, y: 10};

            const directions = [defaultLimit, 1].map(swipeSampleLimit => {
                settings.swipeSampleLimit = swipeSampleLimit;

                const events     = [],
                      recognizer = Neo.create(Translation, {
                          doc    : document,
                          publish: (owner, type, data) => {events.push(data.direction)},
                          settings
                      });

                recognizer.track({claim, kind: 'start', elapsed: 0, contacts: [start]});
                recognizer.track({claim, kind: 'move', elapsed: 30, contacts: [lift]});
                recognizer.track({claim, kind: 'end', elapsed: 70, contacts: [], lifted: [lift]});
                recognizer.destroy();
                return events
            });

            return {defaultLimit, directions}
        });

        expect(defaultLimit).toBe(32);
        expect(directions).toEqual([['right'], []])
    } finally {
        await cdp.detach()
    }
});

test('trusted horizontal input reaches App pan and swipe with the observed native release position', async ({page}) => {
    const {cdp, motion, native, send} = await bootMotion(page, 'pan-y');

    try {
        await send('touchStart', 60, 265);
        await send('touchMove', 95, 265);
        await send('touchMove', 175, 265);
        await send('touchMove', 255, 265);
        await send('touchEnd', 255, 265);

        await expect.poll(async () => (await motion()).swipes).toHaveLength(1);
        const result = await motion(), {frames, releases} = await native(), release = releases.at(-1);

        expect(frames.filter(frame => frame.kind === 'end')).toEqual(['pan', 'swipe'].map(family => ({
            family, kind: 'end', hasLifted: true, lifted: [{id: 0, ...release}]
        })));
        expect(frames.some(frame => frame.kind !== 'end' && frame.hasLifted)).toBe(false);
        expect(result.swipes[0]).toMatchObject({trusted: true, direction: 'right', contacts: [], lifted: false, ...release});
        expect(result.swipes[0].phase).toBeUndefined();
        expect(result.swipes[0].velocityX).toBeGreaterThan(0);
        expect(result.pan[0]).toMatchObject({phase: 'start', trusted: true});
        expect(result.pan.at(-1)).toMatchObject({phase: 'end', deltaX: 195, deltaY: 0});
        expect(result.pan.some(event => event.lifted)).toBe(false);
        expect(result.pan.some(event => event.phase === 'move')).toBe(true)
    } finally {
        await cdp.detach()
    }
});

test('native vertical scroll never commits a swipe', async ({page}) => {
    const {cdp, host, motion, native, send} = await bootMotion(page, 'pan-y');

    try {
        await send('touchStart', 120, 325);
        for (let step = 1; step <= 5; step++) {
            await send('touchMove', 120, 325 - step * 23)
        }

        await expect.poll(() => host.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await expect.poll(async () => (await native()).cancels).toBeGreaterThan(0);
        await send('touchEnd');

        const result = await motion(), {frames} = await native();

        expect(result.swipes).toEqual([]);
        expect(frames.filter(frame => frame.kind === 'cancel').every(frame => !frame.hasLifted)).toBe(true);
        expect(result.pan.filter(event => event.phase === 'end')).toEqual([]);
        if (result.pan.length) expect(result.pan.at(-1).phase).toBe('cancel')
    } finally {
        await cdp.detach()
    }
});
