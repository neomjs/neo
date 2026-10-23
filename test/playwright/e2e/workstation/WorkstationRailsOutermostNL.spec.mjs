import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Edge rails stay window chrome when a root-edge drop wraps the arrangement.
 *
 * A root-edge drop wraps the edge-zone root in a split (the DockPanel rule). The edge-zone used to project its rails at
 * its own boundary, which then sat inside the split: the bottom rail above the dropped pane, the left rail cut short.
 * Rails belong at the dock host's outer edges, at any nesting depth, with the arrangement inside them. The shipped
 * layout keeps visible panes beside both of its rails (Task Queue Pressure, Live Event Stream), so only the rails move.
 *
 * Run: NEO_NL_PORT=<free port> npx playwright test workstation/WorkstationRailsOutermostNL -c test/playwright/playwright.config.e2e.mjs
 */

// The gesture parks inside the 24px root strip but outside the tear-out threshold (see WorkstationRootEdgeCornerNL)
const EDGE_INSET = 20;

/** @param {Object|Object[]} result @returns {String|null} */
const readId = result => (Array.isArray(result) ? result[0] : result)?.id ?? null;

/**
 * Boots the flagship on its settled layout.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<{app: Object, wsId: String}>}
 */
async function bootFlagship(page, neuralLink) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => document.querySelector('.workstation-dock-host')?.getBoundingClientRect().height > 300
        && document.querySelectorAll('.neo-dashboard-dock-edge-rail').length === 2, {timeout: 60000});

    const app  = await neuralLink.connectToApp('Workstation'),
          wsId = readId(await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']));

    expect(wsId, 'the Workspace must exist in the App Worker').toBeTruthy();

    return {app, wsId}
}

/**
 * Drops one tab on the bottom root-edge strip with real pointer input, the gesture the operator used.
 * @param {Object} page
 * @param {String} label The tab's visible text
 */
async function dropOnBottomRootEdge(page, label) {
    const header = page.locator('.neo-tab-header-button', {hasText: label}).first(),
          box    = await header.boundingBox(),
          host   = await page.locator('.workstation-dock-host').boundingBox(),
          target = {x: host.x + host.width / 2, y: host.y + host.height - EDGE_INSET};

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
    await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
    await page.mouse.move(target.x, target.y, {steps: 15});

    // Settles the controller's per-frame geometry along the edge, never toward it
    for (const delta of [2, -2, 1]) {
        await page.mouse.move(target.x + delta, target.y, {steps: 1});
        await page.waitForTimeout(120)
    }

    await page.mouse.up()
}

/**
 * The dock host's content box (the arrangement's area inside its padding), its rails by edge and every visible pane,
 * as main-thread layout rects.
 * @param {Object} page
 * @returns {Promise<{host: Object, panes: Object[], rails: Object}>}
 */
const readChrome = page => page.evaluate(() => {
    const rect = el => {
        const {bottom, height, left, right, top, width} = el.getBoundingClientRect();
        return {bottom, height, left, right, top, width}
    };

    const hostEl = document.querySelector('.workstation-dock-host'),
          style  = getComputedStyle(hostEl),
          inset  = side => parseFloat(style[`padding${side}`]) + parseFloat(style[`border${side}Width`]),
          outer  = rect(hostEl),
          rails  = {};

    document.querySelectorAll('.neo-dashboard-dock-edge-rail').forEach(el => {
        const edge = ['top', 'right', 'bottom', 'left'].find(name => el.classList.contains(`neo-dashboard-dock-edge-rail-${name}`));
        rails[edge] = rect(el)
    });

    return {
        host : {bottom: outer.bottom - inset('Bottom'), left: outer.left + inset('Left'), right: outer.right - inset('Right'), top: outer.top + inset('Top')},
        panes: [...document.querySelectorAll('.neo-dashboard-dock-tabs')].map(rect).filter(pane => pane.width > 0 && pane.height > 0),
        rails
    }
});

/**
 * Waits for a committed document whose root differs from `previousRoot`, then for the projection it scheduled.
 * @param {Object} app
 * @param {String} wsId
 * @param {String} previousRoot
 */
async function settleAfterRootChange(app, wsId, previousRoot) {
    await expect.poll(async () => (await app.getComponent(wsId, ['dockModel'])).dockModel.root, {
        message: 'the document commits a new root',
        timeout: 10000
    }).not.toBe(previousRoot);

    const {refreshPromise} = await app.getComponent(wsId, ['refreshPromise']);

    refreshPromise && await app.callMethod(wsId, 'refreshPromise.then')
}

/**
 * Rails on the host's edges: the bottom rail on its lower edge, the left rail on its left edge from its top.
 * @param {Object} chrome From {@link readChrome}
 * @param {String} when
 */
function expectRailsOnHostEdges({host, rails}, when) {
    const {bottom, left} = rails;

    expect(bottom && left, `${when}: both shipped rails render`).toBeTruthy();
    expect(Math.abs(bottom.bottom - host.bottom), `${when}: the bottom rail sits on the host's lower edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(left.left - host.left), `${when}: the left rail sits on the host's left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(left.top - host.top), `${when}: the left rail starts at the host's top`).toBeLessThanOrEqual(1)
}

/**
 * Rails framing a wrapped arrangement, with the edge-zone's corner policy: the bottom rail spans the host's width, and
 * the left rail runs alongside every pane, each of which lies inside that frame.
 * @param {Object} page
 * @param {String} when
 */
async function expectRailsOutermost(page, when) {
    const chrome         = await readChrome(page),
          {bottom, left} = chrome.rails;

    expectRailsOnHostEdges(chrome, when);

    for (const pane of chrome.panes) {
        expect(pane.bottom, `${when}: every pane lies above the bottom rail`).toBeLessThanOrEqual(bottom.top + 1);
        expect(pane.left, `${when}: every pane lies right of the left rail`).toBeGreaterThanOrEqual(left.right - 1);
        expect(left.bottom, `${when}: the left rail runs alongside every pane`).toBeGreaterThanOrEqual(pane.bottom - 1)
    }
}

test.describe('Workstation — edge rails stay at the window edge (Neural Link)', () => {
    test.setTimeout(180000);
    test.use({viewport: {height: 900, width: 1440}});

    test('a bottom root-edge drop keeps both rails outermost, and a stored wrapped layout renders the same', async ({page, neuralLink}) => {
        const {app, wsId} = await bootFlagship(page, neuralLink),
              shipped     = (await app.getComponent(wsId, ['dockModel'])).dockModel;

        // Control: the reads find both rails where the unwrapped edge-zone already puts them
        expectRailsOnHostEdges(await readChrome(page), 'control, unwrapped');

        await dropOnBottomRootEdge(page, 'Audit');
        await settleAfterRootChange(app, wsId, shipped.root);

        const wrapped = (await app.getComponent(wsId, ['dockModel'])).dockModel;

        expect(wrapped.nodes[wrapped.root].children, 'the drop wraps the edge-zone root in a split').toContain(shipped.root);
        await expectRailsOutermost(page, 'after the drop');

        // A stored layout in the wrapped shape installs from scratch, as a restore does: no drop, no migration
        await app.callMethod(wsId, 'onDockZoneDocumentChange', [shipped, {operation: 'applyDocument', document: shipped}]);
        await settleAfterRootChange(app, wsId, wrapped.root);
        await app.callMethod(wsId, 'onDockZoneDocumentChange', [wrapped, {operation: 'applyDocument', document: wrapped}]);
        await settleAfterRootChange(app, wsId, shipped.root);
        await expectRailsOutermost(page, 'after installing the stored wrapped layout')
    });

    test('a reveal from the moved bottom rail opens against the arrangement and pins', async ({page, neuralLink}) => {
        const {app, wsId} = await bootFlagship(page, neuralLink),
              shippedRoot = (await app.getComponent(wsId, ['dockModel'])).dockModel.root;

        await dropOnBottomRootEdge(page, 'Audit');
        await settleAfterRootChange(app, wsId, shippedRoot);
        await page.locator('.neo-dashboard-dock-edge-rail-bottom .neo-dashboard-dock-rail-tab', {hasText: 'Selection Inspector'}).click();

        const overlay = page.locator('.neo-dashboard-dock-edge-rail-bottom .neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)');

        await expect(overlay, 'the reveal opens').toBeVisible();

        const {host, rails} = await readChrome(page),
              revealRect    = await overlay.boundingBox();

        // The moved rail sits on the host's lower edge, so a reveal rising from it opens against the whole arrangement
        expect(Math.abs(rails.bottom.bottom - host.bottom), 'the bottom rail sits on the host\'s lower edge').toBeLessThanOrEqual(1);
        expect(Math.abs(revealRect.y + revealRect.height - rails.bottom.top), 'the reveal rises from the rail').toBeLessThanOrEqual(1);
        expect(revealRect.y, 'and stays inside the host').toBeGreaterThanOrEqual(host.top - 1);

        await overlay.locator('.neo-dashboard-dock-reveal-pin').click();

        await expect.poll(async () => (await app.getComponent(wsId, ['dockModel'])).dockModel.items.inspector.autoHidden === true, {
            message: 'the pin commits the item back into the layout',
            timeout: 10000
        }).toBe(false);
        await expect(page.locator('.neo-dashboard-dock-tabs .neo-tab-header-button', {hasText: 'Inspector'}), 'the pinned item renders as a pane').toBeVisible()
    })
});
