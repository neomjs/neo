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
 * Seeded workspace (examples/dashboard/dock — the example's panes/zones declarations are the authority):
 * root edge-zone {center: root-split, right: inspector's tabs}; root-split = horizontal [main-tabs, side-split];
 * side-split holds the terminal and logs tabs vertically; inspector occupies the right edge. `main-tabs`
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

        expect(doc?.schema, 'get_dock_topology must return a dockZone.v1 document').toBe('neo.dock.zone.v2');
        return doc;
    };

    test('read contract: the topology read returns the live committed seeded document', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const topo      = await readTopology(app, holderId);
        const committed = (await app.getComponent(holderId, ['dockModel'])).dockModel;

        expect(topo.root).toBe('root');
        expect(tabsNodeHolding(topo, 'strategy')).toBe('main-tabs');
        const inspectorNode = tabsNodeHolding(topo, 'inspector');
        expect(inspectorNode, 'inspector occupies a real tabs node').toBeTruthy();
        expect(topo.nodes[topo.root].zones.right.nodeId).toBe(inspectorNode);
        // the read half and the holder's own committed truth are the SAME document
        expect(JSON.stringify(topo)).toBe(JSON.stringify(committed));
    });

    test('the declared default renders four pane groups with the complete title inventory and centered content', async ({page, neuralLink}, testInfo) => {
        const {app, holderId} = await connect(page, neuralLink),
              document        = await readTopology(app, holderId),
              titles          = ['Strategy', 'Swarm', 'Terminal', 'Logs', 'Inspector', 'Metrics', 'Timeline', 'Agents', 'Alerts', 'History'].sort(),
              paneKeys        = ['strategy', 'terminal', 'logs', 'inspector'],
              nodeIds         = paneKeys.map(itemId => tabsNodeHolding(document, itemId));

        expect(Object.values(document.items).map(item => item.title).sort()).toEqual(titles);
        expect(nodeIds.every(Boolean), 'every visible pane belongs to a real tabs node').toBe(true);
        expect(new Set(nodeIds).size).toBe(4);
        expect(Object.values(document.nodes).filter(node => node.type === 'tabs')).toHaveLength(4);
        expect(document.nodes['root-split']).toMatchObject({orientation: 'horizontal', sizes: [0.65, 0.35]});
        expect(document.nodes['side-split']).toMatchObject({orientation: 'vertical', sizes: [0.6, 0.4]});
        expect(document.nodes[document.root].zones.right.nodeId).toBe(tabsNodeHolding(document, 'inspector'));
        await expect(page.locator('.neo-dashboard-dock-tabs')).toHaveCount(4);
        await expect.poll(async () => (await page.locator('.neo-tab-header-button').allTextContents())
            .map(title => title.trim()).sort()).toEqual(titles);

        const boxes = {};
        for (const itemId of paneKeys) {
            const nodeId  = tabsNodeHolding(document, itemId),
                  records = asArray(await app.queryComponent({dockNodeId: nodeId}, ['id'])),
                  tabId   = records[0]?.id ?? values(records[0]).id;
            expect(tabId, `${itemId} has projected tab chrome`).toBeTruthy();
            expect(document.nodes[nodeId].activeItemId).toBe(itemId);
            const tabs = page.locator(`#${tabId}`),
                  card = await app.callMethod(tabId, 'getActiveCard', []);
            expect(card?.id, `${itemId} has a real active component`).toBeTruthy();
            const pane = page.locator(`#${card.id}`);
            await expect(tabs).toBeVisible();
            await expect(pane).toHaveText(document.items[itemId].title);
            await expect(pane).toBeVisible();
            await expect.poll(() => pane.evaluate(element => {
                const style = getComputedStyle(element);
                return {fontSize: style.fontSize, display: style.display, alignItems: style.alignItems, justifyContent: style.justifyContent}
            })).toEqual({fontSize: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center'});
            boxes[itemId] = await tabs.boundingBox();
            expect(boxes[itemId].width).toBeGreaterThan(0);
            expect(boxes[itemId].height).toBeGreaterThan(0)
        }

        expect(boxes.strategy.x + boxes.strategy.width).toBeLessThanOrEqual(boxes.terminal.x + 2);
        expect(boxes.terminal.y + boxes.terminal.height).toBeLessThanOrEqual(boxes.logs.y + 2);
        expect(boxes.terminal.x).toBeCloseTo(boxes.logs.x, 0);
        expect(boxes.terminal.width).toBeCloseTo(boxes.logs.width, 0);
        expect(boxes.terminal.x + boxes.terminal.width).toBeLessThanOrEqual(boxes.inspector.x + 2);
        expect(boxes.strategy.height).toBeGreaterThan(boxes.terminal.height);
        expect(boxes.strategy.y).toBeCloseTo(boxes.inspector.y, 0);
        expect((await app.getComponent(holderId, ['dockModel'])).dockModel).toEqual(document);

        const screenshot = testInfo.outputPath('dock-example-declarative-default.png');
        await page.screenshot({path: screenshot, fullPage: true, animations: 'disabled'});
        await testInfo.attach('dock-example-declarative-default', {path: screenshot, contentType: 'image/png'})
    });

    test('Review and Operator retain toolbar identity, and a saved layout survives restore and page reload', async ({page, neuralLink}) => {
        const {app, holderId} = await connect(page, neuralLink),
              toolbar         = page.locator('.neo-dashboard-dock-perspective-toolbar'),
              storageKey      = 'neo.examples.dashboard.dock.layoutCollection',
              button          = title => toolbar.getByRole('button', {name: title, exact: true}),
              readButtons     = () => toolbar.locator('.neo-button').evaluateAll(nodes =>
                  nodes.map(node => ({id: node.id, text: node.textContent.trim()}))),
              readCollection = async () => (await app.getComponent(holderId, ['layoutCollection'])).layoutCollection,
              readStored = () => page.evaluate(key => {
                  const value = localStorage.getItem(key);
                  return value ? JSON.parse(value) : null
              }, storageKey);

        await expect(button('Operator')).toBeVisible();
        await expect(button('Review')).toBeVisible();
        const initialButtons = await readButtons(), toolbarId = await toolbar.getAttribute('id'),
              retainedNodes  = await Promise.all([toolbar, ...initialButtons.map(entry => page.locator(`#${entry.id}`))]
                  .map(locator => locator.elementHandle()));
        expect(initialButtons.map(entry => entry.text)).toEqual(['Operator', 'Review', 'Save Current', 'Delete Active']);

        await button('Review').click();
        await expect.poll(async () => (await readCollection()).activeLayoutId).toBe('review-focus');
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['root-split'].sizes).toEqual([0.48, 0.52]);
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['main-tabs'].activeItemId).toBe('swarm');
        expect((await readTopology(app, holderId)).nodes['side-split'].sizes).toEqual([0.42, 0.58]);
        await expect(button('Review')).toHaveClass(/neo-dashboard-dock-perspective-active/);
        expect(await readButtons()).toEqual(initialButtons);

        await button('Operator').click();
        await expect.poll(async () => (await readCollection()).activeLayoutId).toBe('operator-default');
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['root-split'].sizes).toEqual([0.65, 0.35]);
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['main-tabs'].activeItemId).toBe('strategy');
        await expect(button('Operator')).toHaveClass(/neo-dashboard-dock-perspective-active/);
        expect(await readButtons()).toEqual(initialButtons);

        // Save a document which visibly differs from the declared Operator default.
        await button('Review').click();
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['main-tabs'].activeItemId).toBe('swarm');
        const savedDocument = await readTopology(app, holderId);
        await button('Save Current').click();
        await expect(button('Saved 1')).toBeVisible();
        const savedId = 'saved-perspective-1';
        await expect.poll(async () => (await readCollection()).activeLayoutId).toBe(savedId);
        await expect.poll(async () => (await readStored())?.activeLayoutId, {
            message: 'the Save Current gesture must reach the actual main-thread storage key'
        }).toBe(savedId);
        const stored = await readStored();
        expect(stored.schema).toBe('neo.dock.layoutCollection.v1');
        expect(stored.layouts[savedId].dockZone).toEqual(savedDocument);
        await expect.poll(async () => (await readButtons()).map(entry => entry.text))
            .toEqual(['Operator', 'Review', 'Saved 1', 'Save Current', 'Delete Active']);
        const buttonsAfterSave = await readButtons();
        for (const entry of initialButtons) {
            expect(buttonsAfterSave.find(current => current.text === entry.text)?.id).toBe(entry.id)
        }
        expect(await toolbar.getAttribute('id')).toBe(toolbarId);
        for (const node of retainedNodes) expect(await node.evaluate(element => element.isConnected)).toBe(true);

        const resized = await app.executeDockOperation(holderId, {
            operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.5, 0.5]
        });
        expect(resized).toMatchObject({applied: true, errors: []});
        await expect.poll(async () => (await readTopology(app, holderId)).nodes['root-split'].sizes).toEqual([0.5, 0.5]);
        expect((await readStored()).layouts[savedId].dockZone).toEqual(savedDocument);
        await button('Saved 1').click();
        await expect.poll(() => readTopology(app, holderId)).toEqual(savedDocument);
        expect(await readButtons()).toEqual(buttonsAfterSave);

        await page.reload();
        await expect(page.locator('.neo-dashboard-dock-tabs')).toHaveCount(4);
        const currentHolderId = await page.locator('.neo-dock-workspace').getAttribute('id'),
              currentApp      = await neuralLink.connectToApp('Neo.examples.dashboard.dock'),
              currentHolders  = asArray(await currentApp.findInstances({className: 'Neo.examples.dashboard.dock.MainContainer'}, ['id']));
        expect(currentHolderId, 'bind the post-reload read to the holder rendered in this page').toBeTruthy();
        expect(currentHolders.map(record => record.id ?? values(record).id)).toContain(currentHolderId);
        await expect.poll(async () => (await currentApp.getComponent(currentHolderId, ['layoutCollection'])).layoutCollection?.activeLayoutId)
            .toBe(savedId);
        await expect.poll(() => readTopology(currentApp, currentHolderId)).toEqual(savedDocument);
        await expect(page.locator('.neo-dashboard-dock-perspective-toolbar').getByRole('button', {name: 'Saved 1', exact: true}))
            .toHaveClass(/neo-dashboard-dock-perspective-active/);
        await expect(page.locator('[class~="dock-flip-item-swarm"]')).toBeVisible()
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

        await expect.poll(async () => (await app.callMethod(mainId, 'getAction', ['close']))?.id, {
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

        const actionBefore = await app.callMethod(mainId, 'getAction', ['close']),
              closeButton  = page.locator(`#${actionBefore.id}`),
              successorId  = moved.document.nodes['main-tabs'].items[1];

        await expect(closeButton).toBeVisible({timeout: 10000});
        await closeButton.click();

        await expect.poll(async () => (await readTopology(app, holderId)).items[targetId], {
            message: 'the real header action commits the active reordered item through the model',
            timeout: 10000
        }).toBeUndefined();

        const after       = await readTopology(app, holderId),
              actionAfter = await app.callMethod(mainId, 'getAction', ['close']),
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

        const terminalNode = tabsNodeHolding(after, 'terminal');
        expect(terminalNode, 'terminal remains in its own tabs node before closing').toBeTruthy();

        const terminalRecords = await app.queryComponent({dockNodeId: terminalNode}, ['id', 'ntype']),
              terminalRecord  = Array.isArray(terminalRecords) ? terminalRecords[0] : terminalRecords,
              terminalId      = terminalRecord?.id ?? terminalRecord?.properties?.id,
              terminalAction  = await app.callMethod(terminalId, 'getAction', ['close']);

        expect(terminalId, 'the single-item terminal stack must remain projected').toBeTruthy();
        await page.locator(`#${terminalAction.id}`).click();
        await expect.poll(async () => (await readTopology(app, holderId)).nodes[terminalNode], {
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
        const before       = await readTopology(app, holderId);
        const mainBefore   = before.nodes['main-tabs'].items;
        const terminalNode = tabsNodeHolding(before, 'terminal');

        expect(terminalNode, 'the target is the existing terminal tabs node').toBeTruthy();
        const terminalBefore = before.nodes[terminalNode].items;

        expect(mainBefore, 'seed: swarm must start in main-tabs').toContain('swarm');

        const result = await app.executeDockOperation(holderId, {
            operation: 'moveItem', itemId: 'swarm', targetNodeId: terminalNode, index: 1
        });

        const expectedTerminal = [...terminalBefore];
        expectedTerminal.splice(1, 0, 'swarm');

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        expect(result.document.nodes[terminalNode].items).toEqual(expectedTerminal);
        expect(result.document.nodes['main-tabs'].items).toEqual(mainBefore.filter(id => id !== 'swarm'));

        const topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo), 'independent read must agree with the returned delta').toBe(JSON.stringify(result.document));
        expect(tabsNodeHolding(topo, 'swarm')).toBe(terminalNode);
    });

    test('split class: splitNode wraps the item and splits the target; delta and independent read agree', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // derive the expected remainder from the seeded document itself — exact, and growth-proof
        const before       = await readTopology(app, holderId);
        const mainBefore   = before.nodes['main-tabs'].items;
        const terminalNode = tabsNodeHolding(before, 'terminal');

        expect(mainBefore, 'seed: swarm must start in main-tabs').toContain('swarm');
        expect(terminalNode, 'the split target is the existing terminal tabs node').toBeTruthy();

        const result = await app.executeDockOperation(holderId, {
            operation: 'splitNode', itemId: 'swarm', targetNodeId: terminalNode, orientation: 'horizontal', edge: 'right'
        });

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        const topo = await readTopology(app, holderId);
        expect(JSON.stringify(topo)).toBe(JSON.stringify(result.document));

        // swarm left main-tabs and lives in a NEW single-tab node inside a NEW horizontal split
        // whose children are [the original terminal node, newTabs] (edge 'right' trails)
        expect(topo.nodes['main-tabs'].items).toEqual(mainBefore.filter(id => id !== 'swarm'));

        const swarmTabs = tabsNodeHolding(topo, 'swarm');
        expect(swarmTabs).not.toBe('main-tabs');
        expect(topo.nodes[swarmTabs].items).toEqual(['swarm']);

        const newSplit = Object.values(topo.nodes).find(n =>
            n.type === 'split' && n.orientation === 'horizontal' && (n.children || []).includes(swarmTabs));
        expect(newSplit, 'a new horizontal split must hold the new pane').toBeTruthy();
        expect(newSplit.children).toEqual([terminalNode, swarmTabs]);
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
