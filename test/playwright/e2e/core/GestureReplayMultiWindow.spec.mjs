import {expect, readWorkerId, test} from '../../fixtures.mjs';
import {mintTestWriterPair}         from '../../dedicatedWorkerNeuralLink.mjs';
import {attachPageSharedAppWorker}  from '../../sharedWorkerAppWorker.mjs';

test.use({hasTouch: true});

const primaryApp   = 'Neo.examples.stateProvider.multiWindow',
      companionApp = 'Neo.examples.stateProvider.multiWindow2',
      sourceId     = 'gesture-replay-source',
      popupId      = 'gesture-replay-popup',
      contacts     = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

/**
 * @summary Adds a real App component while its Main document separately captures the dispatched events.
 * @param {Object} worker
 * @param {import('@playwright/test').Page} page
 * @param {String} appName
 * @param {String} id
 * @param {Number} left
 * @returns {Promise<Object>}
 */
async function addReplayTarget(worker, page, appName, id, left) {
    const moduleUrl = new URL('/src/component/Base.mjs', page.url()).href;

    await worker.evaluate(async ({appName, id, moduleUrl}) => {
        const {default: Component} = await import(moduleUrl),
              app                  = Object.values(Neo.apps).find(entry => entry.name === appName),
              target               = app.mainView.add({module: Component, id, height: 150, width: 210, text: id});

        target.replayDeltas = [];
        target.domListeners = [{touchmove: event => target.replayDeltas.push(event.deltaX)}]
    }, {appName, id, moduleUrl});

    const locator = page.locator(`#${id}`);
    await expect(locator).toBeVisible();

    return locator.evaluate((node, {left, kinds}) => {
        Object.assign(node.style, {position: 'fixed', top: '160px', left: `${left}px`, zIndex: '10000'});

        window.replayedContacts = [];
        for (const type of kinds) {
            document.addEventListener(type, event => {
                window.replayedContacts.push({
                    type,
                    target : event.target.id,
                    trusted: event.isTrusted,
                    changed: Array.from(event.changedTouches, point => ({x: point.clientX, y: point.clientY, target: point.target.id}))
                })
            }, {capture: true, passive: true})
        }

        const box = node.getBoundingClientRect();
        return {left: box.left, top: box.top, windowId: Neo.worker.Manager.windowId}
    }, {left, kinds: contacts})
}

const point = (id, state, x) => ({id, state, x, y: 38}),
      eight = [
          point('A', 'down', 50), point('B', 'down', 80), point('B', 'up', 80), point('A', 'move', 66),
          point('A', 'cancel', 66), point('C', 'down', 75), point('C', 'move', 103), point('C', 'up', 103)
      ].map((contact, index) => ({t: index * 20, contacts: [contact]}));

test('replays by registered RPC in two owning windows and cancels on replacement or deadline', async ({browser, context, page}) => {
    await context.route('**/neo-config.json*', async route => {
        const response = await route.fetch(),
              config   = await response.json();

        await route.fulfill({response, json: {...config, allowAiClientInTests: true}})
    });

    await page.goto('/examples/stateProvider/multiWindow/index.html');
    const openButton = page.getByRole('button', {name: 'Open second window'});
    await expect(openButton).toBeVisible();

    const [popup] = await Promise.all([context.waitForEvent('page'), openButton.click()]);
    let worker, companionWorker;

    try {
        await expect(popup.getByRole('button', {name: 'Edit user'})).toBeVisible();

        worker          = await attachPageSharedAppWorker({browser, page});
        companionWorker = await attachPageSharedAppWorker({browser, page: popup});

        expect(worker?.targetId).toBeTruthy();
        expect(companionWorker?.targetId).toBe(worker.targetId);

        const source    = await addReplayTarget(worker, page, primaryApp, sourceId, 70),
              companion = await addReplayTarget(worker, popup, companionApp, popupId, 240),
              identity  = mintTestWriterPair(),
              replay    = request => worker.evaluate(async ({request, identity}) => {
                  await Neo.worker.App.aiClientPromise;
                  return Neo.ai.Client.handleTestRequest('drive_gesture', request, identity)
              }, {request, identity}),
              raw        = documentPage => documentPage.evaluate(() => window.replayedContacts),
              trace      = (target, windowId) => ({provider: 'engine', target, windowId, frames: eight});

        expect(companion.windowId).not.toBe(source.windowId);
        expect(companion.left).not.toBe(source.left);

        const [primary, secondary] = await Promise.all([
            replay(trace(sourceId, source.windowId)), replay(trace(popupId, companion.windowId))
        ]);

        for (const [result, documentPage, target, origin] of [[primary, page, sourceId, source], [secondary, popup, popupId, companion]]) {
            expect(result).toMatchObject({provider: 'engine', trusted: false, terminal: 'end', sequences: ['cancel', 'end'], success: true});
            expect(result.observed.map(({active, changed}) => [active.join(''), changed.join('')])).toEqual([
                ['A', 'A'], ['AB', 'B'], ['A', 'B'], ['A', 'A'], ['', 'A'], ['C', 'C'], ['C', 'C'], ['', 'C']
            ]);
            expect(result.observed[3].events[0].changed).toEqual([{id: 'A', clientX: origin.left + 66, clientY: origin.top + 38}]);
            const actual = await raw(documentPage);
            expect(actual).toHaveLength(8);
            expect(actual.every(event => event.target === target && event.trusted === false)).toBe(true);
            expect(actual[3].changed[0]).toEqual({x: origin.left + 66, y: origin.top + 38, target});
            await expect.poll(() => worker.evaluate(id => Neo.getComponent(id).replayDeltas, target)).toEqual([16, 28])
        }

        await expect(replay(trace(sourceId, companion.windowId))).resolves.toMatchObject({
            success: false, error: {code: 'GESTURE_TARGET_UNAVAILABLE'}, observed: []
        });
        expect(await raw(popup)).toHaveLength(8);

        const hold = {provider: 'engine', target: sourceId, windowId: source.windowId,
                      preset: {kind: 'hold', at: {x: 35, y: 40}, durationMs: 1500}};
        const timeout = await replay({...hold, timeoutMs: 100});

        expect(timeout).toMatchObject({success: false, error: {code: 'GESTURE_TIMEOUT'}, terminal: 'none',
            cleanup: {attempted: true, succeeded: true}});
        expect((await raw(page)).slice(-2).map(event => event.type)).toEqual(['touchstart', 'touchcancel']);

        const pending = replay(hold);
        await expect.poll(async () => (await raw(page)).length).toBe(11);
        await page.locator(`#${sourceId}`).evaluate(node => node.replaceWith(node.cloneNode(true)));

        await expect(pending).resolves.toMatchObject({success: false, error: {code: 'GESTURE_TARGET_REMOVED'},
            terminal: 'none', cleanup: {attempted: true, succeeded: true}});

        const cancellation = (await raw(page)).at(-1);
        expect(cancellation.type).toBe('touchcancel');
        expect(cancellation.target).not.toBe(sourceId);
        expect(cancellation.changed[0].target).toBe(sourceId);

        const held = await replay({...hold, preset: {...hold.preset, durationMs: 60}});

        expect(held).toMatchObject({success: true, terminal: 'end'});
        expect(held.observed.map(frame => frame.events[0].type)).toEqual(['touchstart', 'touchend']);
        expect(held.observed[1].events[0].elapsedMs - held.observed[0].events[0].elapsedMs).toBeGreaterThanOrEqual(54);
        expect(await raw(popup)).toHaveLength(8);

        const transform = await replay({provider: 'engine', target: popupId, windowId: companion.windowId, frames: [
            {t: 0, contacts: [{id: 'A', x: 60, y: 70, state: 'down'}, {id: 'B', x: 140, y: 70, state: 'down'}]},
            {t: 35, contacts: [{id: 'A', x: 100, y: 20, state: 'move'}, {id: 'B', x: 100, y: 120, state: 'move'}]},
            {t: 70, contacts: [{id: 'A', x: 100, y: 20, state: 'up'}, {id: 'B', x: 100, y: 120, state: 'up'}]}
        ]});

        expect(transform).toMatchObject({success: true, terminal: 'end'});
        expect(transform.observed[1]).toMatchObject({active: ['A', 'B'], changed: ['A', 'B'], events: [{type: 'touchmove'}]});
        expect((await raw(popup))[9].changed).toEqual([
            {x: companion.left + 100, y: companion.top + 20, target: popupId},
            {x: companion.left + 100, y: companion.top + 120, target: popupId}
        ]);

        const departing = replay({...hold, target: popupId, windowId: companion.windowId});
        await expect.poll(async () => (await raw(popup)).length).toBe(12);

        const retained = replay({...hold, preset: {...hold.preset, durationMs: 120}});
        await Promise.all([popup.waitForEvent('close'), popup.close({runBeforeUnload: true})]);

        const departure = await departing;
        expect(departure).toMatchObject({success: false, terminal: 'none', error: {code: 'GESTURE_WINDOW_DEPARTED'}});
        if (departure.observationAvailable) {
            expect(departure.observed[0].events[0].type).toBe('touchstart')
        } else {
            expect(departure.observed).toEqual([])
        }
        await expect(retained).resolves.toMatchObject({success: true, terminal: 'end'});
        expect((await raw(page)).slice(-2).map(event => event.type)).toEqual(['touchstart', 'touchend'])
    } finally {
        await companionWorker?.close();
        await worker?.close();
        await popup.close().catch(() => {})
    }
});

test('the browser provider follows the requested window of a root-bound fixture', async ({browser, context, neuralLink, page}) => {
    await neuralLink.routeConfig(context, config => ({...config, useAiClient: true}));
    await page.goto('/examples/stateProvider/multiWindow/index.html');

    const openButton = page.getByRole('button', {name: 'Open second window'});
    await expect(openButton).toBeVisible();

    const [popup] = await Promise.all([context.waitForEvent('page'), openButton.click()]);
    let worker;

    try {
        await expect(popup.getByRole('button', {name: 'Edit user'})).toBeVisible();

        const workerId = await readWorkerId(page, 15000);
        expect(workerId).toBeTruthy();
        expect(await readWorkerId(popup, 15000)).toBe(workerId);

        const app = await neuralLink.connectToApp(primaryApp);
        expect(app.sessionId).toBe(workerId);

        worker = await attachPageSharedAppWorker({browser, page});

        const source    = await addReplayTarget(worker, page, primaryApp, sourceId, 70),
              companion = await addReplayTarget(worker, popup, companionApp, popupId, 240),
              raw       = documentPage => documentPage.evaluate(() => window.replayedContacts),
              at        = {x: 50, y: 38},
              request   = {
                  preset  : {kind: 'hold', at, durationMs: 60},
                  provider: 'browser',
                  target  : popupId,
                  windowId: companion.windowId
              };

        expect(companion.windowId).not.toBe(source.windowId);
        await expect(popup.locator(`#${sourceId}`)).toHaveCount(0);

        await popup.evaluate(() => {
            window.holdDeliveryTimes = [];
            window.addEventListener('touchstart', () => {
                const start = performance.now();

                window.holdDeliveryTimes.push(start);
                while (performance.now() - start < 65) {}
            }, {capture: true, once: true});
            window.addEventListener('touchend', () => {
                window.holdDeliveryTimes.push(performance.now())
            }, {capture: true, once: true})
        });

        const receipt = await app.driveGesture(request);
        expect(receipt).toMatchObject({
            provider: 'browser', trusted: true, status: 'complete', success: true, sequences: ['end'], terminal: 'end'
        });
        expect(receipt.observed.map(({active, changed}) => [active, changed])).toEqual([
            [['A'], ['A']], [[], ['A']]
        ]);

        const [downTime, upTime] = await popup.evaluate(() => window.holdDeliveryTimes),
              [down, up]         = receipt.observed.flatMap(({events}) => events),
              actualGap          = upTime - downTime;

        // The 60ms hold follows the blocked callback. Neither the planned trace nor a late capture sees the full gap.
        expect(actualGap).toBeGreaterThanOrEqual(100);
        expect(Math.abs(up.elapsedMs - down.elapsedMs - actualGap)).toBeLessThan(15);

        const popupContacts = await raw(popup);
        expect(popupContacts).toEqual(['touchstart', 'touchend'].map(type => ({
            type,
            target : popupId,
            trusted: true,
            changed: [{x: companion.left + at.x, y: companion.top + at.y, target: popupId}]
        })));
        expect(await raw(page)).toEqual([]);

        await expect(app.driveGesture({...request, target: sourceId})).resolves.toMatchObject({
            provider: 'browser', status: 'unavailable', success: false, error: {code: 'GESTURE_TARGET_UNAVAILABLE'},
            observed: [], terminal: 'none', trusted: null
        });
        expect(await raw(page)).toEqual([]);
        expect(await raw(popup)).toEqual(popupContacts);

        const timeout = await app.driveGesture({
            ...request, preset: {...request.preset, durationMs: 1500}, timeoutMs: 600
        });

        expect(timeout).toMatchObject({status: 'interrupted', error: {code: 'GESTURE_TIMEOUT'},
            terminal: 'none', cleanup: {attempted: true, succeeded: true}});
        expect((await raw(popup)).slice(popupContacts.length).map(event => [event.type, event.trusted])).toEqual([
            ['touchstart', true], ['touchcancel', true]
        ]);
        expect(await raw(page)).toEqual([])
    } finally {
        await worker?.close();
        await popup.close().catch(() => {})
    }
});
