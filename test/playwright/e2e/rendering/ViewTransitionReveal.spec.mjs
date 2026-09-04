import {test, expect} from '@playwright/test';

/**
 * @summary Installs observation seams around the native API; the engine method and animations run unchanged.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function prepare(page) {
    await page.goto('/test/playwright/component/apps/empty-viewport/');
    await page.bringToFront();
    await page.waitForFunction(() => typeof globalThis.Neo?.main?.DomAccess?.startViewTransition === 'function');

    await page.evaluate(() => {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgb(200,30,40)';
        document.body.append(panel);

        const start   = document.startViewTransition.bind(document),
              animate = document.documentElement.animate.bind(document.documentElement),
              state   = window.revealProbe = {panel, effects: [], calls: [], warnings: []};

        document.startViewTransition = callback => {
            state.ready = false;
            state.transition = start(async () => {
                const pending = callback();
                panel.style.background = state.color;
                await pending
            });
            state.transition.ready.then(() => state.ready = true, () => {});
            state.transition.finished.catch(() => {});
            return state.transition
        };

        document.documentElement.animate = (keyframes, options) => {
            state.calls.push({keyframes, options});
            if (state.failAt === state.calls.length) throw Error('injected registration failure');
            const effect = animate(keyframes, options);
            state.effects.push(effect);
            if (state.pauseEffects !== false) {
                effect.pause();
                effect.currentTime = state.sampleTime
            }
            return effect
        };

        console.warn = (...args) => state.warnings.push(args.map(String).join(' '))
    })
}

/**
 * @summary Samples a real transition at controlled animation times, without sleep-based timing.
 * @param {import('@playwright/test').Page} page
 * @param {Object} data Engine request
 * @param {Number} [sampleTime=250] Script animation sample time
 * @returns {Promise<Object>}
 */
async function sample(page, data, sampleTime = 250) {
    return page.evaluate(async ({data, sampleTime}) => {
        const state = window.revealProbe;
        state.effects = [];
        state.calls = [];
        state.sampleTime = sampleTime;
        state.color = state.panel.style.backgroundColor === 'rgb(200, 30, 40)' ? 'rgb(20,80,220)' : 'rgb(200,30,40)';

        const accepted            = await Neo.main.DomAccess.startViewTransition(data),
              returnedBeforeReady = !state.ready;

        await state.transition.ready;
        state.animations = document.getAnimations().filter(animation => animation.effect?.pseudoElement);
        // The UA fade has ended while a 500ms reveal is still halfway through its circle.
        for (const animation of state.animations) {
            if (!state.effects.includes(animation)) {
                animation.pause();
                animation.currentTime = data.reveal ? 300 : 125
            }
        }

        const styles = ['old', 'new'].map(layer => {
            const style = getComputedStyle(document.documentElement, `::view-transition-${layer}(root)`);
            return {opacity: Number(style.opacity), blend: style.mixBlendMode}
        });

        return {accepted, returnedBeforeReady, styles, calls: state.calls}
    }, {data, sampleTime})
}

/**
 * @summary Lets the native transition settle and observes release of the engine's exact handles.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String[]>}
 */
async function finish(page) {
    return page.evaluate(async () => {
        const state = window.revealProbe;
        state.animations.forEach(animation => animation.finish());
        await state.transition.finished;
        return state.effects.map(effect => effect.playState)
    })
}

/**
 * @summary Reads actual screenshot pixels using the browser's PNG decoder.
 * @param {import('@playwright/test').Page} page
 * @param {Buffer} screenshot
 * @returns {Promise<Number[][]>}
 */
async function pixels(page, screenshot) {
    return page.evaluate(async base64 => {
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob()),
              canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        return [[40, 40], [750, 550]].map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data))
    }, screenshot.toString('base64'))
}

test.describe('engine-owned view transition reveal', () => {
    test.use({viewport: {width: 800, height: 600}, deviceScaleFactor: 1});

    test.beforeEach(async ({page}) => prepare(page));

    test('filled reveal effects complete naturally and leave the next transition untouched', async ({page}) => {
        const states = await page.evaluate(async () => {
            const state = window.revealProbe;
            state.pauseEffects = false;
            state.color = 'rgb(20,80,220)';
            await Neo.main.DomAccess.startViewTransition({reveal: {x: 40, y: 40}});
            await state.transition.finished;
            return state.effects.map(effect => effect.playState)
        });
        expect(states).toEqual(['idle', 'idle']);
        const plain = await sample(page, {});
        expect(plain.calls).toHaveLength(0);
        expect(plain.styles[0].opacity).toBeGreaterThan(0);
        expect(plain.styles[0].opacity).toBeLessThan(1);
        await finish(page)
    });

    test('holds the old pixels outside the circle, then restores the plain UA cross-fade', async ({page}, testInfo) => {
        const result = await sample(page, {reveal: {x: 40, y: 40, easing: 'linear'}});

        expect(result.accepted).toBe(true);
        expect(result.returnedBeforeReady).toBe(true);
        expect(result.calls).toHaveLength(2);
        expect(result.styles).toEqual([{opacity: 1, blend: 'normal'}, {opacity: 1, blend: 'normal'}]);

        const screenshot = await page.screenshot();
        await testInfo.attach('reveal-halfway', {body: screenshot, contentType: 'image/png'});
        expect(await pixels(page, screenshot)).toEqual([[20, 80, 220, 255], [200, 30, 40, 255]]);
        expect(await finish(page)).toEqual(['idle', 'idle']);

        const plain = await sample(page, {});
        expect(plain.calls).toHaveLength(0);
        for (const style of plain.styles) {
            expect(style.opacity).toBeGreaterThan(0);
            expect(style.opacity).toBeLessThan(1);
            expect(style.blend).toBe('plus-lighter')
        }
        await finish(page)
    });

    for (const duration of [0, 80]) {
        test(`a ${duration}ms reveal stays opaque until the longer UA transition settles`, async ({page}) => {
            const result = await sample(page, {reveal: {x: 40, y: 40, duration}}, duration);

            expect(result.styles).toEqual([{opacity: 1, blend: 'normal'}, {opacity: 1, blend: 'normal'}]);
            expect(await pixels(page, await page.screenshot())).toEqual([[20, 80, 220, 255], [20, 80, 220, 255]]);
            expect(await finish(page)).toEqual(['idle', 'idle'])
        })
    }

    test('a skipped active reveal releases only its generated effects', async ({page}) => {
        await page.evaluate(() => {
            const marker = document.createElement('div');
            document.body.append(marker);
            window.revealProbe.unrelated = marker.animate([{opacity: 0}, {opacity: 1}], {duration: 60000})
        });
        await sample(page, {reveal: {x: 40, y: 40}});
        const states = await page.evaluate(async () => {
            const state = window.revealProbe;
            state.transition.skipTransition();
            await state.transition.finished;
            const states = [...state.effects, state.unrelated].map(effect => effect.playState);
            state.unrelated.cancel();
            return states
        });
        expect(states).toEqual(['idle', 'idle', 'running'])
    });

    test('partial registration failure releases the first effect and keeps the warning', async ({page}) => {
        await page.evaluate(() => window.revealProbe.failAt = 2);
        const result = await sample(page, {reveal: {x: 40, y: 40}});
        expect(result.accepted).toBe(true);
        expect(await page.evaluate(() => ({
            states  : window.revealProbe.effects.map(effect => effect.playState),
            warnings: window.revealProbe.warnings
        }))).toMatchObject({
            states  : ['idle'],
            warnings: [expect.stringContaining('injected registration failure')]
        });
        await finish(page)
    });

    test('a raw animation wins unchanged and remains caller-owned after completion', async ({page}) => {
        const animate = {
            keyframes: [{opacity: 0.4}, {opacity: 0.7}],
            options  : {duration: 500, fill: 'both', pseudoElement: '::view-transition-new(root)'}
        };
        const result = await sample(page, {animate, reveal: {x: 40, y: 40}});
        expect(result.calls).toEqual([animate]);
        expect(await finish(page)).toEqual(['finished'])
    });

    test('an unusable reveal leaves the UA transition unchanged', async ({page}) => {
        const result = await sample(page, {reveal: {}});
        expect(result.calls).toHaveLength(0);
        await finish(page)
    });

    test('unsupported browsers retain the false return', async ({page}) => {
        expect(await page.evaluate(async () => {
            document.startViewTransition = undefined;
            return Neo.main.DomAccess.startViewTransition({reveal: {x: 40, y: 40}})
        })).toBe(false)
    });

    test('ready rejection keeps the early return and warns without registering effects', async ({page}) => {
        const result = await page.evaluate(async () => {
            const start = document.startViewTransition;
            document.startViewTransition = callback => {
                const transition = start(callback);
                transition.skipTransition();
                return transition
            };
            const accepted = await Neo.main.DomAccess.startViewTransition({reveal: {x: 40, y: 40}});
            await window.revealProbe.transition.finished;
            return {accepted, calls: window.revealProbe.calls, warnings: window.revealProbe.warnings}
        });
        expect(result.accepted).toBe(true);
        expect(result.calls).toEqual([]);
        expect(result.warnings).toEqual([expect.stringContaining('the view transition reveal was not applied')])
    })
});
