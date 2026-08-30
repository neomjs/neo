import { test, expect } from '../../fixtures.mjs';

const asArray = value => Array.isArray(value) ? value : value ? [value] : [];
const values  = record => record?.properties || record || {};

/**
 * Whitebox-e2e for the dockZone.v1 semantic-operation surface through the Neural Link service tier:
 * every structural op class executes via `execute_dock_operation` against the LIVE example workspace,
 * and each spec asserts BOTH halves of the holder contract — the returned commit delta
 * (`{applied, document, errors}`) AND an independent `get_dock_topology` read — agree exactly.
 * Agreement is the point: the execute path commits through `onDockZoneDocumentChange` (the same
 * seam `DockSplitter.commitResizeSplit` rides), so a divergent independent read means the commit
 * loop is broken even when the returned document looks right.
 *
 * Structural half of the op-suite ticket only — animation assertions land once the motion-contract
 * disposition settles, and the tour-replay spec waits on the Demo-A tour surface.
 *
 * Seeded workspace (examples/dashboard/dock — `initialDockModel` in the example is the live authority):
 * root edge-zone {center: root-split, right: inspector-tabs}; root-split = horizontal [main-tabs, side-split];
 * side-split = vertical [terminal-tabs{terminal}, logs-tabs{logs}]; inspector-tabs{inspector}. `main-tabs`
 * carries the demo's grown tab catalog (strategy, swarm, metrics, …) and may keep growing — a spec that
 * asserts a post-operation remainder DERIVES it from a pre-operation topology read; a pinned remainder
 * literal goes stale the day the demo gains a pane, while the operations under test stay correct.
 *
 * Run: NEO_E2E_PORT=8093 npx playwright test dashboard/DockOperationsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Dock semantic operations (Neural Link, structural)', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    const tabsNodeHolding = (doc, itemId) =>
        Object.entries(doc?.nodes || {}).find(([, n]) => n.type === 'tabs' && (n.items || []).includes(itemId))?.[0];

    // One boot per test: fresh browser context = fresh localStorage = the pristine seeded document.
    const connect = async (page, neuralLink) => {
        await page.goto('/examples/dashboard/dock/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await page.waitForTimeout(2500); // settle worker boot + first render

        const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
        const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
        const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
        expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

        return { app, holderId };
    };

    // The topology tool may wrap the document — normalize once, assert the shape loudly here so
    // any future envelope drift fails in ONE place instead of five.
    const readTopology = async (app, holderId) => {
        const res = await app.getDockTopology(holderId);
        const doc = res?.document ?? res;

        expect(doc?.schema, 'get_dock_topology must return a dockZone.v1 document').toBe('neo.dock.zone.v1');
        return doc;
    };

    test('read contract: the topology read returns the live committed seeded document', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const topo      = await readTopology(app, holderId);
        const committed = (await app.getComponent(holderId, ['dockModel'])).dockModel;

        expect(topo.root).toBe('root');
        expect(tabsNodeHolding(topo, 'strategy')).toBe('main-tabs');
        expect(tabsNodeHolding(topo, 'inspector')).toBe('inspector-tabs');
        // the read half and the holder's own committed truth are the SAME document
        expect(JSON.stringify(topo)).toBe(JSON.stringify(committed));
    });

    test('a deferred first document cannot poison the SharedWorker mount or later edge resizes', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

        await page.goto('/test/playwright/component/apps/dock-first-mount/');
        await page.waitForSelector('.neo-dock-workspace', {state: 'visible'});

        const
            app     = await neuralLink.connectToApp('Test.Playwright.DockFirstMount'),
            holders = asArray(await app.findInstances(
                {className: 'Test.Playwright.Component.DockFirstMount.Workspace'},
                ['deferredBootFixture', 'id', 'mounted', 'refreshBeforeMount']
            )),
            holderId  = holders[0]?.id,
            shellRoot = page.locator('.neo-dock-workspace .neo-dashboard-dock-edge-zone');

        expect(holderId, 'the deferred dock holder exists in the Shared App Worker').toBeTruthy();
        expect(values(holders[0]).deferredBootFixture, 'the bootstrap-to-real browser fixture loaded').toBe(true);
        expect(values(holders[0]).refreshBeforeMount, 'refresh staging begins only after the host mount').toBe(false);
        expect(await page.evaluate(() => Neo.config.useSharedWorkers)).toBe(true);

        const readTopology = async () => {
            const result = await app.getDockTopology(holderId);

            return result?.document ?? result
        };

        await expect.poll(async () => Object.keys((await readTopology())?.items || {}).length, {
            message: 'the deferred real document becomes committed worker truth',
            timeout: 10000
        }).toBe(5);
        await expect(shellRoot, 'the DOM must contain exactly one projected root shell').toHaveCount(1);

        const directChildren = asArray(await app.findInstances(
                {parentId: holderId},
                ['id', 'dockNodeId', 'dockNodeType', 'mounted']
            )),
            projectionRoots = directChildren.filter(record => values(record).dockNodeType === 'edge-zone'),
            consistency     = await app.verifyComponentConsistency(holderId);

        expect(projectionRoots, 'worker ownership contains one projected root shell').toHaveLength(1);
        expect(consistency.consistent, `workspace items/vdom/DOM: ${JSON.stringify(consistency)}`).toBe(true);

        const readEdgeResizeParticipants = async () => {
            const
                centerRecord    = asArray(await app.queryComponent({dockNodeId: 'root-split'}, ['id', 'mounted']))[0],
                inspectorRecord = asArray(await app.queryComponent({dockNodeId: 'inspector-tabs'}, ['id', 'mounted']))[0],
                splitters       = asArray(await app.findInstances(
                    {className: 'Neo.dashboard.dock.interaction.DockSplitter'},
                    ['id', 'edge', 'edgeZoneId', 'mounted']
                )),
                edgeSplitter    = splitters.find(record => {
                    const data = values(record);

                    return data.edge === 'right' && data.edgeZoneId === 'root'
                }),
                ids = {
                    center   : centerRecord?.id ?? values(centerRecord).id,
                    inspector: inspectorRecord?.id ?? values(inspectorRecord).id,
                    splitter : edgeSplitter?.id ?? values(edgeSplitter).id
                };

            expect(ids, 'all three edge-resize participants exist').toMatchObject({
                center   : expect.any(String),
                inspector: expect.any(String),
                splitter : expect.any(String)
            });

            const [center, splitter, inspector] = await app.getDomRect([
                ids.center,
                ids.splitter,
                ids.inspector
            ]);

            return {center, ids, inspector, splitter}
        };

        const assertVisibleGeometryInsideViewport = async label => {
            const receipt = await page.locator(
                '.neo-dashboard-dock-edge-zone, .neo-dashboard-dock-splitter, [class*="dock-flip-item-"]'
            ).evaluateAll(nodes => ({
                height: innerHeight,
                width : innerWidth,
                rects : nodes.map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
                    .map(({bottom, left, right, top}) => ({bottom, left, right, top}))
            }));

            expect(receipt.rects.length, `${label}: visible dock geometry exists`).toBeGreaterThan(5);
            receipt.rects.forEach(rect => {
                expect(rect.left,   `${label}: left edge`).toBeGreaterThanOrEqual(-1);
                expect(rect.top,    `${label}: top edge`).toBeGreaterThanOrEqual(-1);
                expect(rect.right,  `${label}: right edge`).toBeLessThanOrEqual(receipt.width + 1);
                expect(rect.bottom, `${label}: bottom edge`).toBeLessThanOrEqual(receipt.height + 1)
            })
        };

        await assertVisibleGeometryInsideViewport('first projection');

        const before  = await readEdgeResizeParticipants();
        const resized = await app.executeDockOperation(holderId, {
            operation : 'resizeEdgeZone',
            edgeZoneId: 'root',
            edge      : 'right',
            extent    : 0.33
        });

        expect(resized).toMatchObject({applied: true, errors: []});
        await expect.poll(async () => (await readEdgeResizeParticipants()).inspector.width, {
            message: 'the right band follows the committed edge extent',
            timeout: 10000
        }).toBeGreaterThan(before.inspector.width + 20);

        const after = await readEdgeResizeParticipants();

        expect(after.center.width, 'the center contracts with the larger right band').toBeLessThan(before.center.width);
        expect(after.splitter.x, 'the edge splitter moves with the band').toBeLessThan(before.splitter.x);
        expect(after.inspector.width, 'the right band itself resizes').toBeGreaterThan(before.inspector.width);
        expect((await readTopology()).nodes.root.zones.right.extent).toBe(0.33);
        await expect(shellRoot, 'post-resize DOM still owns one projection shell').toHaveCount(1);
        await assertVisibleGeometryInsideViewport('post-resize projection');

        const postResizeConsistency = await app.verifyComponentConsistency(holderId);

        expect(postResizeConsistency.consistent,
            `post-resize items/vdom/DOM: ${JSON.stringify(postResizeConsistency)}`).toBe(true);
        expect(pageErrors, 'no anonymous promise rejection or page error survives').toEqual([])
    });

    test('close action resolves reordered live identity, retains chrome and restores successor or root focus', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);
        const pageErrors        = [];

        page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

        const seeded = await readTopology(app, holderId);

        const mainRecords = await app.queryComponent({dockNodeId: 'main-tabs'}, ['id', 'ntype']);
        const mainRecord  = Array.isArray(mainRecords) ? mainRecords[0] : mainRecords;
        const mainId      = mainRecord?.id ?? mainRecord?.properties?.id;

        expect(mainId, 'the main projected TabContainer must retain its semantic node id').toBeTruthy();

        await expect.poll(async () => (await app.callMethod(mainId, 'getActionItem', ['close']))?.id, {
            message: 'the opt-in projection materialises one persistent close action',
            timeout: 10000
        }).toBeTruthy();

        const beforeItems = seeded.nodes['main-tabs'].items,
              targetId    = beforeItems[1];

        expect(targetId, 'the seeded main stack must expose a reorder target').toBeTruthy();

        const moved = await app.executeDockOperation(holderId, {
            operation: 'moveItem', itemId: targetId, targetNodeId: 'main-tabs', index: 0
        });

        expect(moved.errors).toEqual([]);
        expect(moved.document.nodes['main-tabs'].items[0]).toBe(targetId);

        const target = await app.findInstances(
            {className: 'Neo.tab.header.Button', dockItemId: targetId},
            ['id', 'dockItemId']
        );
        const targetRecord   = Array.isArray(target) ? target[0] : target,
              targetButtonId = targetRecord?.id ?? targetRecord?.properties?.id;

        expect(targetButtonId, 'the reordered item owns a live tab header').toBeTruthy();
        await page.locator(`#${targetButtonId}`).click();
        await expect.poll(async () => (await app.getComponent(mainId, ['activeIndex'])).activeIndex, {
            message: 'the real tab click activates the reordered live index',
            timeout: 10000
        }).toBe(0);

        const actionBefore = await app.callMethod(mainId, 'getActionItem', ['close']),
              closeButton  = page.locator(`#${actionBefore.id}`),
              successorId  = moved.document.nodes['main-tabs'].items[1];

        await expect(closeButton).toBeVisible({timeout: 10000});
        await closeButton.click();

        await expect.poll(async () => (await readTopology(app, holderId)).items[targetId], {
            message: 'the real header action commits the active reordered item through the model',
            timeout: 10000
        }).toBeUndefined();

        const after       = await readTopology(app, holderId),
              actionAfter = await app.callMethod(mainId, 'getActionItem', ['close']),
              successor   = await app.findInstances(
                  {className: 'Neo.tab.header.Button', dockItemId: successorId},
                  ['id', 'dockItemId']
              ),
              successorRecord = Array.isArray(successor) ? successor[0] : successor,
              successorButtonId = successorRecord?.id ?? successorRecord?.properties?.id;

        expect(after.nodes['main-tabs'].items).toEqual(
            moved.document.nodes['main-tabs'].items.filter(itemId => itemId !== targetId)
        );
        expect(after.nodes['main-tabs'].activeItemId).toBe(successorId);
        expect(after.items[successorId]).toBeTruthy();
        expect(actionAfter.id, 'retained topology keeps the exact action instance').toBe(actionBefore.id);
        expect(successorButtonId, 'the model-selected successor owns a live tab header').toBeTruthy();
        await expect.poll(() => page.evaluate(() => document.activeElement?.id), {
            message: 'focus settles on the successor header after reconciliation',
            timeout: 10000
        }).toBe(successorButtonId);

        const terminalRecords = await app.queryComponent({dockNodeId: 'terminal-tabs'}, ['id', 'ntype']),
              terminalRecord  = Array.isArray(terminalRecords) ? terminalRecords[0] : terminalRecords,
              terminalId      = terminalRecord?.id ?? terminalRecord?.properties?.id,
              terminalAction  = await app.callMethod(terminalId, 'getActionItem', ['close']);

        expect(terminalId, 'the single-item terminal stack must remain projected').toBeTruthy();
        await page.locator(`#${terminalAction.id}`).click();
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['terminal-tabs'], {
            message: 'closing the only item lets normalization prune its tabs node',
            timeout: 10000
        }).toBeUndefined();
        await expect.poll(() => page.evaluate(() => document.activeElement?.id), {
            message: 'the surviving DockWorkspace root receives focus after node pruning',
            timeout: 10000
        }).toBe(holderId);
        expect(pageErrors).toEqual([])
    });

    test('tab-move class: moveItem relocates across tabs nodes; delta and independent read agree', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // derive the expected remainders from the seeded document itself — exact, and growth-proof
        const before         = await readTopology(app, holderId);
        const mainBefore     = before.nodes['main-tabs'].items;
        const terminalBefore = before.nodes['terminal-tabs'].items;

        expect(mainBefore, 'seed: swarm must start in main-tabs').toContain('swarm');

        const result = await app.executeDockOperation(holderId, {
            operation: 'moveItem', itemId: 'swarm', targetNodeId: 'terminal-tabs', index: 1
        });

        const expectedTerminal = [...terminalBefore];
        expectedTerminal.splice(1, 0, 'swarm');

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.document.nodes['terminal-tabs'].items).toEqual(expectedTerminal);
        expect(result.document.nodes['main-tabs'].items).toEqual(mainBefore.filter(id => id !== 'swarm'));

        const topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo), 'independent read must agree with the returned delta').toBe(JSON.stringify(result.document));
        expect(tabsNodeHolding(topo, 'swarm')).toBe('terminal-tabs');
    });

    test('split class: splitNode wraps the item and splits the target; delta and independent read agree', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // derive the expected remainder from the seeded document itself — exact, and growth-proof
        const before     = await readTopology(app, holderId);
        const mainBefore = before.nodes['main-tabs'].items;

        expect(mainBefore, 'seed: swarm must start in main-tabs').toContain('swarm');

        const result = await app.executeDockOperation(holderId, {
            operation: 'splitNode', itemId: 'swarm', targetNodeId: 'terminal-tabs', orientation: 'horizontal', edge: 'right'
        });

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        const topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo)).toBe(JSON.stringify(result.document));

        // swarm left main-tabs and lives in a NEW single-tab node inside a NEW horizontal split
        // whose children are [terminal-tabs, newTabs] (edge 'right' trails)
        expect(topo.nodes['main-tabs'].items).toEqual(mainBefore.filter(id => id !== 'swarm'));

        const swarmTabs = tabsNodeHolding(topo, 'swarm');
        expect(swarmTabs).not.toBe('main-tabs');
        expect(topo.nodes[swarmTabs].items).toEqual(['swarm']);

        const newSplit = Object.values(topo.nodes).find(n =>
            n.type === 'split' && n.orientation === 'horizontal' && (n.children || []).includes(swarmTabs));
        expect(newSplit, 'a new horizontal split must hold the new pane').toBeTruthy();
        expect(newSplit.children).toEqual(['terminal-tabs', swarmTabs]);
    });

    test('resize class: resizeSplit commits new sizes; delta and independent read agree', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const result = await app.executeDockOperation(holderId, {
            operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.5, 0.5]
        });

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.document.nodes['root-split'].sizes).toEqual([0.5, 0.5]);

        const topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo)).toBe(JSON.stringify(result.document));
        expect(topo.nodes['root-split'].sizes).toEqual([0.5, 0.5]);
    });

    test('auto-hide/reveal class: setItemAutoHidden then setItemPinned round-trip, exclusivity held', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const hidden = await app.executeDockOperation(holderId, {
            operation: 'setItemAutoHidden', itemId: 'inspector', autoHidden: true
        });

        expect(hidden.errors).toEqual([]);
        expect(hidden.applied).toBe(true);
        expect(hidden.document.items.inspector.autoHidden).toBe(true);

        let topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo)).toBe(JSON.stringify(hidden.document));

        const pinned = await app.executeDockOperation(holderId, {
            operation: 'setItemPinned', itemId: 'inspector', pinned: true
        });

        expect(pinned.errors).toEqual([]);
        expect(pinned.applied).toBe(true);
        expect(pinned.document.items.inspector.pinned).toBe(true);
        // the model invariant: never pinned AND autoHidden — the pin op owns clearing the flag
        expect(pinned.document.items.inspector.autoHidden).toBeFalsy();

        topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo)).toBe(JSON.stringify(pinned.document));
    });

    test('fail-closed: a two-document op via single-document dispatch reports and commits NOTHING', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const before = await readTopology(app, holderId);
        const result = await app.executeDockOperation(holderId, {
            operation: 'transferItem', itemId: 'strategy'
        });

        expect(result.applied).toBe(false);
        expect(result.errors.join(' ')).toContain('two-document operation');

        const after = await readTopology(app, holderId);
        expect(JSON.stringify(after), 'a failed op must leave the committed document untouched').toBe(JSON.stringify(before));
    });
});
