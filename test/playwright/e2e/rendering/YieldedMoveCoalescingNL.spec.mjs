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
 * @summary Verifies that moving a mounted component across sibling containers via `insert()` while a third
 * sibling's VDOM update is in flight across the worker boundary coalesces subsequent sibling updates into
 * the yielded ancestor's atomic `moveNode` cycle rather than splitting into disjoint `insertNode`/`removeNode` flights.
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
    })
});
