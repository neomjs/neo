import {expect, test} from '@playwright/test';

test.use({hasTouch: true, isMobile: true, viewport: {width: 720, height: 780}});

/**
 * @summary Boots the stock Circle and observes Chromium input and the production gesture wire.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function bootCircle(page) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/examples/component/circle/index.html');

    const circle = page.locator('.neo-circle-component'),
          disc   = circle.locator('.neo-circle'),
          proxy  = page.locator('.neo-dragproxy');

    await expect(disc).toBeVisible();
    await expect(circle.locator('.neo-circle-item')).toHaveCount(12);

    const id     = await circle.getAttribute('id'),
          worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs')),
          cdp    = await page.context().newCDPSession(page);

    await page.evaluate(id => {
        const root    = document.getElementById(id),
              manager = Neo.worker.Manager,
              send    = manager.sendMessage.bind(manager),
              receipt = window.circleGestureReceipt = {wire: [], native: []};

        manager.sendMessage = (destination, message, transfer) => {
            const {action, data, eventName} = message;
            if (destination === 'app' && action === 'domEvent' && eventName?.startsWith('rotate:') &&
                data?.gestureOwner?.componentId === id) {
                const {contacts, gestureId, phase, rotation, trusted} = data;
                receipt.wire.push({contacts, gestureId, phase, rotation, trusted})
            }

            return send(destination, message, transfer)
        };

        for (const type of ['wheel', 'pointerdown', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            window.addEventListener(type, event => {
                if (!event.isTrusted || !root.contains(event.target)) return;

                receipt.native.push({
                    type,
                    ...(event.changedTouches && {changed: Array.from(event.changedTouches, touch => touch.identifier)}),
                    deltaY : event.deltaY,
                    touches: Array.from(event.touches ?? [], touch => touch.identifier)
                })
            }, {capture: true, passive: true})
        }
    }, id);

    const receipt = () => page.evaluate(() => window.circleGestureReceipt),
          readApp = () => worker.evaluate(id => {
              const component = Neo.get(id);
              return {angle: component.rotateZ, index: component.rotationIndex, collapsed: component.collapsed}
          }, id),
          readAngle = () => circle.locator('.neo-circle-center').evaluate(node => {
              const transform = getComputedStyle(node).transform;
              const matrix    = new DOMMatrix(transform === 'none' ? undefined : transform);
              return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
          }),
          send = (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints});

    const expectMotion = async (angle, index) => {
        await expect.poll(async () => {
            const app = await readApp();
            return {angle: Math.round(app.angle), index: app.index, rendered: Math.round(await readAngle())}
        }).toEqual({angle, index, rendered: angle})
    };

    const wheel = async (delta, angle, index) => {
        const previous = (await receipt()).native.filter(event => event.type === 'wheel').length,
              box      = await disc.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, delta);
        await expect.poll(async () => (await receipt()).native.filter(event => event.type === 'wheel').slice(previous))
            .toEqual([{type: 'wheel', deltaY: delta, touches: []}]);
        await expectMotion(angle, index)
    };

    await expectMotion(0, 0);
    await wheel(45, 45, 1);

    return {cdp, circle, errors, expectMotion, proxy, readApp, receipt, send, wheel}
}

/**
 * @summary Places a pair at a bearing around a fixed midpoint in the Circle's clear stage region.
 * @param {Number} x
 * @param {Number} y
 * @param {Number} radius
 * @param {Number[]} ids
 * @returns {Function}
 */
function around(x, y, radius=40, ids=[13, 27]) {
    return degrees => {
        const radians = degrees * Math.PI / 180,
              dx      = Math.round(radius * Math.cos(radians)),
              dy      = Math.round(radius * Math.sin(radians));

        return [{id: ids[0], x: x - dx, y: y - dy}, {id: ids[1], x: x + dx, y: y + dy}]
    }
}

/**
 * @param {import('@playwright/test').Locator} circle
 * @returns {Promise<Function>}
 */
async function circlePair(circle) {
    const box = await circle.boundingBox();

    return around(Math.round(box.x + box.width * .30), Math.round(box.y + box.height * .27))
}

/**
 * @param {Object} fixture
 * @param {Object[]} pair
 * @returns {Promise<Number>}
 */
async function startPair({receipt, send}, pair) {
    await send('touchStart', pair[0]);
    await send('touchStart', ...pair);
    return lastPhase(receipt, 'start', 0)
}

/**
 * @param {Function} receipt
 * @param {String} phase
 * @param {Number} rotation
 * @returns {Promise<Number>}
 */
async function lastPhase(receipt, phase, rotation) {
    let event;
    await expect.poll(async () => {
        event = (await receipt()).wire.at(-1);
        return event && {phase: event.phase, trusted: event.trusted, rotation: Math.round(event.rotation)}
    }).toEqual({phase, trusted: true, rotation});

    return event.gestureId
}

test('real Circle applies signed two-contact turns from its wheel angle and clamps both limits', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});

    const fixture                                                   = await bootCircle(page),
          {cdp, circle, errors, expectMotion, proxy, receipt, send} = fixture;

    try {
        await expect.poll(() => circle.evaluate(node => {
            const stage = node.closest('.neo-example-container').getBoundingClientRect(),
                  disc  = node.querySelector('.neo-circle').getBoundingClientRect();

            return disc.left >= stage.left && disc.right <= stage.right &&
                disc.top >= stage.top && disc.bottom <= stage.bottom
        })).toBe(true);

        const pair  = await circlePair(circle),
              owner = await startPair(fixture, pair(0));

        for (const [rotation, angle, index] of [[30, 75, 2], [-30, 15, 0], [60, 90, 3], [-60, 0, 0]]) {
            await send('touchMove', ...pair(rotation));
            expect(await lastPhase(receipt, 'move', rotation)).toBe(owner);
            await expectMotion(angle, index);
            await expect(proxy).toHaveCount(0)
        }

        await send('touchEnd');
        expect(await lastPhase(receipt, 'end', -60)).toBe(owner);

        const input = await receipt();
        expect(input.native.filter(event => event.type === 'pointerdown')).toHaveLength(2);
        expect(input.native.filter(event => event.type === 'pointercancel')).toHaveLength(0);
        expect(errors).toEqual([])
    } finally {
        await cdp.detach()
    }
});

test('each partial lift preserves Circle motion, and a replacement pair can turn then cancel', async ({page}) => {
    const fixture                                                                   = await bootCircle(page),
          {cdp, circle, errors, expectMotion, proxy, readApp, receipt, send, wheel} = fixture;

    try {
        const pair = await circlePair(circle);

        for (const [trial, lift] of [0, 1].entries()) {
            const start = trial === 0 ? 45 : 75,
                  turn  = trial === 0 ? 75 : 45,
                  index = trial === 0 ? 2 : 1,
                  delta = trial === 0 ? 30 : -30,
                  owner = await startPair(fixture, pair(0)),
                  moved = pair(delta);

            await expectMotion(start, trial === 0 ? 1 : 2);
            await send('touchMove', ...moved);
            expect(await lastPhase(receipt, 'move', delta)).toBe(owner);
            await expectMotion(turn, index);

            await send('touchEnd', moved[lift]);
            expect(await lastPhase(receipt, 'end', delta)).toBe(owner);

            const survivor = {...moved[1 - lift], x: moved[1 - lift].x + 4},
                  terminal = (await receipt()).wire.length;

            await expect.poll(async () => (await receipt()).native.filter(event => event.type === 'touchend').at(-1)?.touches)
                .toEqual([survivor.id]);
            await send('touchMove', survivor);
            await expect.poll(async () => (await receipt()).native.filter(event => event.type === 'touchmove').at(-1)?.touches)
                .toEqual([survivor.id]);
            expect((await receipt()).wire).toHaveLength(terminal);
            await expectMotion(turn, index);

            const newPair  = around(survivor.x - 40, survivor.y, 40, [survivor.id, 71]),
                  next     = trial === 0 ? -30 : 30,
                  contacts = newPair(180);

            expect(await circle.evaluate((node, points) => points.every(({x, y}) =>
                node.contains(document.elementFromPoint(x, y))), contacts)).toBe(true);

            await send('touchStart', ...contacts);
            await expect.poll(async () => (await receipt()).native.filter(event => event.type === 'touchstart').at(-1))
                .toMatchObject({touches: [survivor.id, 71], changed: [71]});

            const replacement = await lastPhase(receipt, 'start', 0);
            expect(replacement).not.toBe(owner);
            await expectMotion(turn, index);

            await send('touchMove', ...newPair(180 + next));
            expect(await lastPhase(receipt, 'move', next)).toBe(replacement);
            await expectMotion(start, trial === 0 ? 1 : 2);

            await send('touchCancel');
            expect(await lastPhase(receipt, 'cancel', next)).toBe(replacement);
            await expectMotion(turn, index);
            await expect(proxy).toHaveCount(0)
        }

        expect((await receipt()).wire.filter(event => event.phase === 'cancel')).toHaveLength(2);
        await wheel(-10, 35, 1);
        await page.getByText('Reset Rotation', {exact: true}).click();
        await expectMotion(0, 0);
        await page.getByText('Collapse', {exact: true}).click();
        await expect.poll(async () => (await readApp()).collapsed).toBe(true);
        await page.getByText('Expand', {exact: true}).click();
        await expect.poll(async () => (await readApp()).collapsed).toBe(false);
        expect(errors).toEqual([])
    } finally {
        await cdp.detach()
    }
});

test('Circle leaves a native scroll and late second contact alone, then turns on a fresh sequence', async ({page}) => {
    const fixture                                                   = await bootCircle(page),
          {cdp, circle, errors, expectMotion, proxy, receipt, send} = fixture;

    try {
        const host = circle.locator('..');

        // Give the stock example's surrounding surface real overflow without overriding Circle's
        // own touch-action policy or adding a JS scroll handler.
        await host.evaluate(node => {
            Object.assign(node.style, {display: 'block', height: '460px', flex: 'none', overflowY: 'auto'});
            const spacer = document.createElement('div');
            Object.assign(spacer.style, {height: '900px', pointerEvents: 'none'});
            node.append(spacer)
        });
        await expect.poll(() => host.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);
        await expect.poll(() => circle.evaluate(node => getComputedStyle(node).touchAction)).toBe('pan-x pan-y');

        const box    = await circle.boundingBox(),
              x      = Math.round(box.x + box.width * .30),
              y      = Math.round(box.y + 285),
              point  = (id, dx, dy) => ({id, x: x + dx, y: y + dy}),
              native = async type => (await receipt()).native.filter(event => event.type === type);

        await send('touchStart', point(13, 0, 0));
        for (let step = 1; step <= 5; step++) {
            await send('touchMove', point(13, 0, -23 * step))
        }

        await expect.poll(() => host.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await expect.poll(async () => (await native('pointercancel')).length).toBeGreaterThan(0);

        const late = point(27, 85, -87);
        expect(await circle.evaluate((node, {x, y}) => node.contains(document.elementFromPoint(x, y)), late)).toBe(true);
        await send('touchStart', point(13, 0, -115), late);
        await expect.poll(async () => (await native('touchstart')).at(-1)).toMatchObject({touches: [13, 27], changed: [27]});
        await send('touchMove', point(13, 0, -145), point(27, 85, -108));
        await expect.poll(async () => (await native('touchmove')).some(event => event.touches.length === 2)).toBe(true);
        await send('touchEnd');
        await expect.poll(async () => (await native('touchend')).at(-1)?.touches).toEqual([]);

        expect((await receipt()).wire).toEqual([]);
        await expectMotion(45, 1);
        await expect(proxy).toHaveCount(0);

        await host.evaluate(node => {node.scrollTop = 0});
        await expect.poll(() => host.evaluate(node => node.scrollTop)).toBe(0);

        const pair  = await circlePair(circle),
              owner = await startPair(fixture, pair(0));

        await send('touchMove', ...pair(30));
        expect(await lastPhase(receipt, 'move', 30)).toBe(owner);
        await expectMotion(75, 2);
        await send('touchEnd');
        expect(await lastPhase(receipt, 'end', 30)).toBe(owner);
        expect((await receipt()).wire.filter(event => event.phase === 'start')).toHaveLength(1);
        await expect(proxy).toHaveCount(0);
        expect(errors).toEqual([])
    } finally {
        await cdp.detach()
    }
});

test('Circle rotation takes over its active item drag and suppresses a competing drag', async ({page}) => {
    const fixture                                                   = await bootCircle(page),
          {cdp, circle, errors, expectMotion, proxy, receipt, send} = fixture;

    const startItemDrag = async () => {
        let item;

        await expect.poll(async () => {
            item = await circle.locator('.neo-circle-item.neo-draggable').evaluateAll(items => {
                for (const candidate of items) {
                    const rect = candidate.getBoundingClientRect(),
                          x    = rect.x + rect.width / 2,
                          y    = rect.y + rect.height / 2;

                    if (document.elementFromPoint(x, y)?.closest('.neo-circle-item') === candidate) {
                        return {x, y}
                    }
                }

                return null
            });

            return Boolean(item)
        }).toBe(true);

        await page.mouse.move(item.x, item.y);
        await page.mouse.down();
        await page.mouse.move(item.x + 48, item.y + 5, {steps: 6})
    };

    await page.getByText('Expand', {exact: true}).click();

    await page.evaluate(() => {
        const addon  = Neo.main.addon.DragDrop,
              cancel = addon.cancelDrag.bind(addon);

        window.circleCancelledDrags = [];
        addon.cancelDrag = data => {
            const result = cancel(data);

            if (data?.gestureId != null) {
                window.circleCancelledDrags.push({gestureId: data.gestureId, result})
            }

            return result
        }
    });

    const readDragId  = () => page.evaluate(() => Neo.main.addon.DragDrop.gestureId),
          readCancels = () => page.evaluate(() => window.circleCancelledDrags);

    try {
        await startItemDrag();
        await expect(proxy).toHaveCount(1);
        await expect.poll(() => circle.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('auto');
        const dragId = await readDragId();

        const pair  = await circlePair(circle),
              owner = await startPair(fixture, pair(0));
        await expect.poll(readCancels).toEqual([{gestureId: dragId, result: true}]);
        await expect(proxy).toHaveCount(0);
        await page.mouse.up();

        await startItemDrag();
        await expect.poll(readDragId).toBeGreaterThan(dragId);
        const nextId = await readDragId();
        await expect.poll(async () => (await readCancels()).map(({gestureId}) => gestureId)).toEqual([dragId, nextId]);
        await expect(proxy).toHaveCount(0);
        await page.mouse.up();

        await send('touchMove', ...pair(30));
        expect(await lastPhase(receipt, 'move', 30)).toBe(owner);
        await expectMotion(75, 2);
        await send('touchEnd');
        expect(await lastPhase(receipt, 'end', 30)).toBe(owner);
        await expect(proxy).toHaveCount(0);
        expect(errors).toEqual([])
    } finally {
        await page.mouse.up();
        await cdp.detach()
    }
});
