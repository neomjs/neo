import {expect, test} from '../../fixtures.mjs';

let moduleSequence = 0;

/**
 * @summary Evaluates an ES module inside the page's live App Worker via data URI.
 * @param {import('@playwright/test').Page} page
 * @param {String} source
 * @returns {Promise<void>}
 */
async function runInAppWorker(page, source) {
    const path  = `data:text/javascript;charset=utf-8,${encodeURIComponent(`${source}\n// yielded-move-coalescing-${++moduleSequence}`)}`,
          reply = await page.evaluate(modulePath => Neo.worker.App.loadModule({path: modulePath}), path);

    expect(reply?.data ?? reply).toMatchObject({success: true})
}

/**
 * @summary Verifies that moving a mounted component across sibling containers via `insert()` coalesces with
 * the common ancestor while either a sibling or the moving leaf has an update in flight across the worker
 * boundary. A target's collection timer must preserve that atomic move rather than insert a second live node.
 */
test.describe('Cross-container insert coalescing under yielded ancestor VDOM update', () => {
    test.setTimeout(90000);

    test('moves entry into preceding sibling container with one atomic moveNode and zero coherence findings across 5 worker-roundtrip trials', async ({page, neuralLink}) => {
        const coherenceWarnings = [];

        page.on('console', msg => {
            const text = msg.text();

            if (text.includes('Delta coherence findings')) {
                coherenceWarnings.push(text.slice(0, 500))
            }
        });

        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
        await page.goto('/examples/container/base/index.html');

        const nlApp = await neuralLink.connectToApp('Neo.examples.container.base');

        await expect(page.locator('.neo-button').first()).toBeVisible();

        await page.evaluate(async () => {
            Neo.config.useDeltaCoherenceRegistry = true;
            await Neo.main.DeltaUpdates.importDeltaInstruments();

            Neo.config.logDeltaUpdates      = true;
            window.__yieldedMoveEntryDeltas = [];

            const origLog = console.log.bind(console);

            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    const raw    = args[3],
                          deltas = Array.isArray(raw) ? raw : (raw?.deltas || []);

                    for (const delta of deltas) {
                        const nodeId = delta.id || delta.vnode?.id;

                        if (
                            nodeId === 'yielded-move-entry' ||
                            (typeof delta.outerHTML === 'string' && delta.outerHTML.includes('id="yielded-move-entry"'))
                        ) {
                            window.__yieldedMoveEntryDeltas.push({
                                action  : delta.action,
                                id      : nodeId || 'yielded-move-entry',
                                index   : delta.index,
                                parentId: delta.parentId
                            })
                        }
                    }
                }

                origLog(...args)
            }
        });

        const instrumentReady = await page.evaluate(() => Boolean(Neo.main.DeltaUpdates.coherenceRegistry));
        expect(instrumentReady).toBe(true);

        await runInAppWorker(page, `
            const app  = Object.values(Neo.apps).find(entry => entry.name === 'Neo.examples.container.base'),
                  ns   = Neo.ns('Test.E2E.YieldedMoveCoalescing', true);

            ns.mountTrial = async function() {
                const main = app.mainView,
                      prev = Neo.getComponent('yielded-move-root');

                if (prev) {
                    main.remove(prev, true);
                    await main.promiseUpdate()
                }

                main.add({
                    ntype: 'container',
                    id   : 'yielded-move-root',
                    items: [{
                        ntype: 'container',
                        id   : 'yielded-move-target',
                        items: []
                    }, {
                        ntype: 'container',
                        id   : 'yielded-move-source',
                        items: [{
                            ntype: 'component',
                            id   : 'yielded-move-entry',
                            text : 'Moved entry'
                        }]
                    }, {
                        ntype: 'container',
                        id   : 'yielded-move-inflight',
                        items: [{
                            ntype: 'component',
                            id   : 'yielded-move-busy',
                            text : 'Busy'
                        }]
                    }]
                });

                await main.promiseUpdate()
            };

            ns.runMoveWhileSiblingInFlight = async function() {
                const root     = Neo.getComponent('yielded-move-root'),
                      target   = Neo.getComponent('yielded-move-target'),
                      source   = Neo.getComponent('yielded-move-source'),
                      inflight = Neo.getComponent('yielded-move-inflight'),
                      entry    = Neo.getComponent('yielded-move-entry');

                inflight.cls = ['inflight-active'];
                const pC = inflight.promiseUpdate();

                target.insert(0, entry);

                target.cls = ['target-active'];
                const pB = target.promiseUpdate();

                source.cls = ['source-empty'];
                const pA = source.promiseUpdate();

                await Promise.all([pC, pB, pA, root.promiseUpdate()])
            };
        `);

        for (let trial = 1; trial <= 5; trial++) {
            await runInAppWorker(page, 'await Test.E2E.YieldedMoveCoalescing.mountTrial();');

            await expect(page.locator('#yielded-move-source #yielded-move-entry')).toHaveCount(1);
            await expect(page.locator('#yielded-move-target #yielded-move-entry')).toHaveCount(0);

            await page.evaluate(() => {
                window.__yieldedMoveEntryDeltas.length = 0
            });

            await runInAppWorker(page, 'await Test.E2E.YieldedMoveCoalescing.runMoveWhileSiblingInFlight();');

            const targetCount = await page.locator('#yielded-move-target #yielded-move-entry').count(),
                  sourceCount = await page.locator('#yielded-move-source #yielded-move-entry').count(),
                  entryDeltas = await page.evaluate(() => window.__yieldedMoveEntryDeltas.slice());

            await expect(
                page.locator('#yielded-move-target #yielded-move-entry'),
                `trial ${trial}: moved entry must reside inside #yielded-move-target (target=${targetCount}, source=${sourceCount}, deltas=${JSON.stringify(entryDeltas)}, coherenceWarnings=${JSON.stringify(coherenceWarnings)})`
            ).toHaveCount(1, {timeout: 2000});

            await expect(page.locator('#yielded-move-source #yielded-move-entry')).toHaveCount(0);
            await expect(page.locator('[id="yielded-move-entry"]')).toHaveCount(1);
            await expect(page.locator('#yielded-move-target')).toHaveClass(/target-active/);
            await expect(page.locator('#yielded-move-source')).toHaveClass(/source-empty/);

            expect(coherenceWarnings, `trial ${trial}: zero DeltaCoherenceRegistry findings`).toEqual([]);
            expect(entryDeltas.filter(delta => delta.action === 'moveNode'), `trial ${trial}: atomic moveNode`).toHaveLength(1);
            expect(
                entryDeltas.filter(delta => delta.action === 'insertNode' || delta.action === 'removeNode'),
                `trial ${trial}: no disjoint insertNode/removeNode split`
            ).toEqual([]);

            const targetConsistency = await nlApp.verifyComponentConsistency('yielded-move-target'),
                  sourceConsistency = await nlApp.verifyComponentConsistency('yielded-move-source');

            expect(targetConsistency.consistent, `trial ${trial} target consistency: ${JSON.stringify(targetConsistency)}`).toBe(true);
            expect(sourceConsistency.consistent, `trial ${trial} source consistency: ${JSON.stringify(sourceConsistency)}`).toBe(true)
        }
    });

    for (const withCarrier of [false, true]) {
        test(`keeps ${withCarrier ? 'a merged target scope in a shallow carrier' : 'a direct target update'} inside the common ancestor when the moving leaf has already dispatched`, async ({page, neuralLink}, testInfo) => {
            const coherenceWarnings = [],
                  consoleErrors     = [],
                  rootId            = 'dispatched-move-root',
                  targetId          = 'dispatched-move-target',
                  sourceId          = 'dispatched-move-source',
                  entryId           = 'dispatched-move-entry',
                  carrierId         = withCarrier ? 'dispatched-move-carrier' : null,
                  sourceCarrierId   = withCarrier ? 'dispatched-move-source-carrier' : null,
                  collectorId       = carrierId || targetId;

            page.on('console', message => {
                const text = message.text();

                if (text.includes('Delta coherence findings')) coherenceWarnings.push(text);
                if (message.type() === 'error') consoleErrors.push(text)
            });

            await neuralLink.routeConfig(page, config => ({
                ...config, useAiClient: true, useDeltaCoherenceRegistry: true
            }));
            await page.goto('/examples/container/base/index.html');

            const app = await neuralLink.connectToApp('Neo.examples.container.base');
            await page.evaluate(() => Neo.main.DeltaUpdates.importDeltaInstruments());

            const [main] = await app.queryComponent({className: 'Neo.examples.container.base.MainContainer'}, ['id']);

            const targetConfig = {ntype: 'container', id: targetId, items: []},
                  sourceConfig = {
                    ntype: 'container', id: sourceId,
                    items: [{ntype: 'component', id: entryId, text: 'Moving entry'}]
                  };

            await app.createComponent(main.id, {
                ntype: 'container', id: rootId,
                items: withCarrier ? [
                    {ntype: 'container', id: carrierId, items: [targetConfig]},
                    {ntype: 'container', id: sourceCarrierId, items: [sourceConfig]}
                ] : [targetConfig, sourceConfig]
            });
            await expect(page.locator(`#${sourceId} #${entryId}`)).toHaveCount(1);

            if (withCarrier) {
                // A real completed cycle resets the carrier's own depth to one; no lifecycle state is assigned.
                await app.setProperties(carrierId, {cls: ['primed-carrier']});
                await app.callMethod(carrierId, 'promiseUpdate');
                expect(await app.getComponent(carrierId, ['updateDepth'])).toEqual({updateDepth: 1})
            }

            const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

            await worker.evaluate(({rootId, sourceId, targetId, entryId, carrierId, sourceCarrierId, collectorId}) => {
                const helper   = Neo.vdom.Helper,
                      original = helper.updateBatch,
                      witness  = globalThis.dispatchedMoveWitness = {dispatches: []};

                // Observe actual dispatches and return each native promise untouched.
                helper.updateBatch = function(data) {
                    witness.dispatches.push(Object.keys(data.updates));
                    return original.call(this, data)
                };
                witness.restore = () => {helper.updateBatch = original};
                witness.read = () => {
                    const manager    = Neo.manager.VDomUpdate,
                          components = [rootId, sourceId, targetId, entryId, carrierId, sourceCarrierId].filter(Boolean).map(id => Neo.getComponent(id));

                    return {
                        dispatches        : witness.dispatches,
                        awaitingCollection: manager.awaitingCollectionSet.has(collectorId),
                        idle              : manager.inFlightUpdateMap.size === 0 && manager.awaitingCollectionSet.size === 0 &&
                            manager.preUpdateMap.size === 0 && !manager.postUpdateQueueMap.items?.length &&
                            components.every(component => !component.isVdomUpdating && !component.needsVdomUpdate),
                        components: components.map(component => ({
                            id   : component.id, parentId: component.parentId, mounted: component.mounted,
                            vnode: component.vnode, items: component.items?.map(item => item.id)
                        }))
                    }
                }
            }, {rootId, sourceId, targetId, entryId, carrierId, sourceCarrierId, collectorId});

            await page.evaluate(({sourceId, targetId, entryId}) => {
                const vdomWorker   = Neo.worker.Manager.getWorker('vdom'),
                      original     = vdomWorker.onmessage,
                      originalNode = document.getElementById(entryId),
                      witness      = window.dispatchedMoveWitness = {
                          holding: false, released: false, queue: [], arrivals: [], delivered: [], batches: [], maxNodes: 1
                      };

                // Hold the real leaf reply upstream of Main's renderer and App acknowledgement. Every later
                // message on this VDOM source channel queues behind it; no response may overtake another.
                vdomWorker.onmessage = function(event) {
                    const roots    = Object.keys(event.data.data?.vnodes || {}),
                          sequence = witness.arrivals.length;

                    witness.arrivals.push({sequence, roots});
                    if (!witness.released && roots.includes(entryId)) witness.holding = true;

                    if (witness.holding) {
                        witness.queue.push({receiver: this, event, sequence});
                        return
                    }

                    witness.delivered.push(sequence);
                    return original.call(this, event)
                };
                const listener = Neo.main.DeltaUpdates.on('updated', data => {
                    witness.batches.push(Neo.clone(data, true));
                    witness.maxNodes = Math.max(witness.maxNodes, document.querySelectorAll(`[id="${entryId}"]`).length)
                });

                witness.release = () => {
                    witness.released = true;
                    witness.holding  = false;
                    witness.queue.splice(0).forEach(({receiver, event, sequence}) => {
                        witness.delivered.push(sequence);
                        original.call(receiver, event)
                    })
                };
                witness.read = () => ({
                    arrivals            : witness.arrivals, delivered: witness.delivered, batches: witness.batches, maxNodes: witness.maxNodes,
                    originalNodeInTarget: document.querySelector(`#${targetId} [id="${entryId}"]`) === originalNode,
                    counts              : {
                        all   : document.querySelectorAll(`[id="${entryId}"]`).length,
                        source: document.querySelectorAll(`#${sourceId} [id="${entryId}"]`).length,
                        target: document.querySelectorAll(`#${targetId} [id="${entryId}"]`).length
                    }
                });
                witness.restore = () => {
                    witness.release();
                    vdomWorker.onmessage = original;
                    Neo.main.DeltaUpdates.un('updated', listener)
                }
            }, {sourceId, targetId, entryId});

            try {
                await app.setProperties(entryId, {style: {color: 'red'}});
                await expect.poll(() => page.evaluate(id => window.dispatchedMoveWitness.queue.some(
                    item => Object.hasOwn(item.event.data.data?.vnodes || {}, id)
                ), entryId), {message: 'the moving leaf has a genuine dispatched VDOM response'}).toBe(true);
                expect(await app.getComponent(entryId, ['mounted', 'parentId', 'isVdomUpdating'])).toEqual({
                    mounted: true, parentId: sourceId, isVdomUpdating: true
                });

                const kickoff = await worker.evaluate(({rootId, targetId, entryId, carrierId, collectorId}) => {
                    const target  = Neo.getComponent(targetId),
                          carrier = carrierId && Neo.getComponent(carrierId),
                          manager = Neo.manager.VDomUpdate;

                    // The normal style update starts its collection timer. The public structural move then
                    // queues the full-depth common ancestor while the already-dispatched leaf still owns a flight.
                    if (carrier) {
                        carrier.style = {minHeight: '1px'};
                        carrier.promiseUpdate()
                    }
                    target.style = {backgroundColor: 'rgb(1, 2, 3)'};
                    target.insert(0, Neo.getComponent(entryId));
                    if (carrier) {
                        // Refresh the already-merged target with the full scope public insert() now requires.
                        target.promiseUpdate();
                        Neo.getComponent(rootId).promiseUpdate()
                    }
                    return {
                        awaitingCollection: manager.awaitingCollectionSet.has(collectorId),
                        targetDepth       : target.updateDepth,
                        ...(carrier ? {
                            carrierDepth         : carrier.updateDepth,
                            mergedTargetDepth    : manager.mergedCallbackMap.get(carrierId)?.children.get(targetId)?.childUpdateDepth,
                            effectiveCarrierDepth: manager.getAdjustedUpdateDepth(carrierId)
                        } : {})
                    }
                }, {rootId, targetId, entryId, carrierId, collectorId});

                expect(kickoff, 'public updates establish the required real collection scope').toEqual({
                    awaitingCollection: true, targetDepth: -1,
                    ...(withCarrier ? {carrierDepth: 1, mergedTargetDepth: -1, effectiveCarrierDepth: -1} : {})
                });
                await expect.poll(() => worker.evaluate(() => globalThis.dispatchedMoveWitness.read().awaitingCollection), {
                    message: 'the normal collection timer runs while the leaf response remains held'
                }).toBe(false);

                const beforeRelease = await worker.evaluate(() => globalThis.dispatchedMoveWitness.read());

                if (beforeRelease.dispatches.some(roots => roots.includes(collectorId))) {
                    // A broken target has already escaped the ancestor. Include its actual response in the
                    // FIFO release; a fixed target merges without dispatching, so no absent response is awaited.
                    await expect.poll(() => page.evaluate(id => window.dispatchedMoveWitness.queue.some(
                        item => Object.hasOwn(item.event.data.data?.vnodes || {}, id)
                    ), collectorId)).toBe(true)
                }

                await page.evaluate(() => window.dispatchedMoveWitness.release());
                await expect.poll(() => worker.evaluate(() => globalThis.dispatchedMoveWitness.read().idle), {
                    message: 'the existing real updates settle without requesting a repair render'
                }).toBe(true);

                const native            = await page.evaluate(() => window.dispatchedMoveWitness.read()),
                      settled           = await worker.evaluate(() => globalThis.dispatchedMoveWitness.read()),
                      targetConsistency = await app.verifyComponentConsistency(targetId),
                      sourceConsistency = await app.verifyComponentConsistency(sourceId),
                      deltas            = native.batches.flatMap(batch => [batch.deltas].flat()).filter(delta =>
                          (delta.id || delta.vnode?.id) === entryId && ['insertNode', 'moveNode', 'removeNode'].includes(delta.action)
                      );

                await testInfo.attach('dispatched-move-flight', {
                    body       : JSON.stringify({withCarrier, kickoff, beforeRelease, settled, native, targetConsistency, sourceConsistency, coherenceWarnings, consoleErrors}, null, 2),
                    contentType: 'application/json'
                });
                expect(native.delivered, 'the entire VDOM source stream retains FIFO order').toEqual(native.arrivals.map(item => item.sequence));
                expect(native.counts, 'one live node changes parent after genuine settlement').toEqual({all: 1, source: 0, target: 1});
                expect(native.maxNodes, 'no temporary duplicate node existed').toBe(1);
                expect(native.originalNodeInTarget, 'the target retains the original physical node').toBe(true);
                expect(deltas.map(delta => delta.action), 'the cross-container move remains atomic').toEqual(['moveNode']);
                expect(targetConsistency.consistent, JSON.stringify(targetConsistency)).toBe(true);
                expect(sourceConsistency.consistent, JSON.stringify(sourceConsistency)).toBe(true);
                expect(coherenceWarnings, 'the production observer reports no duplicate insert or unexplained disappearance').toEqual([]);
                expect(consoleErrors).toEqual([])
            } finally {
                await page.evaluate(() => window.dispatchedMoveWitness.restore());
                await worker.evaluate(() => globalThis.dispatchedMoveWitness.restore())
            }
        })
    }
});
