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
