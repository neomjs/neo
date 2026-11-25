import {expect, test}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

/**
 * @summary Whitebox E2E for Demo B's pop-out and hand-closed return on the two-thread line: SharedWorkers and no
 * VDom worker, so the App worker diffs and sends every window's deltas itself.
 *
 * The CounterPane re-renders once a second, so flights run before, across and after both moves. Three things hold:
 * - every flight is sent to the window it was collected in,
 * - the pane's renders land in whichever window hosts it, and resume at home after the return,
 * - once the worker reaps the closed window, no in-flight update state refers to it or to its components.
 *
 * Run: npx playwright test dashboard/DemoBPopOutTwoThreadNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const COUNTER = '.agentos-dockdemo-counter-pane';

/**
 * @summary Counts, in the calling document, each delta batch that renders the CounterPane's tick text. Every
 * window runs its own Main, so a batch counted in a document was applied in that document.
 */
function recordTicks() {
    const ticks = globalThis.__paneTicks = {count: 0};

    Neo.main.DeltaUpdates.on('update', data => {
        [data.deltas].flat().some(delta => /\d+s unbroken/.test(JSON.stringify(delta))) && ticks.count++
    })
}

/**
 * @summary Records, per flight in the App worker, the window its payload was collected in (`windowId` on the
 * batch, which SharedWorkers set at collection) and the window its deltas were sent to. Both wrappers call through.
 * @returns {Boolean}
 */
function recordFlights() {
    const flights     = globalThis.__flights = [],
          collectedIn = new WeakMap(),
          helper      = Neo.vdom.Helper,
          applyDeltas = Neo.applyDeltas,
          updateBatch = helper.updateBatch;

    helper.updateBatch = function(data) {
        const response = updateBatch.call(this, data),
              note     = reply => (reply?.deltas && collectedIn.set(reply.deltas, data.windowId), reply);

        return typeof response?.then === 'function' ? response.then(note) : note(response)
    };

    Neo.applyDeltas = function(windowId, deltas, meta) {
        collectedIn.has(deltas) && flights.push({collected: String(collectedIn.get(deltas)), sentTo: String(windowId)});
        return applyDeltas.call(this, windowId, deltas, meta)
    };

    return true
}

/**
 * @summary Lists the update state that outlives a departed window: in-flight entries whose component is gone or
 * still bound to that window, and components the window owned that are still bound to it.
 * @param {Object}   arg
 * @param {String}   arg.departed  The departed window id
 * @param {String[]} arg.windowIds The departed window's components, read before it closed
 * @returns {String[]} One `'<source>:<id>'` entry per leak
 */
function readDepartedState({departed, windowIds}) {
    const {VDomUpdate} = Neo.manager,
          sources      = {
              awaitingCollection: [...VDomUpdate.awaitingCollectionSet],
              descendantInFlight: [...VDomUpdate.descendantInFlightMap.keys()],
              inFlight          : [...VDomUpdate.inFlightUpdateMap.keys()],
              owned             : windowIds,
              preUpdate         : [...VDomUpdate.preUpdateMap.keys()],
              promiseCallback   : [...VDomUpdate.promiseCallbackMap.keys()],
              watchdog          : [...VDomUpdate.watchdogTimerMap.keys()]
          };

    return Object.entries(sources).flatMap(([source, ids]) => ids
        .filter(id => {
            const component = Neo.getComponent(id),
                  bound     = String(component?.windowId) === departed;

            // An owned component is either reaped or came home; an in-flight entry must not outlive its component
            return source === 'owned' ? bound : !component || bound
        })
        .map(id => `${source}:${id}`))
}

test.describe('Dashboard Demo B — pop-out and return without a VDom worker', () => {
    test.setTimeout(120000);

    /**
     * @param {Object} app Neural Link app wrapper.
     * @returns {Promise<Object[]>} Every live CounterPane, as `{id, mounted, windowId}`.
     */
    async function getCounters(app) {
        const found = await app.findInstances({
            className: 'Neo.examples.dashboard.crossWindow.CounterPane'
        }, ['id', 'mounted', 'windowId']);

        return (Array.isArray(found) ? found : found ? [found] : []).map(counter => ({...counter.properties, id: counter.id}))
    }

    const readTicks = target => target.evaluate(() => globalThis.__paneTicks.count);

    test('flights reach their collecting window, and the closed window leaves no flight state', async ({browser, neuralLink, page}) => {
        // Context-wide, so the popup's own config fetch takes the line as well
        await neuralLink.routeConfig(page.context(), config => ({...config, useVdomWorker: false}));
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator(COUNTER).waitFor({timeout: 30000});

        const worker = await attachPageSharedAppWorker({browser, page});

        expect(worker, 'the page runs a SharedWorker App worker').toBeTruthy();

        try {
            const app          = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
                  workspaces   = await app.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
                  wsId         = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
                  [baseline]   = await getCounters(app),
                  mainWindowId = String(await page.evaluate(() => Neo.worker.Manager.windowId)),
                  where        = async () => (await getCounters(app))
                      .map(counter => `${counter.id}@${String(counter.windowId) === mainWindowId ? 'main' : 'popup'}:${counter.mounted}`)
                      .join(',');

            expect(baseline?.id, 'the worker owns one CounterPane before the pop-out').toBeTruthy();
            expect(await page.evaluate(() => Boolean(Neo.worker.Manager.getWorker('vdom'))), 'no VDom worker in the main window').toBe(false);
            expect(await worker.evaluate(() => Neo.config.useVdomWorker), 'the App worker runs the line').toBe(false);

            await worker.evaluate(recordFlights);
            await page.evaluate(recordTicks);
            await expect.poll(() => readTicks(page), {message: 'the pane renders at home', timeout: 15000}).toBeGreaterThan(0);

            const popupPromise = page.waitForEvent('popup', {timeout: 30000});

            expect(await app.callMethod(wsId, 'popOutPane', ['workbench'])).toEqual({detached: true, errors: []});

            const popup = await popupPromise;

            await expect.poll(where, {message: 'the popup hosts the live pane', timeout: 30000}).toBe(`${baseline.id}@popup:true`);
            await popup.locator(COUNTER).waitFor({timeout: 30000});

            const popupWindowId = String(await popup.evaluate(() => Neo.worker.Manager.windowId));

            expect(await popup.evaluate(() => Boolean(Neo.worker.Manager.getWorker('vdom'))), 'no VDom worker in the popup').toBe(false);

            await popup.evaluate(recordTicks);
            await expect.poll(() => readTicks(popup), {message: 'the pane renders in the popup', timeout: 15000}).toBeGreaterThan(1);

            // A flight collected at home before the move still lands at home; one more render in the popup outlasts it
            const homeWhileAway = await readTicks(page),
                  popupBase     = await readTicks(popup);

            await expect.poll(() => readTicks(popup), {message: 'the popup keeps rendering the pane', timeout: 15000}).toBeGreaterThan(popupBase + 1);
            expect(await readTicks(page), 'no render of the moved pane lands in the window it left').toBe(homeWhileAway);

            const windowIds = await worker.evaluate(id => Neo.manager.Component.find('windowId', Number(id) || id).map(component => component.id), popupWindowId);

            await popup.close();

            await expect.poll(where, {message: 'the same pane comes home', timeout: 30000}).toBe(`${baseline.id}@main:true`);

            const homeAtReturn = await readTicks(page);

            await expect.poll(() => readTicks(page), {message: 'the pane renders at home again', timeout: 15000}).toBeGreaterThan(homeAtReturn + 1);

            // The reap runs a task after the disconnect, so the departed state is polled, never read once
            await expect.poll(() => worker.evaluate(readDepartedState, {departed: popupWindowId, windowIds}), {
                message: 'no flight state outlives the closed window',
                timeout: 15000
            }).toEqual([]);

            const reaped = await worker.evaluate(ids => ids.filter(id => !Neo.getComponent(id)).length, windowIds);

            expect(reaped, 'control: the reap retired components the popup owned').toBeGreaterThan(0);

            const flights   = await worker.evaluate(() => globalThis.__flights),
                  collected = new Set(flights.map(flight => flight.collected));

            expect(collected.has(mainWindowId) && collected.has(popupWindowId), 'control: flights were collected in both windows').toBe(true);
            expect(flights.filter(flight => flight.sentTo !== flight.collected), 'every flight is sent to the window it was collected in').toEqual([])
        } finally {
            await worker.close()
        }
    })
});
