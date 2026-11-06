import {test, expect}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';
import {
    createDedicatedWorkerAppConnection,
    disconnectTestWriter,
    mintTestWriterPair
} from '../../dedicatedWorkerNeuralLink.mjs';

/**
 * E2e: the off-socket `neuralLink` path through a SharedWorker App Worker, on the Workstation.
 *
 * The Workstation runs its App Worker as a SharedWorker, so the fixture reaches it through
 * `attachPageSharedAppWorker`. These arms hold that path to the dedicated path's contracts: the fixture's pair is
 * what writes, an incomplete pair is refused before dispatch, and two pages sharing the one SharedWorker keep their
 * pairs' writes and lifetimes apart. A second handle on the same worker is the spec's own probe of what the
 * Client holds.
 *
 * Off-socket tier only: with `NEO_AGENTOS_RUNTIME_ROOT` set, the fixture is a Bridge connection instead.
 */
const PAGE  = '/apps/workstation/index.html',
      PROBE = {outline: '1px solid transparent'};

/**
 * @summary Counts the write locks the worker's Client holds for one writer pair.
 * @param {Object} handle A `Worker`-shaped handle on the SharedWorker
 * @param {Object} pair   `{agentId, sessionId}`
 * @returns {Promise<Number>}
 */
const locksOf = (handle, pair) => handle.evaluate(({agentId, sessionId}) => globalThis.Neo.ai.Client.writeGuard
    .heldLocks().filter(lock => lock.agentId === agentId && lock.sessionId === sessionId).length, pair);

/**
 * @summary The Workstation viewport's id, read inside the worker.
 * @param {Object} handle
 * @returns {Promise<String>}
 */
const viewportIdOf = handle => handle.evaluate(() => Object.values(globalThis.Neo.apps)[0].mainView.id);

test.describe('Workstation off-socket Neural Link through its SharedWorker App Worker', () => {
    test.skip(Boolean(process.env.NEO_AGENTOS_RUNTIME_ROOT), 'with a Brain checkout the fixture runs over the Bridge');

    test('the fixture pair writes through the page\'s SharedWorker, and an incomplete pair is refused before dispatch', async ({browser, neuralLink, page}) => {
        await page.goto(PAGE);

        const nlApp  = await neuralLink.connectToApp('Workstation'),
              handle = await attachPageSharedAppWorker({browser, page});

        try {
            expect(await handle.evaluate(() => globalThis.Neo.worker.App.isSharedWorker), 'the page runs a SharedWorker App Worker').toBe(true);

            const viewportId = await viewportIdOf(handle);

            await nlApp.setProperties(viewportId, {style: PROBE});
            expect(await locksOf(handle, neuralLink.writerPair), 'the fixture pair holds the write').toBeGreaterThan(0);

            await expect(handle.evaluate(id => globalThis.Neo.ai.Client.handleTestRequest('set_instance_properties',
                {id, properties: {style: {outline: '2px solid red'}}}, {agentId: 'agent-only'}), viewportId))
                .rejects.toThrow('full {agentId, sessionId} writer pair');

            expect(await handle.evaluate(id => globalThis.Neo.getComponent(id).style?.outline, viewportId),
                'the refused write never landed').toBe(PROBE.outline)
        } finally {
            await handle.close()
        }
    });

    test('two pages sharing the SharedWorker keep their pairs\' writes and lifetimes apart', async ({browser, context, neuralLink, page}) => {
        await page.goto(PAGE);

        const nlApp  = await neuralLink.connectToApp('Workstation'),
              second = await context.newPage();

        await second.goto(PAGE);

        const pairA   = neuralLink.writerPair,
              pairB   = mintTestWriterPair(),
              handleA = await attachPageSharedAppWorker({browser, page}),
              handleB = await attachPageSharedAppWorker({browser, page: second});

        try {
            expect(handleB.targetId, 'both pages run on the one SharedWorker').toBe(handleA.targetId);

            const viewportId = await viewportIdOf(handleA),
                  appB       = createDedicatedWorkerAppConnection({
                      getWorker : () => handleB,
                      sessionId : await handleB.evaluate(() => globalThis.Neo.worker.App.id),
                      writerPair: pairB
                  });

            await nlApp.setProperties(viewportId, {style: PROBE});

            await expect(appB.setProperties(viewportId, {style: {outline: '2px solid red'}}),
                'the second page\'s pair is denied the first pair\'s subtree')
                .rejects.toThrow(`conflict (held by ${pairA.agentId} / ${pairA.sessionId})`);

            await disconnectTestWriter(handleB, pairB);
            expect(await locksOf(handleA, pairA), 'ending the second pair releases nothing of the first').toBeGreaterThan(0)
        } finally {
            await disconnectTestWriter(handleB, pairB);
            await handleB.close();
            await handleA.close();
            await second.close()
        }
    })
});
