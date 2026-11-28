import {expect, test} from '../../fixtures.mjs';
import {openRawAgent} from '../../util/rawAgent.mjs';

test.use({hasTouch: true});

const targets = {
    subtree: 'gesture-writer-subtree',
    nested : 'gesture-writer-nested',
    owner  : 'gesture-writer-owner',
    sibling: 'gesture-writer-sibling',
    held   : 'gesture-writer-held',
    outside: 'gesture-writer-outside'
};

/**
 * @summary Mounts managed targets through the owning App Worker, without acquiring a Bridge writer lock.
 * @param {import('@playwright/test').Page} page
 */
async function mountReplayTargets(page) {
    const url    = file => new URL(file, page.url()).href,
          source = `
              const {default: Component} = await import(${JSON.stringify(url('/src/component/Base.mjs'))}),
                    {default: Container} = await import(${JSON.stringify(url('/src/container/Base.mjs'))}),
                    targets = ${JSON.stringify(targets)},
                    view = Object.values(Neo.apps).find(app => app.name === 'Neo.examples.button.base').mainView,
                    place = left => ({left: left + 'px', top: '145px', position: 'fixed', zIndex: 10000});

              const subtree = view.add({module: Container, id: targets.subtree, layout: 'fit',
                  height: 120, width: 180, style: place(45)});
              const owner = subtree.add({module: Component, id: targets.owner, vdom: {cn: [
                  {id: targets.nested, text: 'Managed nested node', style: {height: '90px', width: '150px'}}
              ]}});
              const sibling = view.add({module: Component, id: targets.sibling, height: 120, width: 180,
                  style: place(250), text: 'Disjoint sibling'});
              view.add({module: Component, id: targets.held, height: 120, width: 180,
                  style: place(455), text: 'Departure target'});

              if (Neo.getComponent(targets.nested)) throw new Error('Expected a managed node without its own component');
              for (const component of [owner, sibling]) {
                  component.replayDeltas = [];
                  component.domListeners = [{touchmove: data => component.replayDeltas.push(data.deltaX)}]
              }
          `,
          path = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
          reply = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true});
    for (const id of [targets.nested, targets.sibling, targets.held]) {
        await expect(page.locator(`#${id}`)).toBeVisible()
    }
}

/**
 * @summary Records real Main dispatch and completion, and pauses forwarding the actual cancellation on demand.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String>} Owning window id.
 */
async function observeMainReplay(page) {
    return page.evaluate(async outsideId => {
        const {windowId} = Neo.worker.Manager,
              outside    = document.createElement('div'),
              events     = [],
              drives     = [];

        outside.id = outside.dataset.neoId = outsideId;
        outside.textContent = 'Unmanaged DOM node';
        Object.assign(outside.style, {height: '100px', width: '150px', position: 'fixed', left: '45px', top: '290px', zIndex: 10000});
        document.body.append(outside);

        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
            document.addEventListener(type, event => {
                events.push({target: event.target.id, trusted: event.isTrusted, type})
            }, {capture: true, passive: true})
        }

        await Neo.Main.importAddon({name: 'EventSimulator', windowId});

        const simulator = Neo.main.addon.EventSimulator,
              drive     = simulator.driveGesture.bind(simulator),
              cancel    = simulator.cancelGesture?.bind(simulator),
              gate      = Promise.withResolvers(),
              receipt   = {cancelPending: false, drives, events, releaseCancellation: gate.resolve};

        window.gestureWriterReceipt = receipt;
        simulator.driveGesture = async request => {
            const result = await drive(request);

            drives.push({target: request.target, result});
            return result
        };

        if (cancel) {
            simulator.cancelGesture = async request => {
                receipt.cancelPending = true;
                await gate.promise;
                return cancel(request)
            }
        }

        return windowId
    }, targets.outside)
}

test('admits gesture replay to the owning writer and fences transfer until the departing contacts cancel', async ({page, neuralLink}) => {
    expect(neuralLink.bridgePort).toBeTruthy();
    await page.goto('/examples/button/base/index.html');
    await expect(page.locator('.neo-button').first()).toBeVisible({timeout: 30000});

    const app = await neuralLink.connectToApp('Neo.examples.button.base');

    await mountReplayTargets(page);

    const windowId = await observeMainReplay(page),
          main     = () => page.evaluate(() => {
              const {cancelPending, drives, events} = window.gestureWriterReceipt;

              return {cancelPending, drives, events}
          }),
          frames   = [
              {t: 0,  contacts: [{id: 'A', state: 'down', x: 35, y: 40}]},
              {t: 20, contacts: [{id: 'A', state: 'move', x: 50, y: 40}]},
              {t: 40, contacts: [{id: 'A', state: 'up',   x: 50, y: 40}]}
          ],
          replay = async (writer, target, trace = {frames}) => {
              const response = await writer.call(app.sessionId, 'drive_gesture', {provider: 'engine', target, windowId, ...trace});

              expect(response.error).toBeUndefined();
              return response.result
          },
          refusal = code => ({success: false, error: {code}, observed: [], terminal: 'none'}),
          accepted = {success: true, status: 'complete', provider: 'engine', trusted: false, terminal: 'end'};

    let owner, peer;

    try {
        owner = await openRawAgent(neuralLink.bridgePort, 'gesture-replay-owner');
        const acquired = await owner.call(app.sessionId, 'set_instance_properties', {
            id: targets.subtree, properties: {width: 185}
        });

        expect(acquired).toMatchObject({result: {success: true}});

        peer = await openRawAgent(neuralLink.bridgePort, 'gesture-replay-peer');
        expect(await replay(peer, targets.nested)).toMatchObject(refusal('GESTURE_WRITE_DENIED'));
        expect(await replay(peer, targets.outside)).toMatchObject(refusal('GESTURE_TARGET_OWNER_UNAVAILABLE'));
        expect(await main()).toMatchObject({drives: [], events: []});

        expect(await replay(peer, targets.sibling)).toMatchObject(accepted);
        expect(await replay(owner, targets.nested)).toMatchObject(accepted);
        await expect.poll(async () => (await app.getComponent(targets.sibling, ['replayDeltas'])).replayDeltas).toEqual([15]);
        await expect.poll(async () => (await app.getComponent(targets.owner, ['replayDeltas'])).replayDeltas).toEqual([15]);

        const beforeHold = (await main()).events;
        expect(beforeHold).toEqual([targets.sibling, targets.nested].flatMap(target =>
            ['touchstart', 'touchmove', 'touchend'].map(type => ({target, trusted: false, type}))));

        // The departed socket cannot receive a result. The recorded Main result is the cleanup witness.
        const held = owner.call(app.sessionId, 'drive_gesture', {provider: 'engine', target: targets.held, windowId,
            preset: {kind: 'hold', at: {x: 35, y: 40}, durationMs: 15000}});
        void held.catch(() => {});

        const heldStart = {target: targets.held, trusted: false, type: 'touchstart'};
        await expect.poll(async () => (await main()).events).toEqual([...beforeHold, heldStart]);

        // The Bridge broadcasts replies by request id. The two raw sockets have used different
        // request counts by this point, so the in-flight owner and overlapping peer ids differ.
        expect(await replay(peer, targets.held)).toMatchObject(refusal('GESTURE_WRITE_DENIED'));
        owner.close();
        await expect.poll(async () => (await main()).cancelPending).toBe(true);

        expect(await replay(peer, targets.held)).toMatchObject(refusal('GESTURE_WRITE_DENIED'));
        expect((await main()).events).toEqual([...beforeHold, heldStart]);

        await page.evaluate(() => window.gestureWriterReceipt.releaseCancellation());
        await expect.poll(async () => (await main()).drives.at(-1)).toMatchObject({
            target: targets.held,
            result: {success: false, error: {code: 'GESTURE_WRITER_DEPARTED'}, terminal: 'none',
                cleanup: {attempted: true, succeeded: true}}
        });

        await expect.poll(async () => {
            const result = await replay(peer, targets.held);

            if (!result.success) expect(result).toMatchObject(refusal('GESTURE_WRITE_DENIED'));
            return result
        }).toMatchObject(accepted);

        expect((await main()).events.slice(beforeHold.length)).toEqual([
            heldStart,
            ...['touchcancel', 'touchstart', 'touchmove', 'touchend'].map(type => ({target: targets.held, trusted: false, type}))
        ])
    } finally {
        await page.evaluate(() => window.gestureWriterReceipt?.releaseCancellation()).catch(() => {});
        owner?.close();
        peer?.close()
    }
});
