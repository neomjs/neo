import {test, expect}       from '../../fixtures.mjs';
import {readComponentRects} from '../utils/dockGeometry.mjs';

/**
 * Whitebox-e2e: the root edge chips aim at the arrangement they are drawn from.
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
 * Product truth proven against the running workstation: on the dense `edge-zone`-rooted surface,
 * the root tier resolves the WHOLE arrangement and paints it at the host's full width. Against
 * the pre-fix source this same read returns the centre split, so the journey is defect-specific.
 *
 * Scope note — why the release is a CANCEL. Committing the drop is covered at the unit level
 * (`test/playwright/unit/dashboard/DockDragAffordances.spec.mjs`, asserted on the document tree
 * with a pre-fix control). It is not asserted here because the flagship's tear-out layer claims a
 * release near the surface boundary before the dock's drop seam sees it: at a 1280x720 viewport
 * the bottom chip's centre sits ~23px above the host edge, the drag proxy overdrags the tear-out
 * boundary, and the pane leaves the document entirely (`items` loses it). That interference is a
 * separate subsystem from the resolution under test and is reported on its own.
 *
 * Run: NEO_AGENTOS_RUNTIME_ROOT=<abs path to neo-agent-brain> NEO_E2E_PORT=8162 \
 *      npx playwright test WorkstationRootEdgeCornerNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

test.describe('Workstation root-edge boundary (Neural Link)', () => {
    test.setTimeout(120000);

    // The painted chip is measured against the host it was promised from. Splitter chrome and
    // sub-pixel layout cost a few px; the defect costs ~25% of the width, so the two are nowhere
    // near each other — this tolerance separates rounding from regression.
    const EDGE_TOLERANCE = 8;

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
        expect(dockModel.nodes[dockModel.root].zones.center.nodeId, 'with a centre that is NOT the root')
            .toBeTruthy();

        return {app, dockModel, hostRect, wsId}
    }

    /**
     * Real pointer drag of one tab header, parked at the target with the move stream settled.
     *
     * The micro-jiggle is not decoration: the controller's geometry self-heal is per-move-frame,
     * and a perfectly still pointer emits no frames — the settle must not depend on exactly one
     * measurement landing correctly.
     * @param {Object} page
     * @param {String} label the tab's visible text
     * @param {{x: Number, y: Number}} target
     */
    async function parkDrag(page, label, target) {
        const header = page.locator('.neo-tab-header-button', {hasText: label}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(target.x, target.y, {steps: 15});

        for (const dx of [2, -2, 1]) {
            await page.mouse.move(target.x + dx, target.y, {steps: 1});
            await page.waitForTimeout(120)
        }

        await page.waitForTimeout(300)
    }

    test('the bottom root chip resolves the whole arrangement, not the edge-zone centre', async ({page, neuralLink}) => {
        const {app, dockModel, hostRect, wsId} = await bootFlagship(page, neuralLink),
              rootId                           = dockModel.root,
              centerId                         = dockModel.nodes[rootId].zones.center.nodeId;

        // 8px above the host's bottom edge: inside the 24px root strip, and deliberately also
        // deep inside the dense arrangement's own bottom band — the strip must win over the zone
        // beneath it, which is what makes this the ROOT tier rather than a band drop.
        await parkDrag(page, 'Audit', {x: hostRect.left + hostRect.width / 2, y: hostRect.bottom - 8});

        // Worker truth first. A width alone would prove nothing: the edge-zone's own bottom band
        // ALSO spans the full width, so a band placement and a root placement paint the same
        // number. Only the resolved target separates them.
        const previewId     = readId(await app.findInstances({className: 'Neo.dashboard.dock.interaction.Preview'}, ['id'])),
              {dockPreview} = await app.getComponent(previewId, ['dockPreview']);

        expect(dockPreview, 'the parked hover must resolve a preview').toBeTruthy();
        expect(dockPreview.placement.kind, 'the strip resolves a ROOT edge').toBe('edge-bottom');
        expect(dockPreview.target.nodeId, 'aimed at the whole arrangement').toBe(rootId);
        expect(dockPreview.target.nodeId, 'and NOT at the centre the pre-fix code retargeted to').not.toBe(centerId);

        // The indicator MENU's root chip family is asserted at unit level instead
        // (`DockDragAffordances.spec.mjs`, four edges against the same boundary, with a pre-fix
        // control). A strip pointer is the inference tier, not the menu tier — measured here, the
        // single live layer reports `candidateSet.root: null` at this position — and characterising
        // when the menu populates is a different question from the boundary under test.

        // Only now is the painted width meaningful: the promise belongs to the whole arrangement.
        const promised = await page.evaluate(() => {
            const r = document.querySelector('.neo-dock-preview-affordance')?.getBoundingClientRect();

            return r && {width: r.width}
        });

        expect(promised, 'the root chip must paint a preview').toBeTruthy();
        expect(promised.width, 'the bottom chip promises the full host width')
            .toBeGreaterThanOrEqual(hostRect.width - EDGE_TOLERANCE);

        // Cancel: this journey commits nothing, and the unchanged document is the control that
        // the reads above came from a live gesture rather than a settled surface.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300);

        const after = (await app.getComponent(wsId, ['dockModel'])).dockModel;

        expect(after.root, 'the cancelled gesture committed nothing').toBe(rootId);
        expect(Object.keys(after.items)).toHaveLength(Object.keys(dockModel.items).length)
    })
});
