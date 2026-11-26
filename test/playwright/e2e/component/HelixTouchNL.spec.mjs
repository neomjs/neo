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
    test('two fingers down, lift one, move the remaining finger keeps rotationAngle and translateZ finite within one step delta', async ({page, neuralLink}) => {
        const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
              cdp                                     = await page.context().newCDPSession(page),
              x13                                     = Math.round(box.x + box.width * 0.35),
              y13                                     = Math.round(box.y + box.height * 0.5),
              x27                                     = Math.round(box.x + box.width * 0.55),
              y27                                     = Math.round(box.y + box.height * 0.55),
              dx                                      = 16,
              dy                                      = -10;

        // 1. Put down contact 13
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [{id: 13, x: x13, y: y13, radiusX: 5, radiusY: 5, force: 1}]
        });

        // 2. Add contact 27 while 13 stays down
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchStart',
            touchPoints: [
                {id: 13, x: x13, y: y13, radiusX: 5, radiusY: 5, force: 1},
                {id: 27, x: x27, y: y27, radiusX: 5, radiusY: 5, force: 1}
            ]
        });

        // 3. Lift only contact 27
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchEnd',
            touchPoints: [{id: 27, x: x27, y: y27, radiusX: 5, radiusY: 5, force: 0}]
        });

        // 4. Move remaining contact 13 by (dx, dy)
        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchMove',
            touchPoints: [{id: 13, x: x13 + dx, y: y13 + dy, radiusX: 5, radiusY: 5, force: 1}]
        });

        const maxExpectedRotationDelta   = Math.abs(dx) * 1.5 * initial.mouseWheelDeltaX,
              maxExpectedTranslateZDelta = Math.abs(dy) * 3 * initial.mouseWheelDeltaY;

        await expect.poll(async () => {
            const {worker} = await readHelixGeometry(app, appWorker, helixId);
            return worker.rotationAngle !== initial.rotationAngle || !worker.finite
        }).toBe(true);

        const afterFirstMove = await readHelixGeometry(app, appWorker, helixId);

        expect(afterFirstMove.worker.finite).toBe(true);
        expect(typeof afterFirstMove.nl.rotationAngle).toBe('number');
        expect(typeof afterFirstMove.nl.translateZ).toBe('number');
        expect(Math.abs(afterFirstMove.worker.rotationAngle - initial.rotationAngle)).toBeLessThanOrEqual(maxExpectedRotationDelta);
        expect(Math.abs(afterFirstMove.worker.translateZ - initial.translateZ)).toBeLessThanOrEqual(maxExpectedTranslateZDelta);
        expect(afterFirstMove.worker.rotationAngle).toBe(initial.rotationAngle + dx * 1.5 * initial.mouseWheelDeltaX);
        expect(afterFirstMove.worker.translateZ).toBe(initial.translateZ + dy * 3 * initial.mouseWheelDeltaY);

        await cdp.send('Input.dispatchTouchEvent', {
            type       : 'touchEnd',
            touchPoints: [{id: 13, x: x13 + dx, y: y13 + dy, radiusX: 5, radiusY: 5, force: 0}]
        });

        // Also verify lifting the tracked contact (13) while 27 stays down re-anchors to 27 without a cross-finger jump
        const mid = (await readHelixGeometry(app, appWorker, helixId)).worker;

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
            .toBe(mid.rotationAngle + (-12) * 1.5 * initial.mouseWheelDeltaX);

        const afterTrackedLift = await readHelixGeometry(app, appWorker, helixId);
        expect(afterTrackedLift.worker.finite).toBe(true);
        expect(afterTrackedLift.worker.translateZ).toBe(mid.translateZ + 6 * 3 * initial.mouseWheelDeltaY)
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
});
