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

/**
 * @summary Records actual touch input at the document boundary independently of the replay receipt.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
async function observeTouchInput(page) {
    await page.evaluate(() => {
        window.helixContacts = [];

        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            document.addEventListener(type, event => {
                window.helixContacts.push({
                    active : event.touches.length,
                    changed: event.changedTouches.length,
                    target : event.target.closest('.neo-helix')?.id,
                    trusted: event.isTrusted,
                    type
                })
            }, {capture: true, passive: true})
        }
    })
}

const contactFrame = (t, state, point) => ({t, contacts: [{...point, state}]});

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

    for (const provider of ['engine', 'browser']) {
        test(`replays a staggered lift, cancellation, fresh contact and hold via the ${provider} provider`, async ({page, neuralLink}) => {
            const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
                  [{properties: {windowId}}]              = await app.queryComponent({id: helixId}, ['windowId']),
                  contact                                 = (id, x, y) => ({id, x: Math.round(box.width * x), y: Math.round(box.height * y)}),
                  move                                    = (point, dx, dy) => ({...point, x: point.x + dx, y: point.y + dy}),
                  a                                       = contact('A', 0.35, 0.5),
                  b                                       = contact('B', 0.55, 0.55),
                  c                                       = contact('C', 0.42, 0.53),
                  hold                                    = contact('hold', 0.48, 0.5),
                  movedA                                  = move(a, 16, -10),
                  movedC                                  = move(c, 28, 12),
                  holdDuration                            = 240,
                  frames                                  = [
                      contactFrame(0,   'down',   a),
                      contactFrame(20,  'down',   b),
                      contactFrame(40,  'up',     b),
                      contactFrame(60,  'move',   movedA),
                      contactFrame(80,  'cancel', movedA),
                      contactFrame(100, 'down',   c),
                      contactFrame(120, 'move',   movedC),
                      contactFrame(140, 'up',     movedC),
                      contactFrame(160, 'down',   hold),
                      contactFrame(160 + holdDuration, 'up', hold)
                  ],
                  expected = [
                      ['touchstart',  ['A'],      ['A']],
                      ['touchstart',  ['A', 'B'], ['B']],
                      ['touchend',    ['A'],      ['B']],
                      ['touchmove',   ['A'],      ['A']],
                      ['touchcancel', [],         ['A']],
                      ['touchstart',  ['C'],      ['C']],
                      ['touchmove',   ['C'],      ['C']],
                      ['touchend',    [],         ['C']],
                      ['touchstart',  ['hold'],   ['hold']],
                      ['touchend',    [],         ['hold']]
                  ],
                  trusted = provider === 'browser';

            await observeTouchInput(page);

            const receipt = await app.driveGesture({provider, target: helixId, windowId: String(windowId), frames});

            expect(receipt, JSON.stringify(receipt)).toMatchObject({
                provider, trusted, terminal: 'end', sequences: ['cancel', 'end', 'end'], success: true
            });

            const events = receipt.observed.flatMap(frame => frame.events);

            expect(events.map(({type, active, changed}) => [type, active.map(point => point.id), changed.map(point => point.id)]))
                .toEqual(expected);
            expect(events.at(-1).elapsedMs - events.at(-2).elapsedMs, 'the stationary contact was held before release')
                .toBeGreaterThanOrEqual(holdDuration - 20);
            expect(await page.evaluate(() => window.helixContacts)).toEqual(expected.map(([type, active, changed]) => ({
                type, trusted, target: helixId, active: active.length, changed: changed.length
            })));

            const expectedGeometry = {
                rotationAngle: initial.rotationAngle + (16 + 28) * 1.5 * initial.mouseWheelDeltaX,
                translateZ   : initial.translateZ + (-10 + 12) * 3 * initial.mouseWheelDeltaY
            };

            await expect.poll(() => readHelixGeometry(app, appWorker, helixId)).toEqual({
                worker: {finite: true, ...expectedGeometry},
                nl    : expectedGeometry
            })
        })
    }

    test('the browser provider gives vertical motion to native scrolling', async ({page, neuralLink}) => {
        const {app, helixId}             = await bootHelix(page, neuralLink),
              [{properties: {windowId}}] = await app.queryComponent({id: helixId}, ['windowId']),
              target                     = 'helix-native-gesture-scroll',
              scrollHost                 = page.locator(`#${target}`),
              point                      = y => ({id: 'scroll', x: 80, y}),
              frames                     = [
                  contactFrame(0,   'down', point(250)),
                  contactFrame(40,  'move', point(220)),
                  contactFrame(80,  'move', point(190)),
                  contactFrame(120, 'move', point(160)),
                  contactFrame(160, 'move', point(130)),
                  contactFrame(200, 'move', point(100)),
                  contactFrame(240, 'up', point(100))
              ];

        await page.evaluate(id => {
            const host    = document.createElement('div'),
                  content = document.createElement('div');

            host.id = id;
            Object.assign(host.style, {
                background : 'white',
                height     : '320px',
                overflowY  : 'auto',
                position   : 'fixed',
                right      : '32px',
                top        : '80px',
                touchAction: 'pan-y',
                width      : '220px',
                zIndex     : '10000'
            });
            content.style.height = '1100px';
            host.append(content);
            document.body.append(host);
            host.addEventListener('pointercancel', event => {host.dataset.trustedCancel = String(event.isTrusted)}, {once: true})
        }, target);

        await expect(scrollHost).toBeVisible();
        expect(await scrollHost.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);

        const read   = () => scrollHost.evaluate(node => ({scrollTop: node.scrollTop, trustedCancel: node.dataset.trustedCancel || null})),
              replay = provider => app.driveGesture({provider, target, windowId: String(windowId), frames});

        await expect(replay('engine')).resolves.toMatchObject({provider: 'engine', success: true, trusted: false});
        expect(await read()).toEqual({scrollTop: 0, trustedCancel: null});

        await expect(replay('browser')).resolves.toMatchObject({provider: 'browser', trusted: true});
        await expect.poll(async () => (await read()).scrollTop).toBeGreaterThan(0);
        expect((await read()).trustedCancel).toBe('true')
    });

    test('the browser provider refuses a partial cancellation before dispatch', async ({page, neuralLink}) => {
        const {app, appWorker, box, helixId, initial} = await bootHelix(page, neuralLink),
              [{properties: {windowId}}]              = await app.queryComponent({id: helixId}, ['windowId']),
              a                                       = {id: 'A', x: Math.round(box.width * 0.35), y: Math.round(box.height * 0.5)},
              b                                       = {id: 'B', x: Math.round(box.width * 0.55), y: Math.round(box.height * 0.55)};

        await observeTouchInput(page);

        const receipt = await app.driveGesture({
            provider: 'browser',
            target  : helixId,
            windowId: String(windowId),
            frames  : [
                contactFrame(0,  'down',   a),
                contactFrame(20, 'down',   b),
                contactFrame(40, 'cancel', a),
                contactFrame(60, 'up',     b)
            ]
        });

        expect(receipt).toMatchObject({
            error   : {code: 'BROWSER_TOUCH_PARTIAL_CANCEL_UNAVAILABLE'},
            observed: [],
            provider: 'browser',
            status  : 'unavailable',
            success : false,
            terminal: 'none',
            trusted : null
        });
        expect(await page.evaluate(() => window.helixContacts)).toEqual([]);
        expect((await readHelixGeometry(app, appWorker, helixId)).worker)
            .toEqual({finite: true, rotationAngle: initial.rotationAngle, translateZ: initial.translateZ})
    })
});
