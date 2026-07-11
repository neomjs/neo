import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the cockpit's dock projection commit loop — the live half of the §01
 * mission-control layout: the committed `dockZone.v1` document is the layout SSOT, the visible
 * tree is its projection, and the full dock-holder contract works on the mounted cockpit:
 * 1. the initial projection RENDERS (both live panes + the primary splitter in the DOM);
 * 2. the READ half (`getDockZoneDocument`) serves Neural Link topology before any operation;
 * 3. a REAL pointer drag on the projected splitter commits `resizeSplit` through the reducer /
 *    view-sync split — the document advances AND the worker re-projects (a NEW splitter
 *    instance replaces the committed-away one);
 * 4. the WRITE half (`executeDockOperation`) round-trips the same loop programmatically — a
 *    human drag and an NL operation are the same commit path.
 *
 * Post-commit witnesses are WORKER-SIDE on purpose (instance identity via the Neural Link, not
 * DOM geometry): the App Worker's rebuilt component tree is the truth layer for "the loop
 * re-projected". The DOM-flush layer currently rides an open wholesale-refresh reconciliation
 * defect (stale child DOM surviving a removeAll+rebuild commit), owned by its own ticket with
 * this surface listed as a casualty — its regression witness belongs to that fix, not here.
 *
 * State-relative throughout (the SharedWorker heap is shared across a sweep): every target
 * derives from the CURRENT committed sizes, never from assumed seeds.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test agentos/FleetCockpitDockNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — dock projection commit loop (Neural Link)', () => {
    test.setTimeout(90000);

    test('the mounted cockpit projects the committed document; splitter drag + NL operation both commit through the reducer', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // 1) the initial projection renders: Fleet is the default keeper-view (mission control
        // first) — the primary split projects its splitter, both live panes mount in their zones
        const splitter = page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').first();
        await expect(splitter, 'the projected primary split must render a splitter').toBeVisible({timeout: 30000});
        await expect(page.locator('[class*="dock-flip-item-fleet"]').first()).toBeVisible();
        await expect(page.locator('[class*="dock-flip-item-stream"]').first()).toBeVisible();

        const app      = await neuralLink.connectToApp('AgentOS'),
              cockpits = await app.findInstances({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              holderId = Array.isArray(cockpits) ? cockpits[0]?.id : cockpits?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // 2) READ half of the dock-holder contract: topology serves BEFORE any operation ran
        const topo0  = await app.getDockTopology(holderId),
              doc0   = topo0?.document ?? topo0,
              sizes0 = doc0.nodes['primary-split'].sizes;

        expect(doc0.nodes['primary-split'].children).toEqual(['fleet-tabs', 'stream-tabs']);
        expect(doc0.nodes['cockpit-root'].zones.center).toBe('primary-split');

        // the worker-side splitter instance identity — the re-projection witness baseline
        const splitterIds = async () => {
            const found = await app.findInstances({ntype: 'dashboard-dock-splitter'}, ['id']);
            return (Array.isArray(found) ? found : [found]).map(instance => instance?.id).filter(Boolean)
        };
        const ids0 = await splitterIds();
        expect(ids0.length, 'the projection must hold one live splitter instance').toBeGreaterThan(0);

        // 3) the REAL gesture: drag the primary splitter downward (vertical split → ns-resize),
        // at real pointer cadence — clear the drag threshold first, then travel, then let the
        // move stream round-trip (main thread → worker → vdom) BEFORE releasing
        const box = await splitter.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, {steps: 4});
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, {steps: 15});
        await page.waitForTimeout(400);
        await page.mouse.up();

        // the commit loop advanced the DOCUMENT (state-relative: any change from the captured
        // sizes is the claim — the exact ratio depends on live pixel math)
        await expect.poll(async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes[0]
        }, {message: 'the splitter drag must COMMIT resizeSplit through the reducer', timeout: 10000, intervals: [100]}).not.toBe(sizes0[0]);

        // ...and the worker RE-PROJECTED from the committed document: the splitter is a NEW
        // instance (removeAll + rebuild — instances do not survive commits, by design)
        await expect.poll(async () => {
            const ids = await splitterIds();
            return ids.length > 0 && ids.every(id => !ids0.includes(id))
        }, {message: 'the deferred re-projection must rebuild the splitter instance', timeout: 10000, intervals: [100]}).toBe(true);

        // 4) the WRITE half: an NL-driven operation commits through the SAME loop
        const topo1  = await app.getDockTopology(holderId),
              doc1   = topo1?.document ?? topo1,
              cur    = doc1.nodes['primary-split'].sizes,
              target = cur[0] < 0.5 ? [0.65, 0.35] : [0.3, 0.7],
              ids1   = await splitterIds();

        const result = await app.executeDockOperation(holderId, {
            operation: 'resizeSplit', splitNodeId: 'primary-split', sizes: target
        });

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        await expect.poll(async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes
        }, {message: 'the NL operation must land in the committed document', timeout: 10000, intervals: [100]}).toEqual(target);

        await expect.poll(async () => {
            const ids = await splitterIds();
            return ids.length > 0 && ids.every(id => !ids1.includes(id))
        }, {message: 'the NL operation must re-project like the human gesture', timeout: 10000, intervals: [100]}).toBe(true)
    });

    test('perspective presets switch the committed document — one real click, then NL-verifiable switching through the same loop', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // the boot bar renders the three seeded presets, Fleet pressed
        const focusButton = page.locator('.fm-preset-button', {hasText: 'Focus'}).first();
        await expect(focusButton, 'the preset bar must render on the boot surface').toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              cockpits = await app.findInstances({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              holderId = Array.isArray(cockpits) ? cockpits[0]?.id : cockpits?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        const primarySizes = async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes
        };

        // 1) the REAL gesture on the live boot bar: one click switches to Focus — worker truth
        // (post-switch bar re-renders ride the open wholesale-refresh flush defect, so the
        // remaining switches drive the NL path — which the AC names verbatim)
        await focusButton.click();

        await expect.poll(primarySizes, {message: 'the Focus click must commit the preset document', timeout: 10000, intervals: [100]})
            .toEqual([0.85, 0.15]);

        // 2) NL-verifiable switching: the same public seam a switcher UI calls
        const {NeuralLink_InstanceService} = await import('../../../../ai/services.mjs');

        const review = await NeuralLink_InstanceService.callMethod({
            sessionId: app.sessionId, id: holderId, method: 'activatePerspective', args: ['Review']
        });
        expect(review?.result ?? review).toMatchObject({switched: true});

        await expect.poll(primarySizes, {message: 'the Review switch must commit', timeout: 10000, intervals: [100]})
            .toEqual([0.45, 0.55]);

        const topoReview = await app.getDockTopology(holderId),
              docReview  = topoReview?.document ?? topoReview;
        expect(docReview.items.detail.autoHidden, 'Review must open the detail band').toBe(false);

        // ...and back to the default duty
        await NeuralLink_InstanceService.callMethod({
            sessionId: app.sessionId, id: holderId, method: 'activatePerspective', args: ['Fleet']
        });

        await expect.poll(primarySizes, {message: 'the Fleet switch must restore the default split', timeout: 10000, intervals: [100]})
            .toEqual([0.6078, 0.3922]);

        // a refused switch fails closed: worker truth unchanged, the refusal recorded
        const ghost = await NeuralLink_InstanceService.callMethod({
            sessionId: app.sessionId, id: holderId, method: 'activatePerspective', args: ['Ghost']
        });
        expect((ghost?.result ?? ghost)?.switched).toBe(false);
        expect(await primarySizes()).toEqual([0.6078, 0.3922])
    });
});
