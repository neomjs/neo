import { test, expect } from '../../fixtures.mjs';

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

        expect(doc?.schema, 'get_dock_topology must return a dockZone.v1 document').toBe('neo.harness.dockZone.v1');
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
