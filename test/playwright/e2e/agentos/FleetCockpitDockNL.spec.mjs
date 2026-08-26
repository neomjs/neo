import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the cockpit's dock projection commit loop — the live half of the §01
 * mission-control layout: the committed `dockZone.v1` document is the layout SSOT, the visible
 * tree is its projection, and the full dock-holder contract works on the mounted cockpit:
 * 1. the initial projection RENDERS (both live panes + the primary splitter in the DOM);
 * 2. the READ half (`getDockZoneDocument`) serves Neural Link topology before any operation;
 * 3. a REAL pointer drag on the projected splitter commits `resizeSplit` through the reducer /
 *    view-sync split — the document advances, a NEW splitter replaces the committed-away one,
 *    and the toolbar plus keeper panes preserve component and DOM identity;
 * 4. the WRITE half (`executeDockOperation`) round-trips the same loop programmatically — a
 *    human drag and an NL operation are the same commit path.
 *
 * Post-commit witnesses deliberately pair App Worker identity through the Neural Link with exact
 * DOM-node identity. Structural splitters are replaced only after their gesture ends; persistent
 * toolbar and pane nodes transfer into the reconciled shell.
 *
 * State-relative throughout (the SharedWorker heap is shared across a sweep): every target
 * derives from the CURRENT committed sizes, never from assumed seeds.
 *
 * Run: NEO_E2E_PORT=8117 npx playwright test agentos/FleetCockpitDockNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — dock projection commit loop (Neural Link)', () => {
    test.setTimeout(90000);

    test('the mounted cockpit projects the committed document; splitter drag + NL operation both commit through the reducer', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordFleetProjectionRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordFleetProjectionRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordFleetProjectionRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });
        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // 1) the initial projection renders: Fleet is the default keeper-view (mission control
        // first) — the primary split projects its splitter, both live panes mount in their zones
        const splitter = page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').first();
        await expect(splitter, 'the projected primary split must render a splitter').toBeVisible({timeout: 30000});
        await expect(page.locator('[class*="dock-flip-item-fleet"]').first()).toBeVisible();
        await expect(page.locator('[class*="dock-flip-item-stream"]').first()).toBeVisible();

        const app      = await neuralLink.connectToApp('AgentOS'),
              cockpits = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = Array.isArray(cockpits) ? cockpits[0]?.id : cockpits?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // 2) READ half of the dock-holder contract: topology serves BEFORE any operation ran
        const topo0  = await app.getDockTopology(holderId),
              doc0   = topo0?.document ?? topo0,
              sizes0 = doc0.nodes['primary-split'].sizes;

        expect(doc0.nodes['primary-split'].children).toEqual(['fleet-tabs', 'stream-tabs']);
        expect(doc0.nodes['cockpit-root'].zones.center).toBe('primary-split');

        const fleetGrids = await app.findInstances({className: 'AgentOS.view.fleet.roster.Container'}, ['id']),
              streams    = await app.findInstances({className: 'AgentOS.view.fleet.activity.Container'}, ['id']),
              identity   = {
                  fleetGrid: (Array.isArray(fleetGrids) ? fleetGrids[0] : fleetGrids)?.id,
                  stream   : (Array.isArray(streams) ? streams[0] : streams)?.id,
                  toolbar  : await page.locator('.fm-cockpit-bar').getAttribute('id')
              },
              splitterId0 = await splitter.getAttribute('id');

        expect(Object.values(identity).every(Boolean), 'toolbar and keeper pane component ids are mounted').toBe(true);
        expect(splitterId0, 'the projection holds one live splitter instance').toBeTruthy();
        expect(await page.evaluate(({identity, splitterId}) => {
            globalThis.__fleetProjectionIdentity = {
                ...Object.fromEntries(Object.entries(identity).map(([key, id]) => [key, document.getElementById(id)])),
                splitter: document.getElementById(splitterId)
            };

            return Object.values(globalThis.__fleetProjectionIdentity).every(Boolean)
        }, {identity, splitterId: splitterId0}), 'all permanence targets start as exact mounted DOM nodes').toBe(true);

        const assertPersistentIdentity = async message => {
            expect(await page.evaluate(ids => Object.fromEntries(Object.entries(ids).map(([key, id]) => [
                key,
                globalThis.__fleetProjectionIdentity?.[key] === document.getElementById(id)
            ])), identity), message).toEqual({fleetGrid: true, stream: true, toolbar: true});

            const live = await Promise.all(Object.values(identity).map(id => app.getComponent(id, ['id'])));
            expect(live.map(component => component.id), `${message} in the App Worker`).toEqual(Object.values(identity))
        };

        // 3) the REAL gesture: drag the primary splitter downward (vertical split → ns-resize),
        // at real pointer cadence — clear the drag threshold first, then travel, then let the
        // move stream round-trip (main thread → worker → vdom) BEFORE releasing
        const box = await splitter.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, {steps: 4});
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, {steps: 15});
        await page.waitForTimeout(400);

        expect(await page.evaluate(id => globalThis.__fleetProjectionIdentity?.splitter === document.getElementById(id), splitterId0),
            'the committing splitter remains the exact live DOM node until pointer release').toBe(true);
        expect((await app.getComponent(splitterId0, ['id'])).id,
            'the committing splitter remains live in the App Worker until pointer release').toBe(splitterId0);
        const topoDuringDrag = await app.getDockTopology(holderId),
              docDuringDrag  = topoDuringDrag?.document ?? topoDuringDrag;
        expect(docDuringDrag.nodes['primary-split'].sizes,
            'the reducer document stays unchanged before pointer release').toEqual(sizes0);

        await page.mouse.up();

        // the commit loop advanced the DOCUMENT (state-relative: any change from the captured
        // sizes is the claim — the exact ratio depends on live pixel math)
        await expect.poll(async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes[0]
        }, {message: 'the splitter drag must COMMIT resizeSplit through the reducer', timeout: 10000, intervals: [100]}).not.toBe(sizes0[0]);

        await expect.poll(async () => {
            const ids = await page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').evaluateAll(elements =>
                elements.map(element => element.id)
            );
            return ids.length === 1 && ids[0] !== splitterId0
        }, {message: 'the deferred projection must replace the committed splitter instance', timeout: 10000, intervals: [100]}).toBe(true);

        const splitterId1 = await page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').first().getAttribute('id');

        expect(await page.evaluate(id => document.getElementById(id) === null, splitterId0),
            'the committed-away splitter DOM node is retired').toBe(true);
        await assertPersistentIdentity('the toolbar and keeper panes survive the real splitter commit');

        // 4) the WRITE half: an NL-driven operation commits through the SAME loop
        const topo1  = await app.getDockTopology(holderId),
              doc1   = topo1?.document ?? topo1,
              cur    = doc1.nodes['primary-split'].sizes,
              target = cur[0] < 0.5 ? [0.65, 0.35] : [0.3, 0.7];

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
            const ids = await page.locator('.fm-fleet-cockpit .neo-dashboard-dock-splitter').evaluateAll(elements =>
                elements.map(element => element.id)
            );
            return ids.length === 1 && ids[0] !== splitterId1
        }, {message: 'the NL operation must reconcile like the human gesture', timeout: 10000, intervals: [100]}).toBe(true);

        await assertPersistentIdentity('the toolbar and keeper panes survive the NL splitter commit');
        expect(runtimeErrors, 'no global error or unhandled rejection across both projection paths').toEqual([]);
        expect(pageErrors, 'no Playwright pageerror across both projection paths').toEqual([])
    });

    test('perspective presets switch the committed document — one real click, then NL-verifiable switching through the same loop', async ({page, neuralLink}) => {
        const pageErrors    = [],
              runtimeErrors = [];

        await page.context().exposeFunction('__recordFleetPerspectiveRuntimeError', payload => runtimeErrors.push(payload));
        await page.context().addInitScript(() => {
            globalThis.addEventListener('error', event => {
                globalThis.__recordFleetPerspectiveRuntimeError({
                    column : event.colno,
                    line   : event.lineno,
                    message: event.message,
                    source : event.filename,
                    type   : 'error'
                })
            });
            globalThis.addEventListener('unhandledrejection', event => {
                globalThis.__recordFleetPerspectiveRuntimeError({
                    reason: String(event.reason?.stack || event.reason?.message || event.reason),
                    type  : 'unhandledrejection'
                })
            })
        });
        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // the boot bar renders the three seeded presets, Fleet pressed
        const focusButton = page.locator('.fm-preset-button', {hasText: 'Focus'}).first();
        await expect(focusButton, 'the preset bar must render on the boot surface').toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              cockpits = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = Array.isArray(cockpits) ? cockpits[0]?.id : cockpits?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        const fleetGrids = await app.findInstances({className: 'AgentOS.view.fleet.roster.Container'}, ['id']),
              streams    = await app.findInstances({className: 'AgentOS.view.fleet.activity.Container'}, ['id']),
              keepers    = {
                  fleetGrid: (Array.isArray(fleetGrids) ? fleetGrids[0] : fleetGrids)?.id,
                  stream   : (Array.isArray(streams) ? streams[0] : streams)?.id,
                  toolbar  : await page.locator('.fm-cockpit-bar').getAttribute('id')
              };

        expect(Object.values(keepers).every(Boolean), 'perspective permanence targets start mounted').toBe(true);
        await page.evaluate(ids => {
            globalThis.__fleetPerspectiveIdentity = Object.fromEntries(
                Object.entries(ids).map(([key, id]) => [key, document.getElementById(id)])
            )
        }, keepers);

        const primarySizes = async () => {
            const topo = await app.getDockTopology(holderId),
                  doc  = topo?.document ?? topo;
            return doc.nodes['primary-split'].sizes
        };

        // 1) the REAL gesture on the live persistent bar: one click switches to Focus
        await focusButton.click();

        await expect.poll(primarySizes, {message: 'the Focus click must commit the preset document', timeout: 10000, intervals: [100]})
            .toEqual([0.85, 0.15]);

        // 2) NL-verifiable switching: the same public seam a switcher UI calls
        const review = await app.callMethod(holderId, 'activatePerspective', ['Review']);
        expect(review).toMatchObject({switched: true});

        await expect.poll(primarySizes, {message: 'the Review switch must commit', timeout: 10000, intervals: [100]})
            .toEqual([0.45, 0.55]);

        const topoReview = await app.getDockTopology(holderId),
              docReview  = topoReview?.document ?? topoReview;
        expect(docReview.items.detail.autoHidden, 'Review must open the detail band').toBe(false);

        await expect(page.locator('.fm-agent-detail'), 'Review materializes the genuinely absent detail pane')
            .toBeVisible({timeout: 10000});
        const details = await app.findInstances({className: 'AgentOS.view.fleet.detail.Container'}, ['id']),
              detail  = Array.isArray(details) ? details[0] : details;
        expect(detail?.id, 'the absent-item resolver returns one live AgentDetail component').toBeTruthy();

        // ...and back to the default duty
        await app.callMethod(holderId, 'activatePerspective', ['Overview']);

        await expect.poll(primarySizes, {message: 'the Fleet switch must restore the default split', timeout: 10000, intervals: [100]})
            .toEqual([0.6078, 0.3922]);

        await expect(page.locator('.fm-agent-detail'), 'returning to Fleet retires the no-longer-projected detail pane')
            .toHaveCount(0);
        const detailsAfter = await app.findInstances({className: 'AgentOS.view.fleet.detail.Container'}, ['id']);
        expect((Array.isArray(detailsAfter) ? detailsAfter : [detailsAfter]).filter(entry => entry?.id),
            'the retired detail component leaves no worker-side corpse').toEqual([]);

        expect(await page.evaluate(ids => Object.fromEntries(Object.entries(ids).map(([key, id]) => [
            key,
            globalThis.__fleetPerspectiveIdentity?.[key] === document.getElementById(id)
        ])), keepers), 'Fleet and Activity plus the toolbar survive Focus → Review → Fleet')
            .toEqual({fleetGrid: true, stream: true, toolbar: true});
        const keeperComponents = await Promise.all(Object.values(keepers).map(id => app.getComponent(id, ['id'])));
        expect(keeperComponents.map(component => component.id), 'keeper component identities survive every preset')
            .toEqual(Object.values(keepers));

        // a refused switch fails closed: worker truth unchanged, the refusal recorded
        const ghost = await app.callMethod(holderId, 'activatePerspective', ['Ghost']);
        expect(ghost?.switched).toBe(false);
        expect(await primarySizes()).toEqual([0.6078, 0.3922]);
        await expect(page.locator('.fm-preset-error'), 'a refused switch records its error in the same persistent toolbar')
            .toContainText('Ghost');
        expect(runtimeErrors, 'no global error or unhandled rejection across perspective reconciliation').toEqual([]);
        expect(pageErrors, 'no Playwright pageerror across perspective reconciliation').toEqual([])
    });
});
