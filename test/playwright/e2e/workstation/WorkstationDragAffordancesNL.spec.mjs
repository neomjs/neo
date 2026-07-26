import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the FLAGSHIP's drag-affordance journey — the durable real-pointer proof
 * that the workstation's composition of the shared gesture controller renders the full
 * affordance language and commits release truth on the dense 20-pane surface.
 *
 * Product truths proven against the running workstation:
 * 1. a real tab-header pointer drag LIGHTS the indicator menu and the zone preview on the
 *    flagship (the capability the standalone app never had);
 * 2. releasing at a zone center commits exactly that zone's tab-into through the reducer
 *    (App-Worker document truth) — release truth on the flagship;
 * 3. the preview design-language switch re-skins the affordances LIVE mid-gesture
 *    (`previewLanguage: 'signal'` → the signal chroma on the accepted zone treatment) —
 *    the switch and the affordances finally exist on the same surface.
 *
 * Run: NEO_E2E_PORT=8096 npx playwright test WorkstationDragAffordancesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

test.describe('Workstation drag affordances — the flagship journey (Neural Link)', () => {
    test.setTimeout(120000);

    /**
     * Boots the flagship, connects the bridge, and resolves ids + zone geometry.
     * @param {Object} page
     * @param {Object} neuralLink
     * @returns {Promise<Object>}
     */
    async function bootFlagship(page, neuralLink) {
        await page.goto('/apps/workstation/index.html');

        await page.waitForSelector('.workstation-dock-host',              {timeout: 60000});
        await page.waitForSelector('.neo-tab-header-button.neo-draggable', {timeout: 60000});
        await page.evaluate(() => document.fonts.ready);

        // LAYOUT readiness, not DOM presence: dev-mode styles land after the elements do,
        // and a drag against the collapsed frame measures zero-area zones (the controller
        // self-heals per frame, but the journey must assert against the settled surface).
        // The gate covers the host AND a projected zone — panes hydrate async, so the host
        // can reach full height while individual tab zones still measure 0×0.
        await page.waitForFunction(() => {
            const host = document.querySelector('.workstation-dock-host');
            const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                .find(el => el.querySelector('.neo-grid-container'));
            return host && host.getBoundingClientRect().height > 300
                && zone && zone.getBoundingClientRect().height > 100
        }, {timeout: 60000});

        const app        = await neuralLink.connectToApp('Workstation');
        const workspaces = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']);
        const wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id;

        expect(wsId, 'the Workspace must exist in the App Worker').toBeTruthy();

        // the scale zone (left column of the dense layout) is the drop target
        const scaleBox = await page.evaluate(() => {
            const zone = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                .find(el => el.querySelector('.neo-grid-container'));
            const r = zone.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height}
        });

        return {app, scaleBox, wsId}
    }

    /**
     * Real pointer drag of the Audit tab, parked at the target point (arming cleared, the
     * move stream settled).
     * @param {Object} page
     * @param {Object} target {x, y}
     */
    async function parkAuditDrag(page, target) {
        const header = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await expect(header).toBeVisible();

        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await expect(page.locator('.neo-tab-header-toolbar.neo-is-dragging')).toBeVisible();
        await page.mouse.move(target.x, target.y, {steps: 15});
        await page.waitForTimeout(300);

        // Park with a micro-jiggle: a real hand is never frame-perfect still, and the
        // controller's geometry self-heal is per-move-frame by design — a parked pointer
        // emits no frames, so the settle must not depend on exactly one measurement.
        for (const dx of [2, -2, 1]) {
            await page.mouse.move(target.x + dx, target.y, {steps: 1});
            await page.waitForTimeout(120)
        }
        await page.waitForTimeout(300)
    }

    /**
     * Reads the browser's painted overlay geometry while Neural Link owns interaction truth.
     * @summary Captures the fix-critical containing-block and rect contract without creating a shared helper.
     * @param {Object} page
     * @returns {Promise<Object>}
     */
    async function readParkedOverlayGeometry(page) {
        return page.evaluate(() => {
            const
                dockHost       = document.querySelector('.workstation-dock-host'),
                indicatorLayer = document.querySelector('.neo-dashboard-dock-drop-indicators'),
                previewLayer   = document.querySelector('.neo-dock-preview'),
                targetZone     = [...document.querySelectorAll('.neo-dashboard-dock-tabs')]
                    .find(element => element.querySelector('.neo-grid-container')),
                readRect       = element => {
                    const rect = element?.getBoundingClientRect();

                    return rect && {
                        bottom: rect.bottom,
                        height: rect.height,
                        left  : rect.left,
                        right : rect.right,
                        top   : rect.top,
                        width : rect.width
                    }
                };

            return {
                dockHost               : readRect(dockHost),
                dockHostId             : dockHost.id,
                hostPosition           : getComputedStyle(dockHost).position,
                indicatorLayer         : readRect(indicatorLayer),
                indicatorOffsetParentId: indicatorLayer.offsetParent?.id,
                indicatorZIndex        : Number.parseInt(getComputedStyle(indicatorLayer).zIndex, 10),
                previewAffordance      : readRect(document.querySelector('.neo-dock-preview-affordance')),
                previewLayer           : readRect(previewLayer),
                previewOffsetParentId  : previewLayer.offsetParent?.id,
                previewPointerEvents   : getComputedStyle(previewLayer).pointerEvents,
                previewZIndex          : Number.parseInt(getComputedStyle(previewLayer).zIndex, 10),
                targetZone             : readRect(targetZone),
                topChip                : readRect(document.querySelector(
                    '.neo-dashboard-dock-drop-chip-top:not(.neo-dashboard-dock-drop-indicator-off)'
                )),
                tourbar          : readRect(document.querySelector('.workstation-tourbar')),
                visibleIndicators: [...document.querySelectorAll(
                    '.neo-dashboard-dock-drop-indicator:not(.neo-dashboard-dock-drop-indicator-off),'
                    + '.neo-dashboard-dock-drop-chip:not(.neo-dashboard-dock-drop-indicator-off)'
                )].map(readRect)
            }
        })
    }

    test('the parked affordances stay inside the dock positioning host', async ({page, neuralLink}) => {
        const {app, scaleBox} = await bootFlagship(page, neuralLink);
        const center          = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        await parkAuditDrag(page, center);

        const
            indicators = await app.findInstances({className: 'Neo.dashboard.DockDropIndicators'}, ['id']),
            indId      = (Array.isArray(indicators) ? indicators[0] : indicators)?.id,
            indState   = await app.getComponent(indId, ['candidateSet', 'mounted']),
            geometry   = await readParkedOverlayGeometry(page),
            within     = (inner, outer) => inner.left >= outer.left - 1
                && inner.top >= outer.top - 1
                && inner.right <= outer.right + 1
                && inner.bottom <= outer.bottom + 1,
            intersects = (first, second) => first.left < second.right
                && first.right > second.left
                && first.top < second.bottom
                && first.bottom > second.top;

        expect(indState?.candidateSet, 'worker truth built the candidate set before geometry truth').toBeTruthy();
        expect(geometry.hostPosition, 'the dock host establishes the overlay containing block').toBe('relative');
        expect(geometry.indicatorOffsetParentId).toBe(geometry.dockHostId);
        expect(geometry.previewOffsetParentId).toBe(geometry.dockHostId);
        expect(geometry.indicatorLayer).toEqual(geometry.dockHost);
        expect(geometry.previewLayer).toEqual(geometry.dockHost);
        expect(geometry.previewPointerEvents).toBe('none');
        expect(geometry.previewZIndex).toBeLessThan(geometry.indicatorZIndex);
        expect(geometry.visibleIndicators.length).toBeGreaterThan(0);
        expect(geometry.visibleIndicators.every(rect => within(rect, geometry.dockHost)),
            'every painted indicator stays inside the dock host').toBe(true);
        expect(within(geometry.previewAffordance, geometry.dockHost),
            'the painted preview stays inside the dock host').toBe(true);
        expect(intersects(geometry.topChip, geometry.tourbar),
            'the top edge chip never overlaps the app header').toBe(false);
        expect(Math.abs(geometry.previewAffordance.left - geometry.targetZone.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.top - geometry.targetZone.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.width - geometry.targetZone.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.previewAffordance.height - geometry.targetZone.height)).toBeLessThanOrEqual(1);

        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300)
    });

    test('a real drag lights the menu + preview, and the release commits release truth', async ({page, neuralLink}) => {
        const {app, scaleBox, wsId} = await bootFlagship(page, neuralLink);
        const center                = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        await parkAuditDrag(page, center);

        // worker truth first (localizes a failure to gesture-vs-render): the parked hover
        // BUILT a candidate set — the §06 pipeline ran end-to-end in the App Worker. This
        // also witnesses the sensor's detached-node dispatch repair: the dense toolbar's
        // overflow re-collapse replaces the dragged button's node mid-gesture, and the move
        // stream must survive that (src/main/draggable/sensor/Base.mjs#trigger).
        const indicators = await app.findInstances({className: 'Neo.dashboard.DockDropIndicators'}, ['id']);
        const indId      = (Array.isArray(indicators) ? indicators[0] : indicators)?.id;
        const indState   = await app.getComponent(indId, ['candidateSet', 'mounted']);

        expect(indState?.candidateSet, 'the parked hover built a candidate set (worker truth)').toBeTruthy();

        // the flagship's first affordances: menu + preview, live mid-gesture
        await expect(page.locator('.neo-dashboard-dock-drop-indicators:not(.neo-dashboard-dock-drop-indicators-hidden)'),
            'the indicator layer is visible mid-drag').toBeVisible();
        await expect(page.locator('.neo-dock-preview > *').first(),
            'the zone preview renders').toBeVisible();

        await page.mouse.up();
        await page.waitForTimeout(900); // commit + re-projection settle

        // worker truth: the release at the scale zone's center committed tab-into there
        const {dockModel} = await app.getComponent(wsId, ['dockModel']);
        const scaleNode   = Object.values(dockModel.nodes)
            .find(node => node.type === 'tabs' && node.items?.includes('scale'));

        expect(scaleNode.items, 'audit joined the scale zone — release truth on the flagship').toContain('audit');

        // the affordances retired with the gesture
        await expect(page.locator('.neo-dashboard-dock-drop-indicators')).toHaveClass(/neo-dashboard-dock-drop-indicators-hidden/)
    });

    test('the preview design language re-skins the affordances live on the same surface', async ({page, neuralLink}) => {
        const {app, scaleBox, wsId} = await bootFlagship(page, neuralLink);
        const center                = {x: scaleBox.x + scaleBox.width / 2, y: scaleBox.y + scaleBox.height / 2};

        // the gesture parks FIRST, on the default language — the switch must land mid-gesture
        await parkAuditDrag(page, center);

        const readTreatment = () => page.$eval('.neo-dock-preview-affordance.neo-dock-preview-accepted', el => {
            const style = getComputedStyle(el);
            return {borderColor: style.borderColor, boxShadow: style.boxShadow}
        });

        const defaultTreatment = await readTreatment();

        // LIVE mid-gesture switch: the config lands in the App Worker while the drag is parked;
        // the host's language modifier swaps and the PARKED affordance re-resolves its aliases
        // through the cascade — no re-render, no new gesture
        await app.callMethod(wsId, 'set', [{previewLanguage: 'signal'}]);
        await expect(page.locator('.neo-preview-lang-signal')).toBeVisible();

        const signalTreatment = await readTreatment();

        // the accepted zone treatment now renders the SIGNAL chroma (the workstation's own
        // projected alias — dark boot: #5eead4). The border hue is shared family accent; the
        // language's OWN signature — the layered signal glow — is what must visibly change on
        // the live parked affordance.
        expect(signalTreatment.borderColor).toBe('rgb(94, 234, 212)');
        expect(signalTreatment.boxShadow, 'the switch re-skinned the LIVE parked affordance').not.toBe(defaultTreatment.boxShadow);

        // cancel — this scene commits nothing
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(300);

        const {dockModel} = await app.getComponent(wsId, ['dockModel']);

        expect(dockModel.nodes['right-top-tabs'].items, 'the cancelled gesture committed nothing').toContain('audit')
    })
});
