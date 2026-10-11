import {test, expect}       from '../../fixtures.mjs';
import {readComponentRects} from '../utils/dockGeometry.mjs';

/**
 * Whitebox-e2e: root-edge corner weighting on the flagship — the drop lands the arrangement the
 * chip promised, and the last drop takes the corner.
 *
 * The defect this journey exists for: the root edge chips are painted from the dock host's rect,
 * so the bottom chip promises the FULL window width. The resolution used to retarget an
 * `edge-zone` root to its CENTER node, which excludes the left, right and bottom bands — so the
 * drop landed a pane roughly three quarters of the promised width and the side zones kept the
 * corners. Nothing caught it, because the preview payload carries NO rect: the painted extent
 * came from `geometry.root.rect` and the commit from `target.nodeId`, two places with nothing
 * reconciling them. That is the blind spot `utils/dockGeometry.mjs` was written for — a geometry
 * contract that shipped through a green suite because no assertion ever read a rect.
 *
 * Product truths proven against the running workstation, on the dense `edge-zone`-rooted surface:
 * 1. a real pointer drop in the bottom root strip lands a pane spanning the whole arrangement, in
 *    the document tree AND in pixels — the side bands travel INSIDE the wrapped node;
 * 2. a later right drop takes the corner from it: the right pane runs the full height and the
 *    bottom pane narrows — resolved LIVE against the document the first drop produced, so a
 *    captured root id would re-wrap the inner node and leave the bottom pane outside the column.
 *
 * Against the pre-fix source the first read already fails (`split-main` for `root`), so the
 * journey is defect-specific rather than a generic docking smoke test.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8162 \
 *      npx playwright test WorkstationRootEdgeCornerNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

test.describe('Workstation root-edge corner weighting (Neural Link)', () => {
    test.setTimeout(180000);

    /**
     * How far inside the root edge the gesture parks.
     *
     * Not arbitrary, and not a magic number: the root strip is `rootEdgeBandPx` (24) wide, while
     * the tear-out boundary fires on the drag PROXY's intersection ratio against
     * `SortZone#detachThreshold` (0.8). The proxy is 48x32 and centred on the pointer, so parking
     * d px inside gives 0.5 + d/48 horizontally and 0.5 + d/32 vertically — below ~15px the proxy
     * has already crossed the detach threshold and the release becomes a tear-out instead of a
     * dock. 20 sits inside the strip on both axes and above the threshold on both.
     *
     * The approach matters as much as the parking spot: `reattachThreshold` (0.6) means a crossing
     * must be EARNED BACK, so a gesture that dips closer first stays detached even after returning.
     * These moves therefore never go nearer than this.
     * @type {Number}
     */
    const EDGE_INSET = 20;

    // The rendered pane is measured against the host it was promised from. Splitter chrome costs
    // ~24px of 1280; the defect costs ~25% of the width, so the two are nowhere near each other.
    const FULL_SPAN_RATIO = 0.95;

    /** @param {Object|Object[]} result @returns {String|null} */
    const readId = result => (Array.isArray(result) ? result[0] : result)?.id ?? null;

    /**
     * Boots the flagship and resolves the App-Worker Workspace plus the dock host's rect.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>} {app, dockModel, hostRect, wsId}
     */
    async function bootFlagship(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');

        await page.waitForSelector('.workstation-dock-host',               {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);

        // LAYOUT readiness, not DOM presence: a drag against the collapsed frame measures
        // zero-area zones, and this journey asserts widths — it must run on the settled surface.
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host'),
                  zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                      .find(el => el.querySelector('.neo-grid-container'));

            return host && host.getBoundingClientRect().height > 300
                && zone && zone.getBoundingClientRect().height > 100
        }, {timeout: 60000});

        const app    = await neuralLink.connectToApp('Workstation'),
              wsId   = readId(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id'])),
              hostId = await page.evaluate(() => document.querySelector('.workstation-dock-host').id);

        expect(wsId,   'the Workspace must exist in the App Worker').toBeTruthy();
        expect(hostId, 'the dock host must expose a component id').toBeTruthy();

        const {[hostId]: hostRect} = await readComponentRects(app, [hostId]),
              {dockModel}          = await app.getComponent(wsId, ['dockModel']);

        // The dense arrangement is the whole point: an edge-zone root whose left / right / bottom
        // bands are exactly what the pre-fix commit target excluded.
        expect(dockModel.nodes[dockModel.root].type, 'the flagship boots an edge-zone root').toBe('edge-zone');

        return {app, dockModel, hostRect, wsId}
    }

    /**
     * Real pointer drag of one tab header to `target`, parked with the move stream settled.
     *
     * The micro-jiggle is not decoration: the controller's geometry self-heal is per-move-frame,
     * and a perfectly still pointer emits no frames — the settle must not depend on exactly one
     * measurement landing correctly. It jiggles ALONG the edge, never toward it, for the
     * reattach-threshold reason in {@link EDGE_INSET}.
     * @param {Object} page
     * @param {String} label the tab's visible text
     * @param {{x: Number, y: Number}} target
     * @param {String} axis 'x' or 'y' — the direction that runs parallel to the edge
     */
    async function dragTo(page, label, target, axis) {
        const header = page.locator('.neo-tab-header-button', {hasText: label}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(target.x, target.y, {steps: 15});

        for (const delta of [2, -2, 1]) {
            await page.mouse.move(target.x + (axis === 'x' ? delta : 0), target.y + (axis === 'y' ? delta : 0), {steps: 1});
            await page.waitForTimeout(120)
        }

        await page.waitForTimeout(300)
    }

    /**
     * @summary The rendered rect of the projected container for one document node.
     * @param {Object} app
     * @param {String} nodeId
     * @returns {Promise<Object>}
     */
    async function nodeRect(app, nodeId) {
        const id = readId(await app.queryComponent({dockNodeId: nodeId}, ['id']));

        expect(id, `node "${nodeId}" must project a live container`).toBeTruthy();

        return (await readComponentRects(app, [id]))[id]
    }

    test('a bottom root-edge drop spans the whole arrangement, and a later right drop takes the corner', async ({page, neuralLink}) => {
        const {app, dockModel, hostRect, wsId} = await bootFlagship(page, neuralLink),
              rootBefore                       = dockModel.root,
              centerBefore                     = dockModel.nodes[rootBefore].zones.center.nodeId;

        await dragTo(page, 'Audit', {x: hostRect.left + hostRect.width / 2, y: hostRect.bottom - EDGE_INSET}, 'x');

        // Worker truth first. A width alone would prove nothing here: the edge-zone's own bottom
        // band ALSO spans the full width, so a band placement and a root placement paint the same
        // number. Only the resolved target separates them — and it is the pre-fix failure point.
        const previewId     = readId(await app.findInstances({className: 'Neo.dashboard.dock.interaction.Preview'}, ['id'])),
              {dockPreview} = await app.getComponent(previewId, ['dockPreview']);

        expect(dockPreview, 'the parked hover must resolve a preview').toBeTruthy();
        expect(dockPreview.placement.kind, 'the strip resolves a ROOT edge').toBe('edge-bottom');
        expect(dockPreview.target.nodeId, 'aimed at the whole arrangement').toBe(rootBefore);
        expect(dockPreview.target.nodeId, 'and NOT the centre the pre-fix code retargeted to').not.toBe(centerBefore);

        await page.mouse.up();
        await page.waitForTimeout(1200); // commit + re-projection settle

        const afterBottom = (await app.getComponent(wsId, ['dockModel'])).dockModel,
              bottomRoot  = afterBottom.nodes[afterBottom.root],
              droppedId   = (bottomRoot.children ?? []).find(childId => afterBottom.nodes[childId]?.items?.includes('audit'));

        expect(Object.keys(afterBottom.items), 'the pane docked rather than leaving the document')
            .toHaveLength(Object.keys(dockModel.items).length);
        expect(afterBottom.root, 'the drop wraps the arrangement in a NEW root').not.toBe(rootBefore);
        expect(bottomRoot).toMatchObject({type: 'split', orientation: 'vertical'});
        expect(droppedId, 'the dropped pane is a DIRECT child of the new root').toBeTruthy();
        // Both halves of the corner question in one line: the edge-zone (carrying its side bands)
        // and the dropped pane are SIBLINGS, so the pane runs the full width beneath everything.
        expect(bottomRoot.children).toEqual([rootBefore, droppedId]);
        expect(afterBottom.nodes[rootBefore].type, 'the bands travel inside the wrapped node').toBe('edge-zone');

        // And in pixels: what the chip promised is what the surface renders. This is the arm that
        // would have caught the original report — the tree alone cannot show a delivered width.
        const droppedRect = await nodeRect(app, droppedId);

        expect(droppedRect.width / hostRect.width, 'the delivered pane matches the promised width')
            .toBeGreaterThanOrEqual(FULL_SPAN_RATIO);

        // The operator's second gesture: the right drop takes the corner. Resolved LIVE — the
        // boundary is now the split the bottom drop created, not the id captured before it.
        await dragTo(page, 'Metrics', {x: hostRect.right - EDGE_INSET, y: hostRect.top + hostRect.height / 2}, 'y');
        await page.mouse.up();
        await page.waitForTimeout(1200);

        const afterRight = (await app.getComponent(wsId, ['dockModel'])).dockModel,
              rightRoot  = afterRight.nodes[afterRight.root],
              rightId    = (rightRoot.children ?? []).find(childId => afterRight.nodes[childId]?.items?.includes('metrics'));

        expect(rightRoot).toMatchObject({type: 'split', orientation: 'horizontal'});
        expect(rightId, 'the right pane is a DIRECT child of the newest root').toBeTruthy();
        expect(rightRoot.children, 'the right pane wraps everything the bottom drop produced')
            .toEqual([afterBottom.root, rightId]);

        const rightRect       = await nodeRect(app, rightId),
              droppedNarrowed = await nodeRect(app, droppedId);

        expect(rightRect.height / hostRect.height, 'the right pane runs the full height')
            .toBeGreaterThanOrEqual(FULL_SPAN_RATIO);
        expect(droppedNarrowed.width, 'and the bottom pane gives up the corner')
            .toBeLessThan(droppedRect.width)
    })
});
