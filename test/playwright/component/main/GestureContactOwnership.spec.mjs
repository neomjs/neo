import {test, expect} from '@playwright/test';

test.use({hasTouch: true});

test('the Sparkline example does not load the Gesture addon without a subscriber', async ({page}) => {
    await page.goto('/examples/component/sparkline/index.html');
    await expect(page.locator('.neo-sparkline-wrapper[data-drawn="true"]').first()).toBeVisible();
    expect(await page.evaluate(() => Neo.main.addon?.Gesture)).toBeUndefined()
});

test('adds semantic traffic only for subscribers and preserves raw traffic in every arm', async ({page}) => {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    const worker = page.workers().find(item => item.url().includes('/worker/App'));

    await worker.evaluate(async () => {
        const {default: Component} = await import('../component/Base.mjs'),
              target               = Neo.getComponent('component-test-viewport').add({module: Component, id: 'gesture-traffic-target', text: 'Traffic target'});

        target.receipt = {raw: [], semantic: []};
        target.rawListener = {touchmove: data => target.receipt.raw.push([data.deltaX, data.deltaY])};
        target.gestureListener = {
            'pan:start': data => target.receipt.semantic.push(data.phase),
            'pan:end'  : data => target.receipt.semantic.push(data.phase)
        }
    });

    await page.addStyleTag({content: '#gesture-traffic-target {min-height: 180px; width: 300px; touch-action: none}'});
    const target = page.locator('#gesture-traffic-target');
    await expect(target).toBeVisible();

    await page.evaluate(() => {
        const manager = Neo.worker.Manager, send = manager.sendMessage.bind(manager);

        window.gestureTraffic = [];
        manager.sendMessage = (destination, message, transfer) => {
            if (destination === 'app' && message.action === 'domEvent') {
                window.gestureTraffic.push(message.eventName)
            }

            return send(destination, message, transfer)
        }
    });

    const cdp   = await page.context().newCDPSession(page),
          box   = await target.boundingBox(),
          point = dx => ({id: 17, x: Math.round(box.x + 40 + dx), y: Math.round(box.y + 65)});

    for (const [raw, semantic] of [[false, false], [true, false], [true, true], [false, true]]) {
        await worker.evaluate(({raw, semantic}) => {
            const target = Neo.getComponent('gesture-traffic-target');

            target.receipt.raw.length = target.receipt.semantic.length = 0;
            target.domListeners = [raw && target.rawListener, semantic && target.gestureListener].filter(Boolean)
        }, {raw, semantic});

        if (raw && semantic) {
            await expect.poll(() => page.evaluate(() => typeof Neo.main.addon?.Gesture?.on)).toBe('function');

            await page.evaluate(() => {
                const addon = Neo.main.addon.Gesture;

                addon.on('contact', ({claim, kind}) => {
                    if (kind === 'start' || kind === 'end') {
                        addon.publish(claim, `pan:${kind}`)
                    }
                })
            })
        } else if (!semantic) {
            expect(await page.evaluate(() => Neo.main.addon?.Gesture)).toBeUndefined()
        }

        await page.evaluate(() => {window.gestureTraffic.length = 0});

        for (const [type, touchPoints] of [
            ['touchStart', [point(0)]], ['touchMove', [point(40)]], ['touchMove', [point(85)]], ['touchEnd', []]
        ]) {
            await cdp.send('Input.dispatchTouchEvent', {type, touchPoints})
        }

        await expect.poll(() => worker.evaluate(() => Neo.getComponent('gesture-traffic-target').receipt)).toEqual({
            raw     : raw ? [[40, 0], [45, 0]] : [],
            semantic: semantic ? ['start', 'end'] : []
        });

        const wire = await page.evaluate(() => window.gestureTraffic);

        expect(wire.filter(name => name.startsWith('touch'))).toEqual(['touchstart', 'touchmove', 'touchmove', 'touchend']);
        expect(wire.filter(name => name.startsWith('pan:'))).toEqual(semantic ? ['pan:start', 'pan:end'] : [])
    }

    await cdp.detach()
});

test('preserves native scroll ownership, releases a replaced node, and follows portal delivery', async ({page}) => {
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    const worker = page.workers().find(item => item.url().includes('/worker/App'));

    await worker.evaluate(async () => {
        const [{default: Component}, {default: Container}] = await Promise.all([
                  import('../component/Base.mjs'), import('../container/Base.mjs')
              ]),
              viewport = Neo.getComponent('component-test-viewport'),
              target   = Neo.create(Component, {
                  id  : 'gesture-target',
                  text: 'Gesture target'
              }),
              host = Neo.create(Container, {
                  id   : 'gesture-host',
                  items: [target]
              });

        viewport.add(host);

        for (const component of [target, host]) {
            component.receivedPhases = [];
            component.rawMoves       = [];
            component.addDomListeners([
                {'pan:start': data => component.receivedPhases.push(data.phase)},
                {'pan:end'  : data => component.receivedPhases.push(data.phase)},
                {'pan:cancel': data => component.receivedPhases.push(data.phase)},
                {touchmove  : data => component.rawMoves.push([data.type, data.deltaX, data.deltaY])}
            ])
        }
    });

    const target = page.locator('#gesture-target'),
          host   = page.locator('#gesture-host');

    await expect(target).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof Neo.main.addon?.Gesture?.on)).toBe('function');

    await page.addStyleTag({content: `
        #gesture-host {
            display: block; flex: none; width: 400px; max-height: 460px; overflow-y: auto;
        }
        #gesture-target {
            display: block; flex: none; min-height: 900px; touch-action: pan-y;
        }
    `});

    await page.evaluate(() => {
        const addon = Neo.main.addon.Gesture;

        window.inputReceipt = {frames: [], pointer: [], released: [], wire: []};

        const unregister = addon.unregister.bind(addon);

        addon.unregister = data => {
            const result = unregister(data);

            window.inputReceipt.released.push(data.componentId);
            return result
        };

        ['pointerup', 'pointercancel'].forEach(name => document.addEventListener(name, event => {
            window.inputReceipt.pointer.push(event.type)
        }, {capture: true, passive: true}));

        const manager     = Neo.worker.Manager,
              sendMessage = manager.sendMessage.bind(manager);

        manager.sendMessage = (destination, message, transfer) => {
            if (destination === 'app' && message.action === 'domEvent') {
                window.inputReceipt.wire.push(message.eventName)
            }

            return sendMessage(destination, message, transfer)
        };

        // A minimal observer exercises the phase transport. Recognizer-specific motion is tested at
        // the family layer. This fixture observes the actual Main contact owner and App dispatcher.
        addon.on('contact', ({claim, kind, contacts, changed, trusted}) => {
            window.inputReceipt.frames.push({owner: claim.owner.componentId, kind, contacts, changed, trusted});

            if (kind === 'start' && contacts.length === 1) {
                addon.publish(claim, 'pan:start')
            } else if (kind === 'end' && contacts.length === 0) {
                addon.publish(claim, 'pan:end')
            }
        })
    });

    const cdp    = await page.context().newCDPSession(page),
          box    = await host.boundingBox(),
          x      = Math.round(box.x + 75),
          y      = Math.round(box.y + 300),
          touch  = (id, dx=0, dy=0) => ({id, x: x + dx, y: y + dy}),
          send   = (type, ...touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints}),
          getApp = () => worker.evaluate(() => ({
              target: Neo.getComponent('gesture-target').receivedPhases,
              host  : Neo.getComponent('gesture-host').receivedPhases,
              raw   : Neo.getComponent('gesture-target').rawMoves
          })),
          getInput = () => page.evaluate(() => window.inputReceipt),
          scroll = () => host.evaluate(node => node.scrollTop);

    await expect.poll(() => host.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(200);

    // The default App startup is complete when both component mounts have run. The horizontal
    // check also positively witnesses that the inner registration reached Main.
    await expect.poll(() => worker.evaluate(() => ['gesture-host', 'gesture-target'].every(id =>
        !Object.hasOwn(Neo.manager.DomEvent.mountTimeouts, id)))).toBe(true);

    await send('touchStart', touch(17));
    await send('touchMove', touch(17, 45));
    await send('touchMove', touch(17, 95));
    await send('touchEnd');

    await expect.poll(async () => (await getApp()).target).toEqual(['start', 'end']);
    let input = await getInput();
    expect(input.pointer).toEqual(['pointerup']);
    expect(await scroll()).toBe(0);
    expect(input.frames.every(frame => frame.owner === 'gesture-target' && frame.trusted)).toBe(true);
    expect(input.frames[0]).toMatchObject({kind: 'start', contacts: [{id: 0, x: 75, y: 300}], changed: [0]});
    expect(input.wire.filter(name => name === 'touchmove')).toHaveLength(2);
    expect((await getApp()).host).toEqual(['start', 'end']);
    expect((await getApp()).raw).toEqual([['touchmove', 45, 0], ['touchmove', 50, 0]]);

    const beforeVertical = input.frames.length;

    await send('touchStart', touch(17));

    for (let step = 1; step <= 5; step++) {
        await send('touchMove', touch(17, 0, -23 * step))
    }

    await expect.poll(scroll).toBeGreaterThan(0);
    await expect.poll(async () => (await getApp()).target).toEqual(['start', 'end', 'start', 'cancel']);

    await send('touchStart', touch(17, 0, -115), touch(71, 90, -80));
    await send('touchMove', touch(17, 0, -150), touch(71, 90, -95));
    await send('touchEnd');

    input = await getInput();
    expect(input.pointer).toContain('pointercancel');
    expect(input.frames.slice(beforeVertical).filter(frame => frame.kind === 'start' || frame.kind === 'cancel')
        .map(frame => frame.kind)).toEqual(['start', 'cancel']);
    expect((await getApp()).host).toEqual(['start', 'end', 'start', 'cancel']);

    await host.evaluate(node => {node.scrollTop = 0});
    await send('touchStart', touch(17));
    await expect.poll(async () => (await getApp()).target.at(-1)).toBe('start');

    await target.evaluate(node => node.replaceWith(node.cloneNode(true)));
    await expect.poll(async () => (await getApp()).target.at(-1)).toBe('cancel');
    await send('touchEnd');

    await send('touchStart', touch(17));
    await send('touchEnd');
    await expect.poll(async () => (await getApp()).target).toEqual([
        'start', 'end', 'start', 'cancel', 'start', 'cancel', 'start', 'end'
    ]);
    expect((await getApp()).host).toEqual((await getApp()).target);

    await worker.evaluate(() => {
        const host = Neo.getComponent('gesture-host');

        host.addDomListeners({
            delegate   : '#gesture-target',
            'pan:start': data => host.receivedPhases.push(`portal:${data.gestureOwner.componentId}`)
        })
    });

    await target.evaluate(node => {
        Object.assign(node.style, {position: 'fixed', top: '24px', left: '24px', width: '300px', zIndex: '10000'});
        document.body.append(node)
    });
    expect(await host.evaluate(node => node.contains(document.getElementById('gesture-target')))).toBe(false);
    expect(await worker.evaluate(() => Neo.getComponent('gesture-target').parent.id)).toBe('gesture-host');

    const portalBox   = await target.boundingBox(),
          portalPoint = {id: 17, x: Math.round(portalBox.x + 60), y: Math.round(portalBox.y + 40)};

    expect(await target.evaluate((node, {x, y}) => node.contains(document.elementFromPoint(x, y)), portalPoint)).toBe(true);
    await send('touchStart', portalPoint);
    await send('touchEnd');
    await expect.poll(async () => (await getApp()).target.slice(-2)).toEqual(['start', 'end']);
    await expect.poll(async () => (await getApp()).host.at(-1)).toBe('portal:gesture-target');

    const priorPortalPhases = (await getApp()).host;

    await worker.evaluate(() => {
        const target = Neo.getComponent('gesture-target');

        target.addDomListeners({
            'pan:start': () => {
                target.domListeners = target.domListeners.filter(listener => Object.hasOwn(listener, 'touchmove'))
            }
        })
    });

    await send('touchStart', portalPoint);
    await expect.poll(() => worker.evaluate(() => Neo.getComponent('gesture-target').domListeners.length)).toBe(1);
    await send('touchEnd');
    await expect.poll(async () => (await getInput()).released).toContain('gesture-target');
    expect((await getApp()).host).toEqual(priorPortalPhases);

    const frames = (await getInput()).frames.length;

    await send('touchStart', portalPoint);
    await send('touchMove', {...portalPoint, x: portalPoint.x + 45});
    await send('touchEnd');
    expect((await getInput()).frames).toHaveLength(frames);
    await cdp.detach()
});
