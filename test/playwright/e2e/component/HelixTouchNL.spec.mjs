import {expect, test} from '../../fixtures.mjs';

test.use({hasTouch: true, viewport: {width: 1280, height: 800}});

/**
 * @summary Opens the stock Helix and waits for its demand-loaded gesture receiver and first geometry.
 */
async function bootHelix(page, neuralLink) {
    await neuralLink.routeConfig(page.context(), config => ({...config, useAiClient: true}));
    await page.goto('/examples/component/helix/index.html');
    await expect(page.locator('.neo-helix-item').first()).toBeVisible();

    const app       = await neuralLink.connectToApp('Neo.examples.component.helix'),
          [initial] = await app.queryComponent({ntype: 'helix'}, ['windowId']),
          appWorker = page.workers().find(worker => worker.url().includes('App.mjs'));

    await expect.poll(() => appWorker.evaluate(id => {
        const helix = Neo.get(id);
        return Boolean(helix && helix[Symbol.for('lockWheel')] === false)
    }, initial.id)).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(Neo.main?.addon?.Gesture))).toBe(true);

    // Align Helix with the Controls panel RangeField center (`rotationAngle: 0`, `translateZ: -1500`)
    // so ViewportController's slider sync (`[-720, 720]` and `[-4500, 4500]`) never clamps single-step deltas.
    await appWorker.evaluate(async id => {
        const helix = Neo.getComponent(id);

        helix.set({rotationAngle: 0, translateZ: -1500});
        await helix.refresh()
    }, initial.id);

    const [ready] = await app.queryComponent({id: initial.id}, ['mouseWheelDeltaX', 'mouseWheelDeltaY', 'perspective', 'rotationAngle', 'translateZ', 'windowId']),
          helix   = page.locator('.neo-helix'),
          box     = await helix.boundingBox(),
          replay  = (provider, frames) => app.driveGesture({
              frames, provider, target: initial.id, windowId: String(ready.properties.windowId)
          });

    return {app, appWorker, box, helix, helixId: initial.id, initial: ready.properties, replay}
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

const pairFrame = (t, state, points) => ({t, contacts: points.map(point => ({...point, state}))});

/**
 * @summary Reads actual Main-to-App input sends and real App geometry refreshes without replacing the consumer.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Worker} appWorker
 * @param {String} helixId
 */
async function observeMotion(page, appWorker, helixId) {
    await observeTouchInput(page);
    await page.evaluate(id => {
        const manager = Neo.worker.Manager,
              send    = manager.sendMessage;

        window.helixMotionWire = {rawMoves: 0, semantic: []};
        manager.sendMessage   = function(destination, message, transfer) {
            const result                    = send.call(this, destination, message, transfer),
                  {action, data, eventName} = message;

            if (result && destination === 'app' && action === 'domEvent') {
                if (eventName === 'touchmove' && data.path?.some(node => node.id === id)) {
                    window.helixMotionWire.rawMoves++
                } else if (data.gestureOwner?.id === id && (eventName.startsWith('pan:') || eventName.startsWith('pinch:'))) {
                    const {gestureId, phase, scale, stepX, trusted} = data;

                    window.helixMotionWire.semantic.push({eventName, gestureId, phase, scale, stepX, trusted})
                }
            }

            return result
        }
    }, helixId);
    await appWorker.evaluate(id => {
        const helix     = Neo.getComponent(id),
              domAccess = Neo.main.DomAccess,
              nextFrame = domAccess.nextAnimationFrame,
              refresh   = helix.refresh;
        let frame;

        helix.touchRefreshes = [];
        domAccess.nextAnimationFrame = async function(data) {
            const timestamp = await nextFrame.call(this, data);

            if (data.windowId === helix.windowId) frame = timestamp;
            return timestamp
        };
        helix.refresh = function(...args) {
            helix.touchRefreshes.push({frame, rotationAngle: helix.rotationAngle, translateZ: helix.translateZ});
            return refresh.apply(this, args)
        }
    }, helixId)
}

test.describe('Helix semantic pan and pinch', () => {
    for (const firstLift of [0, 1]) {
        test(`pinch depth rebases when contact ${firstLift + 1} lifts first, then starts a fresh gesture`, async ({page, neuralLink}) => {
            const {app, appWorker, box, helixId, initial, replay} = await bootHelix(page, neuralLink),
                  cx                                              = Math.round(box.width / 2),
                  cy                                              = Math.round(box.height / 2),
                  point                                           = (id, dx) => ({id, x: cx + dx, y: cy}),
                  pair                                            = [point('A', -30), point('B', 30)],
                  spread                                          = firstLift === 0 ? 60 : 15,
                  moved                                           = [point('A', -spread), point('B', spread)],
                  lift                                            = moved[firstLift],
                  keep                                            = moved[1 - firstLift],
                  shift                                           = {...keep, x: keep.x + 16},
                  depth                                           = initial.translateZ + Math.log(spread / 30) * initial.perspective,
                  angle                                           = initial.rotationAngle + 16 * 1.5 * initial.mouseWheelDeltaX;

            await observeTouchInput(page);
            const first = await replay('engine', [
                pairFrame(0, 'down', pair),
                pairFrame(20, 'move', moved),
                contactFrame(20, 'up', lift),
                contactFrame(60, 'move', shift),
                contactFrame(60, 'up', shift)
            ]);

            expect(first).toMatchObject({provider: 'engine', terminal: 'end', success: true, trusted: false});
            expect(first.observed.map(({active, changed}) => [active, changed])).toEqual([
                [['A', 'B'], ['A', 'B']], [['A', 'B'], ['A', 'B']], [[keep.id], [lift.id]], [[keep.id], [keep.id]], [[], [keep.id]]
            ]);
            await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker).toMatchObject({
                finite: true, rotationAngle: angle, translateZ: expect.closeTo(depth, 6)
            });

            const aborted   = [point('abort-A', -22), point('abort-B', 22)],
                  discarded = [point('abort-A', -44), point('abort-B', 44)];
            await expect(replay('engine', [
                pairFrame(0, 'down', aborted), pairFrame(20, 'move', discarded), pairFrame(20, 'cancel', discarded)
            ])).resolves.toMatchObject({provider: 'engine', terminal: 'cancel', success: true});

            // An already queued frame may run after cancellation. It must not apply the canceled scale.
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            expect((await readHelixGeometry(app, appWorker, helixId)).worker).toMatchObject({
                finite: true, rotationAngle: angle, translateZ: expect.closeTo(depth, 6)
            });

            const fresh = [point('fresh-A', -20), point('fresh-B', 20)],
                  zoom  = [point('fresh-A', -30), point('fresh-B', 30)];

            await expect(replay('engine', [
                pairFrame(0, 'down', fresh), pairFrame(20, 'move', zoom), pairFrame(20, 'up', zoom)
            ])).resolves.toMatchObject({provider: 'engine', terminal: 'end', success: true});
            await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker).toMatchObject({
                finite: true, rotationAngle: angle, translateZ: expect.closeTo(depth + Math.log(1.5) * initial.perspective, 6)
            })
        })
    }

    test('coalesces continuous pan to one actual rotation refresh per frame and carries the endpoint', async ({page, neuralLink}) => {
        const {app, appWorker, box, helixId, initial, replay} = await bootHelix(page, neuralLink),
              point                                           = dx => ({id: 'pan', x: Math.round(box.width * 0.35) + dx, y: Math.round(box.height * 0.5)}),
              moves                                           = [[20, 10], [20, 14], [20, 18], [90, 22], [90, 26], [90, 30],
                       [160, 34], [160, 38], [160, 42], [230, 46], [230, 50]],
              frames = [contactFrame(0, 'down', point(0)), ...moves.map(([t, dx]) => contactFrame(t, 'move', point(dx))),
                        contactFrame(230, 'up', point(50))],
              expectedAngle = initial.rotationAngle + 50 * 1.5 * initial.mouseWheelDeltaX;

        await observeMotion(page, appWorker, helixId);
        await expect(replay('engine', frames)).resolves.toMatchObject({provider: 'engine', terminal: 'end', success: true});
        await expect.poll(() => readHelixGeometry(app, appWorker, helixId)).toEqual({
            worker: {finite: true, rotationAngle: expectedAngle, translateZ: initial.translateZ},
            nl    : {rotationAngle: expectedAngle, translateZ: initial.translateZ}
        });

        const {rawMoves, semantic, contactMoves} = await page.evaluate(() => ({
                  ...window.helixMotionWire,
                  contactMoves: window.helixContacts.filter(event => event.type === 'touchmove').length
              })),
              refreshes = await appWorker.evaluate(id => Neo.getComponent(id).touchRefreshes, helixId),
              pan       = semantic.filter(event => event.eventName.startsWith('pan:')),
              panMoves  = pan.filter(event => event.phase === 'move');

        expect(contactMoves).toBe(moves.length);
        expect(rawMoves).toBe(contactMoves);
        expect(panMoves.length).toBeGreaterThan(0);
        expect(panMoves.length).toBeLessThan(rawMoves);
        expect(pan[0].phase).toBe('start');
        expect(pan.at(-1).phase).toBe('end');
        expect(pan.reduce((sum, event) => sum + event.stepX, 0)).toBe(50);
        expect(refreshes.length).toBeGreaterThan(1);
        expect(refreshes.length).toBeLessThanOrEqual(pan.length);
        expect(refreshes.every(({frame, translateZ}) => Number.isFinite(frame) && translateZ === initial.translateZ)).toBe(true);
        expect(new Set(refreshes.map(({frame}) => frame)).size).toBe(refreshes.length);
        expect(refreshes.some(({rotationAngle}) => rotationAngle > initial.rotationAngle && rotationAngle < expectedAngle)).toBe(true);
        expect(refreshes.at(-1).rotationAngle).toBe(expectedAngle);
        test.info().annotations.push({type: 'Helix pan traffic', description: JSON.stringify({
            contactMoves, rawMoves, semanticMoves: panMoves.length, refreshes: refreshes.length
        })})
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
                  movedA                                  = move(a, 16, 0),
                  movedC                                  = move(c, 28, 0),
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

            const gain       = 1.5 * initial.mouseWheelDeltaX,
                  freshAngle = initial.rotationAngle + 28 * gain;

            await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker.rotationAngle)
                .toBeGreaterThanOrEqual(freshAngle);

            const {worker, nl} = await readHelixGeometry(app, appWorker, helixId);

            // The canceled stroke can have one already-painted rotation step. Its cancel never adds another.
            expect([freshAngle, freshAngle + 16 * gain]).toContain(worker.rotationAngle);
            expect(worker).toMatchObject({finite: true, translateZ: initial.translateZ});
            expect(nl).toEqual({rotationAngle: worker.rotationAngle, translateZ: worker.translateZ})
        })
    }

    test('a trusted vertical stroke starts over Helix and scrolls the stock mobile viewport', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 390, height: 844});

        const {app, appWorker, box, helix, helixId, initial, replay} = await bootHelix(page, neuralLink),
              viewport                                               = page.locator('.neo-examples-helix'),
              point                                                  = y => ({id: 'scroll', x: Math.round(box.width * 0.45), y: Math.round(box.height * y)}),
              frames                                                 = [contactFrame(0, 'down', point(0.78)), contactFrame(35, 'move', point(0.64)),
                          contactFrame(70, 'move', point(0.49)), contactFrame(105, 'move', point(0.31)),
                          contactFrame(140, 'up', point(0.31))];

        await expect(helix).toHaveCSS('touch-action', 'pan-y');
        await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(60);

        await helix.evaluate(node => {
            window.helixNativeScroll = {start: false, cancel: false};

            for (const [type, key] of [['pointerdown', 'start'], ['pointercancel', 'cancel']]) {
                document.addEventListener(type, event => {
                    if (event.isTrusted && event.pointerType === 'touch' && node.contains(event.target)) {
                        window.helixNativeScroll[key] = true
                    }
                }, {capture: true, passive: true})
            }
        });

        const scrollTop      = () => viewport.evaluate(node => node.scrollTop),
              originalScroll = await scrollTop(),
              geometry       = {finite: true, rotationAngle: initial.rotationAngle, translateZ: initial.translateZ};

        await expect(replay('engine', frames)).resolves.toMatchObject({provider: 'engine', success: true, trusted: false});
        expect(await scrollTop()).toBe(originalScroll);
        expect((await readHelixGeometry(app, appWorker, helixId)).worker).toEqual(geometry);

        await expect(replay('browser', frames)).resolves.toMatchObject({provider: 'browser', trusted: true});
        await expect.poll(() => page.evaluate(() => window.helixNativeScroll)).toEqual({start: true, cancel: true});
        await expect.poll(scrollTop).toBeGreaterThan(originalScroll + 20);
        expect((await readHelixGeometry(app, appWorker, helixId)).worker).toEqual(geometry)
    });

    test('retains native wheel, visible range controls, and Helix keyboard navigation', async ({page, neuralLink}) => {
        const {app, appWorker, box, helix, helixId, initial} = await bootHelix(page, neuralLink),
              [rotation]                                     = await app.queryComponent({ntype: 'rangefield', name: 'rotationAngle'}, ['stepSize']),
              [depth]                                        = await app.queryComponent({ntype: 'rangefield', name: 'translateZ'}, ['value']),
              rotationInput                                  = page.locator(`[id="${rotation.id}"] input[type="range"]`),
              depthInput                                     = page.locator(`[id="${depth.id}"] input[type="range"]`),
              angle                                          = initial.rotationAngle + 10 * initial.mouseWheelDeltaX,
              translateZ                                     = initial.translateZ + initial.mouseWheelDeltaY;

        await expect(rotationInput).toBeVisible();
        await expect(depthInput).toBeVisible();
        await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5);
        await page.mouse.wheel(10, 1);
        await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker).toEqual({
            finite: true, rotationAngle: angle, translateZ
        });
        await expect(rotationInput).toHaveValue(String(angle));
        await expect(depthInput).toHaveValue(String(translateZ));

        await rotationInput.focus();
        await expect(rotationInput).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => (await readHelixGeometry(app, appWorker, helixId)).worker.rotationAngle)
            .toBe(angle + rotation.properties.stepSize);

        const selection = () => appWorker.evaluate(id => Neo.getComponent(id).selectionModel.items[0] ?? null, helixId),
              before    = await selection();

        await helix.focus();
        await expect(helix).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect.poll(selection).not.toBe(before);
        expect(await selection()).not.toBeNull();
        await expect(helix.locator('.neo-helix-item.neo-selected')).toHaveCount(1)
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
