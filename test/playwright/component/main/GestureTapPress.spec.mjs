import {test, expect} from '@playwright/test';

test.use({hasTouch: true});

const targetId = 'gesture-tap-press-target';

/**
 * @summary Mounts an actual Neo component and returns its App receipt and trusted Chromium input driver.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function bootTarget(page, options) {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});
    await expect.poll(() => page.workers().some(worker => worker.url().includes('/worker/App'))).toBe(true);

    const worker = page.workers().find(worker => worker.url().includes('/worker/App'));

    // Observe the actual registration made by domListeners before sending any input.
    await worker.evaluate(() => Neo.currentWorker.getAddon('Gesture', Neo.getComponent('component-test-viewport').windowId).then(() => true));
    await page.evaluate(id => {
        const addon = Neo.main.addon.Gesture, register = addon.register.bind(addon);

        window.gestureSpec = {registered: false, clicks: [], lifts: [], starts: [], drags: [], tapMessages: [], timeline: [], pointer: null};
        addon.register = data => {
            const result = register(data);

            if (data.id === id && result) window.gestureSpec.registered = true;
            return result
        };

        const host = event => document.getElementById(id)?.contains(event.target);

        document.addEventListener('pointerdown', event => {
            if (host(event)) window.gestureSpec.pointer = event
        }, true);
        document.addEventListener('click', event => {
            if (host(event)) window.gestureSpec.clicks.push(event.isTrusted)
        }, true);
        for (const [type, bucket] of [['touchstart', 'starts'], ['touchend', 'lifts']]) {
            document.addEventListener(type, event => {
                if (!host(event)) return;

                const {left, top} = document.getElementById(id).getBoundingClientRect(), point = event.changedTouches[0];

                window.gestureSpec[bucket].push({x: point.clientX - left, y: point.clientY - top, trusted: event.isTrusted})
            }, true);
        }
        window.addEventListener('drag:start', event => {
            const original = event.detail?.originalEvent;

            if (original && host(original)) {
                window.gestureSpec.drags.push({pointerType: original.pointerType, trusted: original.isTrusted});
                window.gestureSpec.timeline.push('drag:start')
            }
        }, true);

        const manager = Neo.worker.Manager, sendMessage = manager.sendMessage.bind(manager);

        manager.sendMessage = (destination, message, transfer) => {
            if (destination === 'app' && message.action === 'domEvent') {
                if (message.eventName === 'tap') window.gestureSpec.tapMessages.push(message.eventName);
                if (message.eventName?.startsWith('press:')) window.gestureSpec.timeline.push(message.eventName)
            }

            return sendMessage(destination, message, transfer)
        }
    }, targetId);

    await worker.evaluate(async ({id, button, draggable, holdMs, tap}) => {
        const {default: Component} = await import(button ? '../button/Base.mjs' : '../component/Base.mjs'),
              viewport             = Neo.getComponent('component-test-viewport'),
              target               = viewport.add({
                  id, module: Component, cls: draggable ? ['neo-draggable'] : [],
                  text : 'Gesture target', flex: 'none', width: 280, height: 120,
                  style: {margin: '24px', touchAction: 'none'}
              }),
              receipt = target.gestureReceipt = {actions: 0, chord: [], double: [], doubleChord: [], presses: [], taps: []},
              listeners = [],
              recordTap = bucket => ({changed, contactCount, contacts, count, trusted, x, y}) => {
                  receipt[bucket].push({changed, contactCount, contacts, count, trusted, x, y})
              },
              recordPress = ({contacts, duration, gestureId, phase, trusted}) => {
                  receipt.presses.push({contacts, duration, gestureId, phase, trusted})
              };

        if (button) target.handler = () => receipt.actions++;

        if (tap) {
            listeners.push(
                {tap: recordTap('taps')},
                {tap: {fn: recordTap('double'), count: 2, contactCount: 1}},
                {tap: {fn: recordTap('chord'), count: 1, contactCount: 2}},
                {tap: {fn: recordTap('doubleChord'), count: 2, contactCount: 2}}
            )
        }

        if (holdMs !== undefined) {
            listeners.push({
                'press:start' : {fn: recordPress, holdMs, moveTolerance: 8},
                'press:end'   : recordPress,
                'press:cancel': recordPress
            })
        }

        target.addDomListeners(listeners)
    }, {id: targetId, ...options});

    const target = page.locator(`#${targetId}`);

    await expect(target).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.gestureSpec.registered)).toBe(true);

    const box = await target.boundingBox(),
          cdp = await page.context().newCDPSession(page);

    return {
        cdp,
        point: (id, dx=0, dy=0) => ({id, x: Math.round(box.x + 80 + dx), y: Math.round(box.y + 60 + dy)}),
        read : () => worker.evaluate(id => Neo.getComponent(id).gestureReceipt, targetId),
        send : (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints}),
        target
    }
}

test('observes a trusted button tap at its lift point and leaves one click for touch and keyboard', async ({page}) => {
    const {cdp, point, read, send, target} = await bootTarget(page, {button: true, tap: true});

    try {
        await send('touchStart', point(17));
        await send('touchMove', point(17, 3, 2));
        await send('touchEnd', point(17, 3, 2));

        await expect.poll(read).toMatchObject({actions: 1, taps: [{contactCount: 1, count: 1, trusted: true, contacts: []}]});
        const {clicks, lifts, starts} = await page.evaluate(() => {
                  const {clicks, lifts, starts} = window.gestureSpec;

                  return {clicks, lifts, starts}
              }),
              [tap] = (await read()).taps;

        expect(clicks).toEqual([true]);
        expect(lifts).toHaveLength(1);
        expect(lifts[0]).toMatchObject({trusted: true});
        expect(lifts[0].x).not.toBeCloseTo(starts[0].x, 4);
        expect(tap.x).toBeCloseTo(lifts[0].x, 4);
        expect(tap.y).toBeCloseTo(lifts[0].y, 4);

        await target.focus();
        await expect(target).toBeFocused();
        await page.keyboard.press('Enter');

        await expect.poll(read).toMatchObject({actions: 2, taps: [tap]});
        expect(await page.evaluate(() => window.gestureSpec.clicks)).toEqual([true, true])
    } finally {
        await cdp.detach()
    }
});

test('publishes each tap immediately and applies exact repeat and chord listener filters', async ({page}) => {
    const {cdp, point, read, send} = await bootTarget(page, {tap: true});

    try {
        await send('touchStart', point(17));
        await send('touchEnd');
        expect(await page.evaluate(() => window.gestureSpec.tapMessages)).toEqual(['tap']);
        await send('touchStart', point(27, 3));
        await send('touchEnd');

        // A far-away tap on the same component begins a new repeat run.
        await send('touchStart', point(37, 70));
        await send('touchEnd');
        await send('touchStart', point(47, 70), point(57, 92));
        await send('touchEnd');
        await send('touchStart', point(67, 72), point(77, 94));
        await send('touchEnd');

        const counts = records => records.map(({contactCount, count, trusted}) => [count, contactCount, trusted]);

        await expect.poll(async () => {
            const {chord, double, doubleChord, taps} = await read();

            return {chord: counts(chord), double: counts(double), doubleChord: counts(doubleChord), taps: counts(taps)}
        }).toEqual({
            chord      : [[1, 2, true]],
            double     : [[2, 1, true]],
            doubleChord: [[2, 2, true]],
            taps       : [[1, 1, true], [2, 1, true], [1, 1, true], [1, 2, true], [2, 2, true]]
        })
    } finally {
        await cdp.detach()
    }
});

test('starts a stationary press, ends it once, and drops holds moved or cancelled before the deadline', async ({page}) => {
    const holdMs                   = 220,
          {cdp, point, read, send} = await bootTarget(page, {holdMs});

    try {
        await send('touchStart', point(17));
        await expect.poll(async () => (await read()).presses).toMatchObject([{phase: 'start', trusted: true}]);
        await send('touchEnd');

        await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(['start', 'end']);
        const [start, end] = (await read()).presses;

        expect(end).toMatchObject({contacts: [], gestureId: start.gestureId, trusted: true});
        expect(end.duration).toBeGreaterThanOrEqual(holdMs);

        await send('touchStart', point(27));
        await send('touchMove', point(27, 32));
        // Keep the moved contact down until the rejected hold would have fired.
        await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), holdMs + 40);
        await send('touchEnd');

        await send('touchStart', point(37));
        await send('touchCancel');
        await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), holdMs + 40);

        expect((await read()).presses).toEqual([start, end])
    } finally {
        await cdp.detach()
    }
});

for (const pressFirst of [false, true]) {
    test(`yields to a trusted stationary drag when ${pressFirst ? 'press' : 'drag'} arms first`, async ({page}) => {
        const holdMs                   = pressFirst ? 80 : 340,
              {cdp, point, read, send} = await bootTarget(page, {draggable: true, holdMs});

        try {
            await page.evaluate(async delay => {
                const sensor = await Neo.main.addon.DragDrop.getPointerSensor();

                sensor.touchDelay = delay
            }, pressFirst ? 300 : 60);

            await send('touchStart', point(17));
            await expect.poll(() => page.evaluate(() => window.gestureSpec.drags)).toEqual([{pointerType: 'touch', trusted: true}]);

            const phases = pressFirst ? ['start', 'cancel'] : [];

            if (!pressFirst) {
                // Leave the competing timer enough time to fail the test if the drag did not clear it.
                await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), holdMs + 40)
            }

            await send('touchEnd');
            await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(phases);
            expect(await page.evaluate(() => window.gestureSpec.timeline)).toEqual(
                pressFirst ? ['press:start', 'drag:start', 'press:cancel'] : ['drag:start']
            )
        } finally {
            await cdp.detach()
        }
    })
}

test('prevents only the matching press context menu during the hold or once after release', async ({page}) => {
    const holdMs              = 250,
          {cdp, read, target} = await bootTarget(page, {holdMs});

    // Matching synthetic pen events exercise synchronous default prevention without invoking
    // browser UI. Trusted touch and drag are exercised separately above.
    const pen = (type, pointerId) => target.evaluate((node, {pointerId, type}) => {
        const {left, top} = node.getBoundingClientRect();

        node.dispatchEvent(new PointerEvent(type, {
            bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
            clientX: left + 20, clientY: top + 20, pointerId, pointerType: 'pen'
        }))
    }, {pointerId, type});

    const contextMenu = (otherTarget=false, pointerType='pen', pointerOffset=0) => page.evaluate(({otherTarget, pointerType, pointerOffset}) => {
        const {pointer}                     = window.gestureSpec,
              destination                   = otherTarget ? document.body : pointer.target,
              {clientX, clientY, pointerId} = pointer,
              event                         = new PointerEvent('contextmenu', {
                  bubbles: true, cancelable: true, composed: true, clientX, clientY, pointerId: pointerId + pointerOffset, pointerType
              });

        destination.dispatchEvent(event);
        return event.defaultPrevented
    }, {otherTarget, pointerType, pointerOffset});

    try {
        await pen('pointerdown', 17);
        expect(await contextMenu()).toBe(false);
        await page.evaluate(ms => new Promise(resolve => setTimeout(resolve, ms)), holdMs + 40);
        await pen('pointerup', 17);
        expect((await read()).presses).toEqual([]);

        await pen('pointerdown', 27);
        await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(['start']);

        expect(await contextMenu()).toBe(true);
        expect(await contextMenu(true)).toBe(false);
        expect(await contextMenu(false, 'mouse')).toBe(false);
        expect(await contextMenu(false, 'pen', 1)).toBe(false);

        await pen('pointerup', 27);
        await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(['start', 'end']);
        expect(await contextMenu()).toBe(false);

        await pen('pointerdown', 37);
        await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(['start', 'end', 'start']);
        await pen('pointerup', 37);

        expect(await contextMenu(true)).toBe(false);
        expect(await contextMenu()).toBe(true);
        expect(await contextMenu()).toBe(false);
        expect(await contextMenu(false, 'pen', 1)).toBe(false);
        await expect.poll(async () => (await read()).presses.map(({phase}) => phase)).toEqual(['start', 'end', 'start', 'end'])
    } finally {
        await cdp.detach()
    }
});
