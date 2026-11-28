import {expect, test} from '../../fixtures.mjs';

const OWNER   = 'sort-terminal-owner',
      NAMES   = ['alpha', 'beta', 'gamma', 'delta'],
      TARGET  = `${OWNER}-delta`,
      FIXTURE = '/test/playwright/e2e/core/fixtures/SortZoneTerminalContainer.mjs';

/** @summary Opens the existing Engine test host and creates the ordinary configured container through Neural Link. */
async function openFixture(page, neuralLink, useVdomWorker) {
    await neuralLink.routeConfig(page, config => ({...config, useSharedWorkers: false, useVdomWorker, useAiClient: true}));
    await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
    await page.locator('#component-test-viewport').waitFor();
    const app    = await neuralLink.connectToApp('ComponentTestApp'),
          loaded = await page.evaluate(path => Neo.worker.App.loadModule({path}), FIXTURE);
    expect(loaded?.data ?? loaded).toMatchObject({success: true});
    await app.createInstance({className: 'Neo.test.e2e.SortZoneTerminalContainer', parentId: 'component-test-viewport', config: {id: OWNER}});
    await page.locator(`#${TARGET}.neo-draggable`).waitFor();
    await expect(page.locator(`#${OWNER}-alpha`)).not.toHaveClass(/neo-draggable/);
    const workers = page.workers().filter(worker => /\/worker\/App\.mjs(?:\?|$)/.test(worker.url()));
    expect(workers).toHaveLength(1);
    const worker = workers[0];
    expect(await worker.evaluate(() => Neo.config.useVdomWorker)).toBe(useVdomWorker);
    await expect.poll(() => page.workers().some(worker => /\/worker\/VDom\.mjs(?:\?|$)/.test(worker.url()))).toBe(useVdomWorker);
    const journal = await worker.evaluateHandle(id => {
        const owner  = Neo.getComponent(id), originals = owner.items.flatMap(item => [item, ...item.items]), zone = owner.sortZone,
              events = [], start = () => events.push('start'), end = () => events.push('end'), cancel = () => events.push('cancel');
        zone.on('dragStart', start); zone.on('dragEnd', end); zone.on('dragCancel', cancel);
        return {
            read() {
                return {order: owner.items.map(item => item.id), events: [...events],
                    sameComponents: originals.every(item => Neo.getComponent(item.id) === item),
                    zoneClass     : zone.className, zoneId: zone.id, sortable: zone.getSortableItems().map(item => item.id),
                    starting      : zone.dragStartPending, ending: zone.dragEndActive, hasRects: Boolean(zone.itemRects),
                    proxyId       : zone.dragProxy?.id || null, proxyClass: zone.dragProxy?.className || null,
                    placeholder   : zone.dragPlaceholder?.id || null}
            },
            dispose() {zone.un('dragStart', start); zone.un('dragEnd', end); zone.un('dragCancel', cancel)}
        }
    }, OWNER);
    const read = () => journal.evaluate(state => state.read());
    expect((await read()).zoneClass).toBe('Neo.draggable.container.SortZone');
    expect((await read()).sortable).toEqual(NAMES.slice(1).map(name => `${OWNER}-${name}`));
    await page.evaluate(({owner, names}) => names.forEach((name, index) => {
        document.getElementById(`${owner}-${name}-scroll`).scrollTop = [240, 480, 720, 1200][index]
    }), {owner: OWNER, names: NAMES});
    await expect.poll(() => page.locator(`#${TARGET}-scroll`).evaluate(node => node.scrollTop)).toBe(1200);
    return {app, read, dispose: async () => {await journal.evaluate(state => state.dispose()); await journal.dispose()}}
}

/**
 * @summary Records native frames without observing or intercepting individual rendering deltas.
 * @description Rectangles and scroll positions are read only from rAF callbacks or explicit pre/terminal snapshots.
 * There is no applyDeltas/DeltaUpdates hook: a same-task repeated move receives no interposed layout read.
 */
async function watchFrames(page) {
    return page.evaluateHandle(({ownerId, targetId, names}) => {
        const owner         = document.getElementById(ownerId), source = document.getElementById(targetId),
              nodes         = [...owner.querySelectorAll('[id]')], scrollers = names.map(name => document.getElementById(`${ownerId}-${name}-scroll`)),
              initialScroll = scrollers.map(node => node.scrollTop), initialFixedX = document.getElementById(`${ownerId}-alpha`).getBoundingClientRect().x,
              state         = {frames: [], input: null, armed: null, tail: null, resolve: null, handle: null};
        const shown = node => {
            const rect = node.getBoundingClientRect();
            if (!node.isConnected || !rect.width || !rect.height) return false;
            for (let parent = node; parent; parent = parent.parentElement) {
                const style = getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
            }
            return true
        };
        const read = () => {
            const box = source.getBoundingClientRect(), shells = [...document.querySelectorAll('.neo-dragproxy')];
            return {x: box.x, original: document.getElementById(targetId) === source, connected: source.isConnected,
                shown: shown(source), inOwner: source.parentElement === owner,
                // Native offsets are read after the frame's geometry read, never between rendering deltas.
                scroll: scrollers.map(node => node.scrollTop),
                fixedX: document.getElementById(`${ownerId}-alpha`).getBoundingClientRect().x,
                shells: shells.map(node => ({id: node.id, x: node.getBoundingClientRect().x, shown: shown(node), carriesSource: node.contains(source)}))}
        };
        const detach = () => {
            cancelAnimationFrame(state.handle);
            window.removeEventListener('mouseup', terminal, true);
            window.removeEventListener('keydown', terminal, true)
        };
        const frame = at => {
            state.frames.push({at, terminal: Boolean(state.input), settled: state.tail !== null, ...read()});
            if (state.tail !== null && --state.tail === 0) {
                detach(); state.resolve(state.report()); return
            }
            state.handle = requestAnimationFrame(frame)
        };
        const terminal = event => {
            if (!state.armed || state.input || !(state.armed === 'drop' && event.type === 'mouseup' ||
                state.armed === 'escape' && event.type === 'keydown' && event.key === 'Escape')) return;
            state.input = {type: event.type, trusted: event.isTrusted, at: performance.now()}
        };
        state.report = () => ({frames: state.frames, input: state.input, initialScroll, initialFixedX,
            sameNodes: nodes.every(node => document.getElementById(node.id) === node),
            order    : [...owner.children].map(node => node.id), final: read()});
        state.arm = kind => {
            state.armed = kind;
            const pose = read(), carrier = pose.shells.filter(shell => shell.carriesSource);
            if (carrier.length !== 1 || !pose.shown || !carrier[0].shown) throw new Error('live-proxy precondition missing');
            return {sourceX: pose.x, heldX: carrier[0].x}
        };
        state.finish = () => new Promise(resolve => {state.tail = 2; state.resolve = resolve});
        state.stop = () => {detach(); return state.report()};
        window.addEventListener('mouseup', terminal, true);
        window.addEventListener('keydown', terminal, true);
        state.handle = requestAnimationFrame(frame);
        return state
    }, {ownerId: OWNER, targetId: TARGET, names: NAMES})
}

/**
 * @summary Generic live-proxy terminal frames, including native descendant scroll retention.
 * @description The existing Workstation no-flash spec supplies the rAF observation precedent, while the plain
 * container fixture removes dock/application policy. Four cases cover drop/Escape with and without a VDOM worker.
 * The fixture uses documented configuration hooks; drag implementation, transport, delta application and
 * protected drag state remain production-owned.
 */
test.describe('Generic SortZone live-proxy terminal frames', () => {
    test.setTimeout(60000);
    test.use({viewport: {width: 1280, height: 720}});
    for (const useVdomWorker of [true, false]) for (const terminal of ['drop', 'escape']) {
        test(`${terminal}, useVdomWorker=${useVdomWorker}: original subtree stays painted and scrolled`, async ({page, neuralLink}, testInfo) => {
            const runtime       = await openFixture(page, neuralLink, useVdomWorker),
                  before        = await runtime.read(), source = await page.locator(`#${TARGET}`).boundingBox(),
                  destination   = await page.locator(`#${OWNER}-beta`).boundingBox(),
                  fixed         = await page.locator(`#${OWNER}-alpha`).boundingBox(), monitor = await watchFrames(page),
                  finalX        = terminal === 'drop' ? destination.x : source.x,
                  expectedOrder = (terminal === 'drop' ? ['alpha', 'delta', 'beta', 'gamma'] : NAMES).map(name => `${OWNER}-${name}`);
            let held, report, logical, failure, cleanupFailure;
            try {
                expect((await monitor.evaluate(state => state.report())).initialScroll).toEqual([240, 480, 720, 1200]);
                expect(Math.abs(source.x - destination.x)).toBeGreaterThan(100);
                expect(Math.abs(destination.x - fixed.x)).toBeGreaterThan(100);
                await page.mouse.move(source.x + 80, source.y + 14);
                await page.mouse.down();
                await page.mouse.move(source.x + 68, source.y + 14, {steps: 3});
                await expect.poll(async () => {
                    const state = await runtime.read();
                    return !state.starting && state.hasRects && state.proxyClass === 'Neo.draggable.DragProxyContainer'
                }).toBe(true);
                await page.mouse.move(destination.x + 64, source.y + 14, {steps: 20});
                await expect.poll(() => page.locator(`#${OWNER}-beta`).evaluate(node => node.getBoundingClientRect().x))
                    .toBeGreaterThan(destination.x + 100);
                held = await monitor.evaluate((state, kind) => state.arm(kind), terminal);
                expect(Math.abs(held.sourceX - held.heldX)).toBeLessThanOrEqual(0.5);
                expect(Math.abs(held.heldX - source.x)).toBeGreaterThan(100);
                expect(Math.abs(held.heldX - fixed.x)).toBeGreaterThan(100);
                if (terminal === 'escape') await page.keyboard.press('Escape');
                await page.mouse.up();
                await expect.poll(async () => {
                    logical = await runtime.read();
                    return !logical.starting && !logical.ending && !logical.hasRects && !logical.proxyId && !logical.placeholder &&
                        JSON.stringify(logical.order) === JSON.stringify(expectedOrder)
                }).toBe(true);
                await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
                await expect.poll(() => page.locator(`#${TARGET}`).evaluate(node => node.getBoundingClientRect().x))
                    .toBeCloseTo(finalX, 0);
                report = await monitor.evaluate(state => state.finish());
                expect(report.input?.trusted).toBe(true);
                expect(report.sameNodes).toBe(true);
                expect(report.order).toEqual(expectedOrder);
                expect(logical.sameComponents).toBe(true);
                expect(logical.events).toEqual(terminal === 'drop' ? ['start', 'end'] : ['start', 'cancel', 'end']);
                const terminalFrames = report.frames.filter(frame => frame.terminal), settledFrames = terminalFrames.filter(frame => frame.settled);
                expect(terminalFrames.length).toBeGreaterThanOrEqual(2);
                expect(settledFrames).toHaveLength(2);
                for (const frame of terminalFrames) {
                    expect(frame.original && frame.connected && frame.shown, `original at frame ${frame.at}`).toBe(true);
                    expect(Math.min(Math.abs(frame.x - held.heldX), Math.abs(frame.x - finalX)), `terminal x at ${frame.at}`).toBeLessThanOrEqual(0.5);
                    frame.scroll.forEach((offset, index) => expect(offset, `native descendant ${index} at ${frame.at}`).toBeCloseTo(report.initialScroll[index], 0));
                    expect(frame.fixedX).toBeCloseTo(fixed.x, 0);
                    expect(frame.shells.filter(shell => shell.shown && !shell.carriesSource), 'no visible empty proxy').toEqual([])
                }
                for (const frame of settledFrames) {
                    expect(frame.x).toBeCloseTo(finalX, 0);
                    expect(frame.inOwner).toBe(true);
                    expect(frame.shells).toEqual([])
                }
            } catch (error) {
                failure = error;
                throw error
            } finally {
                await page.keyboard.press('Escape').catch(() => {});
                await page.mouse.up().catch(() => {});
                report ??= await monitor.evaluate(state => state.stop());
                await expect.poll(async () => {
                    const state = await runtime.read();
                    return !state.starting && !state.ending && !state.hasRects && !state.proxyId && !state.placeholder
                }, {message: 'the real gesture releases before fixture removal'}).toBe(true).catch(error => {cleanupFailure = error; report.cleanupError = error.message});
                await testInfo.attach('sort-terminal-frames.json', {body: JSON.stringify({useVdomWorker, terminal, before, held, finalX, logical, report}), contentType: 'application/json'});
                await monitor.dispose(); await runtime.dispose();
                await runtime.app.removeComponent(OWNER);
                if (!failure && cleanupFailure) throw cleanupFailure
            }
        })
    }
});
