import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the Stage-1 cockpit pop-out: the agent-detail inspector detaches to a REAL
 * second browser window while staying on the ONE SharedWorker App-Worker heap, and comes home —
 * reparent-never-recreate, live through every phase, with the SHELL owning every affordance
 * (the pane carries zero dock semantics):
 *
 * 1. drill: the controller seam seats a resident and reveals the detail inspector (the standard
 *    commit loop);
 * 2. detach: the cockpit toolbar's window-toggle opens the widget-childapp vessel — the dock
 *    document prunes the `detail` item but keeps its catalog record (Neural Link topology stays
 *    truthful), the admission state machine walks docked → opening → windowed, and the SAME
 *    AgentDetail instance (App-Worker id) renders in the popup;
 * 3. live continuity: selecting a DIFFERENT resident from the MAIN window re-renders the
 *    popped-out inspector — main-window intent → App Worker → popup render target, no remount;
 * 4. reattach: the SAME shell toggle brings the item home at its EXACT remembered tab index,
 *    closes the vessel, and the SAME instance renders docked with the state it gathered while
 *    windowed.
 *
 * The full gesture-driven drill tour (card → detail → pop-out → reattach as a narrated journey)
 * is the drill-e2e sibling leaf's scope; this witness proves the capability spine it builds on.
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test agentos/FleetCockpitPopOutNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — agent-detail pop-out round-trip (Neural Link)', () => {
    test.setTimeout(120000);

    test('detach → own OS window on the shared heap → live update while windowed → reattach home', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // 1) drill through the REAL controller seam (onAgentSelect: owner-held record + the
        // setItemAutoHidden reveal through the commit loop). Driven via callMethod because the
        // card-click → agentSelect DOM chain is regressed on dev (own bug ticket; the full
        // gesture journey belongs to the drill-e2e sibling leaf) — the seam below the gesture is
        // the production path.
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app   = await neuralLink.connectToApp('AgentOS'),
              cards = await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['record', 'id']);

        expect(cards.length, 'the fleet renders cards with records').toBeGreaterThan(1);

        const controllers  = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Controller'}, ['id']),
              controllerId = (Array.isArray(controllers) ? controllers[0] : controllers)?.id,
              firstAgentId = cards[0]?.properties?.record?.agentId;

        expect(controllerId, 'the cockpit controller must exist in the App Worker').toBeTruthy();
        expect(firstAgentId, 'the first card carries a resident record').toBeTruthy();

        await app.callMethod(controllerId, 'onAgentSelect', [{agentId: firstAgentId}]);

        const detailRoot = page.locator('.fm-agent-detail');

        await expect(detailRoot).toBeVisible({timeout: 30000});

        // the SHELL owns the affordance; it renders in the PANE's chrome (the shellTools slot),
        // so the verb travels with the pane into a vessel — the bar carries only the
        // exception-only recall twin while the pane is away
        const toggle = page.locator('.fm-detail-window-toggle');

        await expect(toggle).toBeVisible();
        await expect(toggle).toContainText('Pop out detail');

        const cockpits = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id,
              details  = await app.findInstances({className: 'AgentOS.view.fleet.detail.Container'}, ['id']),
              detail0  = Array.isArray(details) ? details[0] : details,
              detailId = detail0?.id;

        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();
        expect(detailId, 'the AgentDetail must exist in the App Worker').toBeTruthy();

        const queryDetail = async () => {
            const matches = await app.queryComponent({className: 'AgentOS.view.fleet.detail.Container'}, ['record', 'id']);
            return (Array.isArray(matches) ? matches : [matches]).find(candidate => candidate?.id === detailId)
        };

        const queryVesselState = async () => {
            const matches = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['detailVesselState', 'id']);
            return (Array.isArray(matches) ? matches : [matches]).find(candidate => candidate?.id === holderId)?.properties?.detailVesselState
        };

        const drilledAgentId = (await queryDetail())?.properties?.record?.agentId;

        expect(drilledAgentId, 'the drill seated a resident record').toBeTruthy();
        expect(await queryVesselState()).toBe('docked');

        const topoDocked = await app.getDockTopology(holderId),
              docDocked  = topoDocked?.document ?? topoDocked;

        expect(docDocked.nodes['secondary-rail'].items).toContain('detail');

        const homeIndexBefore = docDocked.nodes['secondary-rail'].items.indexOf('detail');

        // 2) detach: ONE shell-toggle click opens the REAL vessel window
        const popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await toggle.click();

        const popup = await popupPromise;

        // assert the URL only after the vessel's content proves navigation happened: right after
        // the popup event, `domcontentloaded` can belong to the initial about:blank document and
        // url() reads '' — the pre-existing race the sibling journeys never hit because they wait
        // on a selector first
        await popup.waitForLoadState('domcontentloaded');
        await expect(popup.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        expect(popup.url()).toContain('childapps/widget/index.html');
        expect(popup.url()).toContain('cockpitId=');

        const popupErrors = [];

        popup.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && popupErrors.push(value)
        });

        // the SAME live instance renders in the popup; the main window no longer shows it
        await expect(popup.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-agent-detail')).toHaveCount(0);

        // the admission machine reached its settled windowed state
        await expect.poll(queryVesselState, {timeout: 15000}).toBe('windowed');
        await expect(toggle).toContainText('Reattach detail');

        // document truth while detached: out of the tree, still in the catalog
        const topoDetached = await app.getDockTopology(holderId),
              docDetached  = topoDetached?.document ?? topoDetached;

        expect(docDetached.nodes['secondary-rail'].items).not.toContain('detail');
        expect(docDetached.items.detail, 'detachItem keeps the catalog record').toBeTruthy();

        expect((await queryDetail())?.properties?.record?.agentId).toBe(drilledAgentId);

        // 3) live continuity: a MAIN-window drill re-renders the WINDOWED inspector —
        // one heap, two render targets, zero remounts
        const secondAgentId = cards
            .map(candidate => candidate?.properties?.record?.agentId)
            .find(agentId => agentId && agentId !== drilledAgentId);

        expect(secondAgentId, 'a second resident exists to drill into').toBeTruthy();
        await app.callMethod(controllerId, 'onAgentSelect', [{agentId: secondAgentId}]);

        await expect
            .poll(async () => (await queryDetail())?.properties?.record?.agentId, {
                message: 'the detached inspector must re-seat onto the newly selected resident',
                timeout: 15000
            })
            .not.toBe(drilledAgentId);

        const reseatedAgentId = (await queryDetail())?.properties?.record?.agentId;

        // the POPUP's DOM renders the re-seated resident — worker truth reached the second window
        await expect
            .poll(async () => (await popup.locator('.fm-detail-id').textContent())?.trim(), {timeout: 15000})
            .toBe(reseatedAgentId);

        // 4) reattach via the SAME shell toggle: the item re-trees at its EXACT remembered index,
        // the vessel closes as an effect, and the SAME instance renders docked with the state it
        // gathered while windowed
        const popupClosed = popup.waitForEvent('close', {timeout: 30000});

        await toggle.click();
        await popupClosed;

        await expect(page.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        await expect.poll(queryVesselState, {timeout: 15000}).toBe('docked');

        const topoHome = await app.getDockTopology(holderId),
              docHome  = topoHome?.document ?? topoHome;

        expect(docHome.nodes['secondary-rail'].items).toContain('detail');
        expect(docHome.nodes['secondary-rail'].items.indexOf('detail'), 'exact-index restore — never an append').toBe(homeIndexBefore);

        const home      = await app.findInstances({className: 'AgentOS.view.fleet.detail.Container'}, ['id']),
              homeIds   = (Array.isArray(home) ? home : [home]).map(entry => entry?.id),
              homeState = await queryDetail();

        expect(homeIds, 'exactly one AgentDetail instance exists — never a recreation').toEqual([detailId]);
        expect(homeState?.properties?.record?.agentId, 'the windowed-phase selection came home with the instance').toBe(reseatedAgentId);

        expect(pageErrors, 'zero main-window page errors').toEqual([]);
        expect(popupErrors, 'zero popup page errors').toEqual([])
    })
});
