import {expect, test} from '../../fixtures.mjs';

test.use({hasTouch: true, viewport: {width: 1280, height: 800}});

/**
 * @summary Verifies partial-lift multi-touch contact tracking and single-finger drag geometry on the live Helix
 * example via trusted CDP multi-touch input (`Input.dispatchTouchEvent`) paired with Neural Link and App Worker checks.
 */
async function bootHelix(page, neuralLink) {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto('/examples/component/helix/index.html');
    await expect(page.locator('.neo-helix-item').first()).toBeVisible();

    const app       = await neuralLink.connectToApp('Neo.examples.component.helix'),
          [initial] = await app.queryComponent({ntype: 'helix'}, ['mouseWheelDeltaX', 'mouseWheelDeltaY', 'rotationAngle', 'translateZ']),
          appWorker = page.workers().find(worker => worker.url().includes('App.mjs'));

    await expect.poll(() => appWorker.evaluate(id => {
        const helix = Neo.get(id);
        return Boolean(helix && helix[Symbol.for('lockWheel')] === false)
    }, initial.id)).toBe(true);

    // Align Helix with the Controls panel RangeField center (`rotationAngle: 0`, `translateZ: -1500`)
    // so ViewportController's slider sync (`[-720, 720]` and `[-4500, 4500]`) never clamps single-step deltas.
    await appWorker.evaluate(id => {
        Neo.get(id).set({rotationAngle: 0, translateZ: -1500})
    }, initial.id);

    const [ready] = await app.queryComponent({id: initial.id}, ['mouseWheelDeltaX', 'mouseWheelDeltaY', 'rotationAngle', 'translateZ']),
          box     = await page.locator('.neo-helix').boundingBox();

    return {app, appWorker, box, helixId: initial.id, initial: ready.properties}
}

/**
 * @summary Reads `rotationAngle` and `translateZ` directly from the App Worker and Neural Link.
 */
async function readHelixGeometry(app, appWorker, helixId) {
    const workerState = await appWorker.evaluate(id => {
        const helix = Neo.get(id);
        return {
            finite       : Number.isFinite(helix.rotationAngle) && Number.isFinite(helix.translateZ),
            rotationAngle: helix.rotationAngle,
            translateZ   : helix.translateZ
        }
    }, helixId);

    const [nlState] = await app.queryComponent({id: helixId}, ['rotationAngle', 'translateZ']);

    return {nl: nlState.properties, worker: workerState}
}

test.describe('Helix multi-touch partial lift and single-finger drag', () => {
    test('lifting the tracked finger reanchors to the remaining contact', async ({page, neuralLink}) => {
        const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
              cdp                                     = await page.context().newCDPSession(page),
              x13                                     = Math.round(box.x + box.width * 0.35),
              y13                                     = Math.round(box.y + box.height * 0.5),
              x27                                     = Math.round(box.x + box.width * 0.55),
              y27                                     = Math.round(box.y + box.height * 0.55);

        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [{id: 13, x: x13, y: y13, radiusX: 5, radiusY: 5, force: 1}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [
                {id: 13, x: x13, y: y13, radiusX: 5, radiusY: 5, force: 1},
                {id: 27, x: x27, y: y27, radiusX: 5, radiusY: 5, force: 1}
            ]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchEnd',
            touchPoints: [{id: 13, x: x13, y: y13, radiusX: 5, radiusY: 5, force: 0}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchMove',
            touchPoints: [{id: 27, x: x27 - 12, y: y27 + 6, radiusX: 5, radiusY: 5, force: 1}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchEnd',
            touchPoints: [{id: 27, x: x27 - 12, y: y27 + 6, radiusX: 5, radiusY: 5, force: 0}]
        });

        await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker.rotationAngle)
            .toBe(initial.rotationAngle - 12 * 1.5 * initial.mouseWheelDeltaX);

        const afterTrackedLift = await readHelixGeometry(app, appWorker, helixId);
        expect(afterTrackedLift.worker.finite).toBe(true);
        expect(afterTrackedLift.worker.translateZ).toBe(initial.translateZ + 6 * 3 * initial.mouseWheelDeltaY)
    });

    test('one-finger drag rotates and zooms the Helix as before', async ({page, neuralLink}) => {
        const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
              cdp                                     = await page.context().newCDPSession(page),
              x0                                      = Math.round(box.x + box.width * 0.4),
              y0                                      = Math.round(box.y + box.height * 0.5),
              dx                                      = 20,
              dy                                      = 12;

        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [{id: 1, x: x0, y: y0, radiusX: 5, radiusY: 5, force: 1}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchMove',
            touchPoints: [{id: 1, x: x0 + dx, y: y0 + dy, radiusX: 5, radiusY: 5, force: 1}]
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchEnd',
            touchPoints: [{id: 1, x: x0 + dx, y: y0 + dy, radiusX: 5, radiusY: 5, force: 0}]
        });

        await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker.rotationAngle)
            .toBe(initial.rotationAngle + dx * 1.5 * initial.mouseWheelDeltaX);

        const finalState = await readHelixGeometry(app, appWorker, helixId);

        expect(finalState.worker.translateZ).toBe(initial.translateZ + dy * 3 * initial.mouseWheelDeltaY);
        expect(finalState.nl.rotationAngle).toBe(finalState.worker.rotationAngle);
        expect(finalState.nl.translateZ).toBe(finalState.worker.translateZ)
    });

    for (const provider of ['Neural Link', 'Chromium']) {
        test(`a staggered lift, cancellation and fresh contact via ${provider}`, async ({page, neuralLink}) => {
            const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
                  [{properties: {windowId}}]              = await app.queryComponent({id: helixId}, ['windowId']),
                  contact                                 = (identifier, x, y) => ({identifier, clientX: Math.round(box.x + box.width * x), clientY: Math.round(box.y + box.height * y)}),
                  move                                    = (point, dx, dy) => ({...point, clientX: point.clientX + dx, clientY: point.clientY + dy}),
                  a                                       = contact(13, 0.35, 0.5),
                  b                                       = contact(27, 0.55, 0.55),
                  c                                       = contact(42, 0.42, 0.53),
                  movedA                                  = move(a, 16, -10),
                  movedC                                  = move(c, 28, 12),
                  trace                                   = [
                      ['touchstart', [a],       [a]],
                      ['touchstart', [a, b],    [b]],
                      ['touchend',   [a],       [b]],
                      ['touchmove',  [movedA],  [movedA]],
                      ['touchcancel', [],       [movedA]],
                      ['touchstart', [c],       [c]],
                      ['touchmove',  [movedC],  [movedC]],
                      ['touchend',   [],        [movedC]]
                  ],
                  trusted = provider === 'Chromium',
                  cdp     = trusted && await page.context().newCDPSession(page);

            await page.locator('.neo-helix').evaluate(node => {
                window.helixContacts = [];
                const ids = list => Array.from(list, point => point.identifier);
                for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
                    node.addEventListener(type, e => window.helixContacts.push(
                        [e.type, ids(e.touches), ids(e.changedTouches), e.isTrusted]
                    ), {capture: true, passive: true})
                }
            });

            async function dispatch(frames) {
                if (trusted) {
                    const types = {touchstart: 'touchStart', touchmove: 'touchMove', touchend: 'touchEnd', touchcancel: 'touchCancel'};
                    for (const [type, active, changed] of frames) {
                        // Chromium identifies a partial lift by the released contact. Cancellation clears all contacts.
                        const points = type === 'touchend' ? changed : active;
                        await cdp.send('Input.dispatchTouchEvent', {type: types[type], touchPoints: points.map(
                            ({identifier: id, clientX: x, clientY: y}) => ({id, x, y})
                        )})
                    }
                } else {
                    expect(await app.simulateEvent(frames.map(([type, touches, changedTouches]) => ({
                        targetId: helixId, windowId: String(windowId), type, options: {touches, targetTouches: touches, changedTouches}
                    })))).toBe(true)
                }
            }

            try {
                await dispatch(trace.slice(0, 4));
                const geometry = () => readHelixGeometry(app, appWorker, helixId);
                await expect.poll(async () => (await geometry()).worker.rotationAngle)
                    .toBe(initial.rotationAngle + 16 * 1.5 * initial.mouseWheelDeltaX);
                const afterLift = await geometry();
                expect(afterLift.worker.finite).toBe(true);
                expect(afterLift.worker.translateZ).toBe(initial.translateZ - 10 * 3 * initial.mouseWheelDeltaY);
                expect(afterLift.nl.rotationAngle).toBe(afterLift.worker.rotationAngle);
                expect(afterLift.nl.translateZ).toBe(afterLift.worker.translateZ);

                await dispatch(trace.slice(4));
                await expect.poll(async () => (await geometry()).worker.rotationAngle)
                    .toBe(afterLift.worker.rotationAngle + 28 * 1.5 * initial.mouseWheelDeltaX);
                const final = await geometry();
                expect(final.worker.translateZ).toBe(afterLift.worker.translateZ + 12 * 3 * initial.mouseWheelDeltaY);
                expect(final.nl.rotationAngle).toBe(final.worker.rotationAngle);
                expect(final.nl.translateZ).toBe(final.worker.translateZ);

                expect(await page.evaluate(() => window.helixContacts)).toEqual(trace.map(([type, active, changed]) => [
                    type, active.map(point => point.identifier), changed.map(point => point.identifier), trusted
                ]))
            } finally {
                if (cdp) await cdp.detach()
            }
        })
    }
});
