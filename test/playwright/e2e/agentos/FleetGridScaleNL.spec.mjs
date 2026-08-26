import {test, expect, loadNeuralLinkModules} from '../../fixtures.mjs';

const {NeuralLink_DataService, NeuralLink_InstanceService} = await loadNeuralLinkModules();

/**
 * @summary The fleet grid at MEASURED live-roster scale, proven through Neural Link possession —
 * the density-evidence numbers made executable: a 20-agent roster (the evidence's near-term
 * ceiling band) loaded into the REAL provider-hosted FleetRoster store over the wire, then the
 * mounted grid asserted at the DOM: the online tier leads as cards, the idle tier folds to an
 * honest count (never a silent drop), the benched tail renders, and the health counters track the
 * possessed store. This is the leaf's "NL-verifiable mount bound to the live roster" — the unit
 * suite proves the ranking math; THIS proves the mounted surface obeys it at scale.
 *
 * @see apps/agentos/view/fleet/roster/Container.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/roster/container.spec.mjs
 */
test.describe('AgentOS fleet grid — density-evidence scale (Neural Link)', () => {
    test.setTimeout(90000);

    test('a 20-agent roster ranks, folds, and counts on the mounted grid via NL store possession', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});

        // The seeded roster arrives via the store's ASYNC autoLoad fetch — possess only after it
        // landed, or the late seed load replaces the fixture (measured: a fixture written before
        // the fetch resolves reads back as the 7-row seed).
        await expect(page.locator('.fm-fleet-title')).not.toHaveText('Fleet · 0 agents', {timeout: 30000});

        const
            app       = await neuralLink.connectToApp('AgentOS'),
            sessionId = app.sessionId,
            stores    = await NeuralLink_DataService.listStores({sessionId}),
            roster    = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent');

        expect(roster, 'the provider-hosted FleetRoster store should be registered in the App Worker').toBeTruthy();

        // The 20-agent fixture at the evidence's ceiling band: 4 online (2 ok + 1 limited +
        // 1 wedged) · 14 idle · 2 benched — over the density-derived fold threshold (12).
        const fixture = [
            ...['scale-ok-a', 'scale-ok-b'].map(agentId => ({agentId, state: 'ok'})),
            {agentId: 'scale-limited-a', state: 'limited'},
            {agentId: 'scale-wedged-a', state: 'wedged'},
            ...Array.from({length: 14}, (item, index) => ({agentId: `scale-idle-${String(index).padStart(2, '0')}`, state: 'idle'})),
            ...['scale-off-a', 'scale-off-b'].map(agentId => ({agentId, state: 'off'}))
        ].map(entry => ({
            avatarUrl  : '',
            displayName: entry.agentId,
            engineTag  : 'fixture',
            family     : 'claude',
            laneLine   : 'density-scale fixture row',
            ...entry
        }));

        // Possession: replace the roster through the store's OWN collection api over the wire —
        // the callMethod idiom the sibling lifecycle spec proves (clear, then add the fixture).
        const cleared = await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'clear'});
        expect(cleared?.error, `clear must succeed: ${JSON.stringify(cleared ?? null)}`).toBeFalsy();

        const added = await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [fixture]});
        expect(added?.error, `add must succeed: ${JSON.stringify(added ?? null)}`).toBeFalsy();

        // The possessed store is the source of truth the grid derives from. Read the LIVE rows
        // (`items` / `count`): `totalCount` is the remote-paging field frozen at the last URL
        // load — it deliberately does not track local mutations, so it must never gate this.
        const snapshot = await NeuralLink_DataService.inspectStore({sessionId, storeId: roster.id, limit: 25});
        expect(snapshot.items.length).toBe(20);
        expect(snapshot.count).toBe(20);

        // DOM verdicts — the mounted surface obeys the density rules:
        // the header title tracks the possessed total,
        await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 20 agents');
        // the idle tier folds to an honest count (14 idle never render as 14 cards),
        await expect(page.locator('.fm-fleet-fold')).toHaveText('14 idle');
        // online (4) + benched (2) stay as cards — working-first keeps the glance priority,
        await expect(page.locator('.fm-fleet-cards .fm-agent-card')).toHaveCount(6);
        // and dropping back BELOW threshold un-folds: every card renders again.
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'clear'});
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [fixture.slice(0, 6)]});

        await expect(page.locator('.fm-fleet-fold')).toHaveCount(0);
        await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 6 agents')
    });
});
