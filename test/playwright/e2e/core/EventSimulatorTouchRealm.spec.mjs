import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A touch contact belongs to the dispatch node's document (real DOM, two documents).
 *
 * Each window has its own `Touch` constructor and its own ids. This witness dispatches on a node
 * inside a same-origin iframe whose document holds the same id as the outer one. A JSON contact has
 * to name the inner element and be built by the inner window, and a `Touch` the inner window built
 * has to arrive as the same object. The unit realm has one stand-in document and one stand-in
 * constructor, so only a browser tells the two documents apart.
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test EventSimulatorTouchRealm -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Neo.main.addon.EventSimulator: touch contacts across documents', () => {
    test('a contact dispatched on an iframe node is built by that iframe and names its element', async ({page}) => {
        await page.goto('/examples/dashboard/dock/');
        await page.waitForFunction(() => globalThis.Neo?.setupClass, null, {timeout: 30000});

        const report = await page.evaluate(async () => {
            const {default: EventSimulator} = await import('/src/main/addon/EventSimulator.mjs');

            const id    = 'touch-realm-target',
                  frame = document.createElement('iframe'),
                  outer = document.createElement('div');

            // Both Neo id modes: `Neo.config.useDomIds` reads `id`, the default reads `data-neo-id`
            function mark(node) {
                node.id = id;
                node.setAttribute('data-neo-id', id);
                return node
            }

            document.body.append(mark(outer), frame);

            const innerDocument = frame.contentDocument,
                  innerWindow   = frame.contentWindow,
                  inner         = mark(innerDocument.createElement('div')),
                  host          = innerDocument.createElement('div'),
                  received      = [];

            innerDocument.body.append(inner, host);
            host.addEventListener('touchstart', event => received.push(event));

            const json     = EventSimulator.dispatchNative({id: host, options: {touches: [{clientX: 5, clientY: 6, identifier: 7, target: id}]}, type: 'touchstart'}),
                  named    = received[0]?.touches[0],
                  prebuilt = new innerWindow.Touch({clientX: 1, clientY: 2, identifier: 13, target: inner}),
                  native   = EventSimulator.dispatchNative({id: host, options: {touches: [prebuilt]}, type: 'touchstart'}),
                  kept     = received[1]?.touches[0];

            const result = {
                json: {
                    builtByInnerWindow: named instanceof innerWindow.Touch,
                    identifier        : named?.identifier,
                    success           : json.success,
                    target            : named?.target === inner ? 'inner' : named?.target === outer ? 'outer' : 'other'
                },
                native: {
                    identifier: kept?.identifier,
                    sameObject: kept === prebuilt,
                    success   : native.success
                }
            };

            frame.remove();
            outer.remove();

            return result
        });

        expect(report).toEqual({
            json  : {builtByInnerWindow: true, identifier: 7, success: true, target: 'inner'},
            native: {identifier: 13, sameObject: true, success: true}
        })
    })
});

test.describe('Neo.main.addon.EventSimulator: gesture replay timing', () => {
    const holdDuration = 400,
          stallMs      = 180;

    test.beforeEach(async ({page}) => {
        await page.goto('/examples/dashboard/dock/');
        await page.waitForFunction(() => globalThis.Neo?.worker?.Manager?.windowId, null, {timeout: 30000})
    });

    /**
     * @summary Stalls a document capture callback while independently recording the correlated native event times.
     * @param {import('@playwright/test').Page} page
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    function replayHold(page, {previousSequence = false, retry = false, timeoutMs} = {}) {
        return page.evaluate(async ({holdDuration, previousSequence, retry, stallMs, timeoutMs}) => {
            const [{default: EventSimulator}, {normalizeGestureRequest}] = await Promise.all([
                import('/src/main/addon/EventSimulator.mjs'), import('/src/ai/client/gestureTrace.mjs')
            ]);

            const target     = 'touch-timing-target',
                  node       = document.createElement('div'),
                  controller = new AbortController(),
                  delivered  = [],
                  stallAt    = previousSequence ? 2 : 1,
                  frame      = (t, id, state) => ({t, contacts: [{id, state, x: 5, y: 5}]}),
                  drive      = (frames, timeoutMs) => EventSimulator.driveGesture(normalizeGestureRequest({
                      frames, provider: 'engine', target, timeoutMs, windowId: Neo.worker.Manager.windowId
                  }));

            node.id = target;
            node.setAttribute('data-neo-id', target);
            Object.assign(node.style, {height: '40px', width: '40px'});
            document.body.append(node);

            const onTouch = event => {
                if (event.target !== node) return;

                delivered.push({active: Array.from(event.touches, touch => touch.identifier),
                    changed  : Array.from(event.changedTouches, touch => touch.identifier),
                    timeStamp: event.timeStamp, type: event.type});

                if (delivered.length === stallAt) {
                    const releaseAt = performance.now() + stallMs;

                    while (performance.now() < releaseAt) {
                        // A synchronous listener holds the real Main thread until this callback returns.
                    }
                }
            };

            try {
                for (const type of ['touchstart', 'touchend', 'touchcancel']) {
                    document.addEventListener(type, onTouch, {capture: true, passive: true, signal: controller.signal})
                }

                const prior   = previousSequence ? [frame(0, 'prior', 'down'), frame(20, 'prior', 'up')] : [],
                      start   = previousSequence ? 40 : 0,
                      receipt = await drive([...prior, frame(start, 'hold', 'down'), frame(start + holdDuration, 'hold', 'up')], timeoutMs),
                      events  = delivered.slice(),
                      fresh   = retry ? await drive([frame(0, 'fresh', 'down'), frame(20, 'fresh', 'up')]) : null;

                return {events, fresh, freshEvents: delivered.slice(events.length), receipt}
            } finally {
                controller.abort();
                node.remove()
            }
        }, {holdDuration, previousSequence, retry, stallMs, timeoutMs})
    }

    /**
     * @summary Compares the actual hold interval with the corresponding replay receipt.
     * @param {Object} report
     * @returns {Number}
     */
    function assertHoldInterval({events, receipt}) {
        const [down, up]                 = events.slice(-2),
              observed                   = receipt.observed.flatMap(frame => frame.events),
              [recordedDown, recordedUp] = observed.slice(-2),
              deliveredMs                = up.timeStamp - down.timeStamp,
              reportedMs                 = recordedUp.elapsedMs - recordedDown.elapsedMs;

        expect([down.type, up.type]).toEqual(['touchstart', 'touchend']);
        expect(Math.abs(reportedMs - deliveredMs)).toBeLessThan(2);
        expect(deliveredMs).toBeGreaterThanOrEqual(holdDuration - 10);

        return deliveredMs
    }

    test('reports the hold dispatch times when the down callback blocks', async ({page}) => {
        const report = await replayHold(page);

        expect(report.receipt).toMatchObject({success: true, sequences: ['end'], terminal: 'end', trusted: false});
        expect(report.events).toHaveLength(2);
        expect(assertHoldInterval(report)).toBeLessThan(holdDuration + stallMs * 0.75)
    });

    test('preserves the delivered hold when the previous terminal callback blocks', async ({page}) => {
        const report = await replayHold(page, {previousSequence: true});

        expect(report.receipt).toMatchObject({success: true, sequences: ['end', 'end'], terminal: 'end'});
        expect(report.events.map(({type, changed}) => [type, changed])).toEqual([
            ['touchstart', [1]], ['touchend', [1]], ['touchstart', [2]], ['touchend', [2]]
        ]);
        assertHoldInterval(report)
    });

    test('cancels an open hold at the replay deadline and accepts a fresh replay', async ({page}) => {
        const {events, fresh, freshEvents, receipt} = await replayHold(page, {previousSequence: true, retry: true, timeoutMs: 500});

        expect(receipt).toMatchObject({status: 'interrupted', success: false, sequences: ['end', 'none'], terminal: 'none',
            error: {code: 'GESTURE_TIMEOUT'}, cleanup: {attempted: true, succeeded: true}});
        expect(receipt.observed.flatMap(frame => frame.events).map(event => event.type)).toEqual(['touchstart', 'touchend', 'touchstart']);
        expect(events.map(({type, active, changed}) => [type, active, changed])).toEqual([
            ['touchstart', [1], [1]], ['touchend', [], [1]], ['touchstart', [2], [2]], ['touchcancel', [], [2]]
        ]);
        expect(fresh).toMatchObject({success: true, sequences: ['end'], terminal: 'end', cleanup: {attempted: false}});
        expect(freshEvents.map(({type}) => type)).toEqual(['touchstart', 'touchend'])
    })
});
