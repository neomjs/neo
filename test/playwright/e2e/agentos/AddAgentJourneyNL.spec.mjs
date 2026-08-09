import {test, expect}           from '../../fixtures.mjs';
import {NeuralLink_DataService} from '../../../../ai/services.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    reloadRoster,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const
    TEST_AGENT_ID   = 'nl-journey-agent',
    TEST_CREDENTIAL = 'github_pat_NL_JOURNEY_WITNESS_1234abcd';

const WIRED_SOURCES = {
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
};

/**
 * @summary Start a STATEFUL recording loopback Fleet bridge — the registry double for the whole S5
 * journey. The roster begins authoritative-EMPTY (`{rows: []}` — the resolved-Array shape that
 * retires the sample seed, so the TRUE zero state and its bootstrap CTA render); `defineAgent`
 * graduates the agent into the roster; `startAgent` flips its lifecycle to running. Every state
 * the Body renders is REGISTRY truth pulled through `fleetRoster` — never an optimistic client flip.
 * @returns {Promise<{close: Function, endpoint: String, requests: Object[], bearerToken: String}>}
 */
async function startJourneyFleetBridge() {
    const
        {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
        requests                 = [],
        defined                  = [],
        running                  = new Set();

    const rosterRow = agent => ({
        id         : agent.id,
        displayName: agent.githubUsername,
        engineTag  : agent.harnessType,
        family     : 'claude',
        avatarUrl  : '',
        lifecycle  : {source: 'fleet:runtimeStatus', state: running.has(agent.id) ? 'running' : 'stopped', confidence: 'observed'},
        sources    : WIRED_SOURCES
    });

    const options = authenticatedFleetOptions({
        dispatch: async request => {
            requests.push(request);

            if (request.method === 'defineAgent') {
                const
                    {githubUsername, harnessType} = request.params ?? {},
                    agent                         = {id: TEST_AGENT_ID, githubUsername, harnessType, updatedAt: '2026-07-18T00:00:00.000Z'};

                defined.push(agent);

                return fleetE2ESuccess(agent)
            }

            if (request.method === 'startAgent') {
                running.add(request.params);
                return fleetE2ESuccess({id: request.params, state: 'running'})
            }

            if (request.method === 'fleetRoster') {
                return fleetE2ESuccess({rows: defined.map(rosterRow)})
            }

            if (request.method === 'fleetActivity') {
                return fleetE2ESuccess({capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'}, events: []})
            }

            if (['listAgents', 'fleetStatus', 'fleetRuntimeStatus'].includes(request.method)) {
                return fleetE2ESuccess([])
            }

            return fleetE2EFailure(`fleet: unexpected test method '${request.method}'`)
        }
    });

    const server = await startFleetBridgeServer(options);

    return {
        requests,
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

/**
 * @summary The S5 add-agent journey on the REAL mounted composition (the close-target's NL
 * witness), driven the way an operator drives it: the authoritative-empty roster renders the
 * bootstrap CTA → the CTA reveals the auto-hidden S5 zone through the committed dock document →
 * the form's bridge round-trip lands the canonical readback (the only Body truth) → the accepted
 * definition graduates into the re-polled roster and the CTA self-retires → the restored positive
 * lifecycle witness Starts the new resident through the authenticated bridge, and Body state
 * advances only via re-polled registry truth. The credential crosses the wire exactly once.
 */
test.describe('AgentOS S5 add-agent journey (Neural Link)', () => {
    test.setTimeout(120000);

    // pinned geometry: the reviewer's falsifier environment (and a realistic short laptop
    // viewport) — the witness must hold where the zone has LESS height than the form wants,
    // not only on tall local screens. The zone scrolls; the journey must survive that.
    test.use({viewport: {width: 1280, height: 720}});

    test('bootstrap CTA → S5 zone → readback-confirmed → roster graduation + CTA retirement → Start', async ({page, neuralLink}) => {
        const fleet = await startJourneyFleetBridge();

        try {
            await page.goto('/apps/agentos/index.html');
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            // fail-closed boot → bearer through the worker-realm product injector → sanctioned re-poll
            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});
            await reloadRoster(app);

            // the authoritative-EMPTY snapshot replaced the sample seed: the TRUE zero state — and
            // with it the S5 bootstrap CTA, the empty fleet's one path to its first agent
            await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 0 agents', {timeout: 30000});

            const cta = page.locator('.fm-fleet-empty-cta');
            await expect(cta).toBeVisible();

            // the CTA reveals the auto-hidden S5 zone through the committed dock document (the
            // onAgentSelect reveal precedent) — the form becomes directly visible, no rail hunting
            await cta.click();
            await expect(page.locator('.fm-add-agent-form')).toBeVisible({timeout: 30000});

            // honest gating: with the bridge wired, submit is a live affordance
            const submit = page.locator('.fm-add-submit');
            await expect(submit).toBeEnabled();

            await page.locator('.fm-add-agent-form input[type="text"]').fill(TEST_AGENT_ID);
            await page.locator('.fm-add-agent-form input[type="password"]').fill(TEST_CREDENTIAL);
            await submit.click();

            // readback-confirmed renders as the terminal status — no optimistic success wording
            await expect(page.locator('.fm-add-status.is-readback-confirmed')).toBeVisible({timeout: 15000});

            // the settle rule on the REAL surface: the PAT field is empty after the round-trip
            await expect(page.locator('.fm-add-agent-form input[type="password"]')).toHaveValue('');

            // the accepted readback graduates the agent into the ROSTER (the Viewport routes the
            // event; the cockpit re-polls the registry) — and the count-0-only CTA self-retires
            await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 1 agents', {timeout: 30000});

            const card = page.locator('.fm-fleet-cards .fm-agent-card');
            await expect(card).toHaveCount(1);
            await expect(page.locator('.fm-fleet-empty-cta')).toHaveCount(0);

            // ── the restored positive lifecycle witness (the retired Control-panel spec's essence,
            // re-aimed at the surviving card path): Start crosses the authenticated bridge as the
            // minimal payload, and Body state advances only via re-polled REGISTRY truth
            const toggle = card.locator('.fm-card-control-verbs button').first();
            await expect(toggle.locator('.fa-play')).toBeVisible(); // stopped → the Start affordance

            await toggle.click();

            // the registry flipped to running; refreshRosterOnSettle re-polled; the card renders live truth
            await expect(toggle.locator('.fa-stop')).toBeVisible({timeout: 15000});
            await expect(card.locator('.fm-card-control-status')).not.toBeVisible();

            const starts = fleet.requests.filter(request => request.method === 'startAgent');
            expect(starts).toHaveLength(1);
            expect(starts[0]).toEqual({method: 'startAgent', params: TEST_AGENT_ID});

            // ── wire discipline: exactly one defineAgent carried the payload — and the credential
            // exists NOWHERE else: not in another request, not in any readback we injected
            const defines = fleet.requests.filter(request => request.method === 'defineAgent');
            expect(defines).toHaveLength(1);
            expect(defines[0].params).toMatchObject({githubUsername: TEST_AGENT_ID, credential: TEST_CREDENTIAL});
            expect(JSON.stringify(fleet.requests.filter(request => request.method !== 'defineAgent'))).not.toContain(TEST_CREDENTIAL);

            // ── the Body-side truths, read through the Neural Link
            const stores = await NeuralLink_DataService.listStores({sessionId: app.sessionId});

            // 1) the canonical definition row — credential-free by construction
            const defsStore = stores.stores.find(candidate => candidate.model === 'AgentOS.model.AgentDefinition');
            expect(defsStore, 'AgentDefinitions store should be registered in the App Worker').toBeTruthy();

            const defs = await NeuralLink_DataService.inspectStore({sessionId: app.sessionId, storeId: defsStore.id, limit: 10}),
                  row  = defs.items.find(item => item.id === TEST_AGENT_ID);

            expect(row).toBeTruthy();
            expect(row.githubUsername).toBe(TEST_AGENT_ID);
            expect(JSON.stringify(row)).not.toContain(TEST_CREDENTIAL);

            // 2) the roster record advanced to running through the re-poll — registry truth in Body state
            const rosterStore = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent');
            expect(rosterStore, 'the FleetRoster store should be registered in the App Worker').toBeTruthy();

            const roster   = await NeuralLink_DataService.inspectStore({sessionId: app.sessionId, storeId: rosterStore.id, limit: 10}),
                  resident = roster.items.find(item => item.agentId === TEST_AGENT_ID);

            expect(resident).toBeTruthy();
            expect(resident.state).toBe('ok');
            expect(resident.pendingAction ?? null).toBeNull();
            expect(resident.controlReason ?? null).toBeNull();
            expect(JSON.stringify(resident)).not.toContain(TEST_CREDENTIAL)
        } finally {
            await fleet.close()
        }
    });
});
