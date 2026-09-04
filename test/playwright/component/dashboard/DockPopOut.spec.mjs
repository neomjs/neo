import {test, expect} from '@playwright/test';

/**
 * The engine-owned dock pop-out action (`Neo.dashboard.dock.Workspace#enableDockPopOutAction`),
 * witnessed on a rendered workspace rather than on projection JSON:
 *
 * - **The frozen family slot, measured as geometry.** `pin → pop-out → maximize → close` in
 *   painted x-order, with pop-out focus-gated like the rest of the engine set and close exempt.
 * - **The click is the drag terminal.** Pressing the button reaches `onDockTearOutExit` then
 *   `onDockTearOutTerminal` — the pointer gesture's own pair — and the committed document shows
 *   `detachItem`'s exact grammar: gone from every node's items, still in the catalog, because the
 *   vessel owns it now and catalog preservation is what stops the leak.
 * - **Geometry the unit layer cannot check.** The vessel request carries the pane's REAL laid-out
 *   box. A unit spec can only assert that some rect was threaded through; only a rendered pane can
 *   prove it is the right one, so this is the arm that would catch measuring the workspace, or the
 *   active tab button, instead of the pane.
 * - **Fail-closed admission.** A declined vessel leaves the document byte-identical and the pane
 *   exactly where it was.
 * - **One retire path.** The item comes home through the engine's own dead-vessel compensation —
 *   the drag path's path — landing back at its captured placement.
 *
 * The second-window half (a real `?popout=` vessel's birth, survival and reap) is the drag gesture's
 * e2e leg in `e2e/dashboard/DemoBDockTearOutNL.spec.mjs`. The click enters that same pair, so it
 * inherits that witness instead of duplicating it; what it cannot inherit is everything between the
 * button and the seam, which is what this file pins.
 */

const WORKSPACE_ID = 'dock-popout-workspace';

const readWorkspace = async (page, keys) => {
    // The main-realm remote answers with the worker-message envelope; the values ride `.data`.
    const reply = await page.evaluate(data => Neo.worker.App.getConfigs(data), {id: WORKSPACE_ID, keys});

    return reply?.data ?? reply
};

const setWorkspace = (page, configs) => page.evaluate(
    data => Neo.worker.App.setConfigs(data),
    {id: WORKSPACE_ID, ...configs}
);

const readDocument = async page => JSON.parse((await readWorkspace(page, ['docJson']))[0]);

const readVesselLog = async page => JSON.parse((await readWorkspace(page, ['vesselLogJson']))[0] ?? '{"closed":[],"opened":[]}');

const tabsNodeWith = (page, tabText) => page.locator('.neo-dashboard-dock-tabs', {
    has: page.locator(`.neo-tab-header-button:has-text("${tabText}")`)
});

const tabButton = (node, text) => node.locator('.neo-tab-header-button', {hasText: text});

const actionButton = (node, glyph) => node.locator(`.neo-tab-header-toolbar .neo-button:has([class*="${glyph}"])`);

/** Every node's item list, flattened — detach's removal is asserted against the whole tree. */
const itemsInNodes = document => Object.values(document.nodes)
    .flatMap(node => node.items || []);

/** Polls until the committed document satisfies `predicate`, then returns it. */
const waitForDocument = async (page, predicate) => {
    let document;

    await expect.poll(async () => {
        document = await readDocument(page);
        return predicate(document)
    }).toBe(true);

    return document
};

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-popout/index.html');
    await page.waitForSelector('#dock-popout-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button', {state: 'visible'})
});

test('the host window is bound into a Group on connect — the identity every pop-out reserves its vessel under', async ({page}) => {
    // A real worker, a real connect: `Neo.manager.Transaction` must have heard it and bound the
    // window as `main` before the first pop-out asks for a reservation. Read through the fixture's
    // mirror, because the manager lives in the App Worker.
    await setWorkspace(page, {readTopologyIdentity: 1});

    let topology;

    await expect.poll(async () => {
        topology = JSON.parse((await readWorkspace(page, ['topologyJson']))[0] ?? 'null');
        return topology?.binding?.workspaceKey ?? null
    }).toBe('main');

    expect(topology.binding).toEqual({generation: 1, groupId: expect.any(String), workspaceKey: 'main'});
    expect(topology.groups, 'one root, one Group').toBe(1)
});

test.describe('dock pop-out — the click is the drag terminal', () => {
    test('pop-out holds the frozen family slot, focus-gated beside an always-visible close', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        // Focus-gated: absent from the DOM entirely until the container holds focus, so a withdrawn
        // action costs no rail space and no consumer rule can give it one. Close's
        // `contextual: false` exemption is the visible contrast — the one action always on offer.
        await expect(actionButton(main, 'fa-window-restore')).toHaveCount(0);
        await expect(actionButton(main, 'fa-times')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        await tabButton(main, 'Alpha').click();
        await expect(actionButton(main, 'fa-window-restore')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        // The frozen ordering contract, measured as painted geometry rather than as array order.
        // Read on the EDGE node, because that is the only one where the whole engine set can
        // render: `pin` hides itself wherever the active item has no owning edge, so on a centre
        // split it is absent by its own policy and an ordering arm there would silently be
        // measuring three buttons while claiming to measure four.
        const edge  = tabsNodeWith(page, 'Pinned'),
              boxes = {};

        await tabButton(edge, 'Pinned').click();

        // Wait for the gate to actually open before measuring. A collapsed action has no box at
        // all, so reading geometry while the reveal is still in flight yields null rather than a
        // stale-but-plausible rect — the race the previous box-preserving contract hid.
        await expect(actionButton(edge, 'fa-thumbtack-slash')).not.toHaveClass(/neo-toolbar-action-context-inactive/);

        for (const [name, glyph] of [
            ['pin',      'fa-thumbtack-slash'],
            ['popOut',   'fa-window-restore'],
            ['maximize', 'fa-window-maximize'],
            ['close',    'fa-times']
        ]) {
            boxes[name] = await actionButton(edge, glyph).boundingBox();
            expect(boxes[name], `${name} must be painted for this arm to mean anything`).toBeTruthy()
        }

        expect(boxes.pin.x).toBeLessThan(boxes.popOut.x);
        expect(boxes.popOut.x).toBeLessThan(boxes.maximize.x);
        expect(boxes.maximize.x).toBeLessThan(boxes.close.x)
    });

    test('pressing pop-out detaches the ACTIVE item through the tear-out pair, at the pane\'s measured rect', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();

        // The pane's real laid-out box, read before the detach re-projects it away.
        const paneBox = await main.boundingBox();

        await actionButton(main, 'fa-window-restore').click();

        // Document truth: absent from every node, present in the catalog. That pair IS detachItem's
        // grammar — an item merely removed from a node would leak, and one merely hidden would still
        // be found in a node's items.
        const document = await waitForDocument(page, doc => !itemsInNodes(doc).includes('alpha'));

        expect(document.items.alpha).toBeTruthy();
        expect(itemsInNodes(document)).toContain('beta');

        // The host seam saw exactly one request, for the active item, carrying the PANE's box —
        // not the workspace's, and not the tab button's.
        const {opened} = await readVesselLog(page);

        expect(opened).toHaveLength(1);
        expect(opened[0].itemId).toBe('alpha');

        // `sortZone: null` is the click's signature: the gesture supplies a live zone, a click has
        // none, and the seam already accepts the difference.
        expect(opened[0].sortZone).toBeNull();

        const rect = opened[0].proxyRect;

        expect(rect, 'the vessel request must carry a measured rect').toBeTruthy();
        expect(Math.abs(rect.x      - paneBox.x)).toBeLessThan(2);
        expect(Math.abs(rect.y      - paneBox.y)).toBeLessThan(2);
        expect(Math.abs(rect.width  - paneBox.width)).toBeLessThan(2);
        expect(Math.abs(rect.height - paneBox.height)).toBeLessThan(2);

        // The measurement is of the pane, so it must NOT be the whole workspace. Without this the
        // arm above would still pass on a fixture whose pane happens to fill the viewport.
        const workspaceBox = await page.locator('#dock-popout-workspace').boundingBox();

        expect(rect.width).toBeLessThan(workspaceBox.width - 1)
    });

    test('a declined vessel commits NOTHING and leaves the pane docked', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();

        const before = await readWorkspace(page, ['docJson']);

        await setWorkspace(page, {refuseVessel: true});
        await actionButton(main, 'fa-window-restore').click();

        // The seam was reached and said no...
        await expect.poll(async () => (await readVesselLog(page)).opened.length).toBe(1);

        // ...and the terminal was never reached: byte-identical document, pane still rendered.
        expect(await readWorkspace(page, ['docJson'])).toEqual(before);
        await expect(page.locator('#dock-popout-pane-alpha')).toHaveCount(1);
        await expect(tabButton(main, 'Alpha')).toBeVisible()
    });

    test('a node whose header a click cannot reach routes the SAME intent through the same entry', async ({page}) => {
        // The fixture rails `railed` on the edge, so it is not a header tab and no click can make
        // it the active item — the rail is a separate affordance. What can still be asserted here
        // is that the router entry the button reaches is reachable independently of the button,
        // which is what lets a host re-emit the intent for a node it owns the chrome of.
        //
        // NOTE — detachment does NOT clear `autoHidden`, and that is the settled contract, not a
        // gap: the two are orthogonal states. `model/Operations.detachItem` -> `detachFromTabs`
        // removes the item from its node and reassigns `activeItemId`, touching no item field, and
        // the docking design record's §2.7 state table — which read them as mutually exclusive — is
        // the side being corrected. Nothing here asserts it either way, because the assertion
        // belongs to the shared detach commit rather than to this button: the rail is a separate
        // affordance, no click can make a railed item active, and the drag terminal and the
        // keyboard twin reach that same commit exactly as this entry does.
        //
        // The read below is therefore a FIXTURE PRECONDITION, not a claim about detach: it pins
        // that the railed sibling starts committed as auto-hidden, so the assertions after the
        // pop-out can show it survived untouched.
        const before = await readDocument(page);

        expect(before.items.railed.autoHidden).toBe(true);
        expect(itemsInNodes(before)).toContain('pinned');

        await setWorkspace(page, {routeActionJson: JSON.stringify({action: 'pop-out', dockNodeId: 'edge-tabs'})});

        // The edge node's ACTIVE item is `pinned`; the router acts on the active item, so that is
        // what detaches — through the same pair, with the railed sibling left committed as it was.
        const document = await waitForDocument(page, doc => !itemsInNodes(doc).includes('pinned'));

        expect(document.items.pinned).toBeTruthy();

        // The orthogonality direction this fixture CAN reach: a sibling's detach commit leaves the
        // railed item's `autoHidden` exactly as it was. Without this the precondition above reads as
        // setup for an assertion nobody makes.
        expect(document.items.railed.autoHidden).toBe(true);

        expect((await readVesselLog(page)).opened.map(entry => entry.itemId)).toEqual(['pinned'])
    });

    test('the item comes home through the engine\'s own retire path, at its captured placement', async ({page}) => {
        const main = tabsNodeWith(page, 'Alpha');

        await tabButton(main, 'Alpha').click();
        await actionButton(main, 'fa-window-restore').click();
        await waitForDocument(page, doc => !itemsInNodes(doc).includes('alpha'));

        // The engine's dead-vessel compensation — release the pane, retire the vessel, reintegrate.
        // Nothing here is pop-out-specific; a click-specific return branch would have to exist for
        // this to be satisfiable any other way.
        await setWorkspace(page, {retireItemId: 'alpha'});

        const document = await waitForDocument(page, doc => itemsInNodes(doc).includes('alpha'));

        // Exact captured placement, not merely "somewhere": alpha was index 0 of main-tabs.
        expect(document.nodes['main-tabs'].items).toEqual(['alpha', 'beta']);

        // And the host's close seam ran, so no OS resource was left tracked-but-open.
        await expect.poll(async () => (await readVesselLog(page)).closed.length).toBeGreaterThan(0);

        await expect(page.locator('#dock-popout-pane-alpha')).toHaveCount(1)
    })
});
