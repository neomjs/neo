import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A main thread applies only the DOM updates of its own window.
 *
 * A SharedWorker relays a worker-bound reply through any window of its app once the window the reply names has
 * departed (`Neo.worker.Base#sendMessage`), so a vdom reply can reach a sibling window carrying another document's
 * deltas. The unit arms pin the Manager's answer; this arm pins what the user's window keeps: its DOM.
 *
 * It hands the real main thread of a SharedWorker app two relayed `removeNode` replies, one naming another window
 * and one naming this window. They are queued in that order, so once the second has removed its node, the first
 * would have removed its node too.
 */
const
    APP      = '/apps/colors/index.html',
    VIEWPORT = '.neo-viewport';

const hasNode = (page, id) => page.evaluate(nodeId => Boolean(document.getElementById(nodeId)), id);

test.describe('A relayed DOM update for another window', () => {
    test.setTimeout(120000);

    test('leaves this window\'s DOM untouched, while one for this window is applied', async ({page}) => {
        await page.goto(APP);
        await page.locator(VIEWPORT).first().waitFor({state: 'attached', timeout: 60000});

        const shared = await page.evaluate(() => {
            const
                {Manager} = Neo.worker,
                relay     = (id, windowId) => Manager.onWorkerMessage({data: {
                    action     : 'reply',
                    data       : {updateVdom: true, deltas: [{action: 'removeNode', id}]},
                    destination: 'app',
                    replyId    : `relay-${id}`,
                    windowId
                }});

            for (const id of ['foreign-window-node', 'own-window-node']) {
                document.body.append(Object.assign(document.createElement('div'), {id}))
            }

            relay('foreign-window-node', 'a-departed-window');
            relay('own-window-node', Manager.windowId);

            return Neo.config.useSharedWorkers === true
        });

        expect(shared, 'the subject app must run on a SharedWorker').toBe(true);

        await expect.poll(() => hasNode(page, 'own-window-node'), {
            message: 'CONTROL: a delta batch naming this window is applied',
            timeout: 10000
        }).toBe(false);

        expect(await hasNode(page, 'foreign-window-node'), 'a delta batch naming another window does not edit this one').toBe(true)
    })
});
