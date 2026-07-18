import {test, expect}                                                          from '../../fixtures.mjs';
import {NeuralLink_DataService}                                                from '../../../../ai/services.mjs';
import {FLEET_WIRE_METHODS}                                                    from '../../../../src/ai/fleet/fleetWireMethods.mjs';
import {authenticatedFleetOptions, reloadRoster, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const TEST_AGENT_ID = 'nl-lifecycle-agent';

const WIRED_SOURCES = {
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
};

/**
 * @summary One production-shaped roster DTO row for the lifecycle witness — wired sources (the
 * card gates its controls on a wired runtime; an unwired row renders disabled controls and the
 * test dies honestly) with the lifecycle state the registry double currently holds.
 * @param {String} state `'stopped'` | `'running'` — the registry-side lifecycle truth.
 * @returns {Object}
 */
function rosterRow(state) {
    return {
        id         : TEST_AGENT_ID,
        displayName: 'Lifecycle Witness',
        engineTag  : 'fixture',
        family     : 'claude',
        avatarUrl  : '',
        lifecycle  : {source: 'fleet:runtimeStatus', state, confidence: 'observed'},
        sources    : WIRED_SOURCES
    }
}

/**
 * @summary Start a STATEFUL recording loopback Fleet bridge serving ONE stopped resident. A
 * successful `startAgent` flips the registry-side lifecycle to running, so the cockpit's
 * settle-time re-poll renders REGISTRY truth — never an optimistic client flip. `rejectStart`
 * makes the start verb answer a deterministic domain rejection instead (registry state untouched).
 * @param {Object} [options]
 * @param {Boolean} [options.rejectStart=false]
 * @returns {Promise<{close: Function, endpoint: String, requests: Object[], bearerToken: String}>}
 */
async function startLifecycleFleetBridge({rejectStart = false} = {}) {
    const
        {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
        requests                 = [],
        running                  = new Set();

    const options = authenticatedFleetOptions({
        dispatch: async request => {
            requests.push(request);

            if (request.method === 'startAgent') {
                if (rejectStart) {
                    return {ok: false, error: 'fleet: start rejected by lifecycle witness'}
                }

                running.add(request.params);
                return {ok: true, result: {id: request.params, state: 'running'}}
            }

            if (request.method === 'fleetRoster') {
                return {ok: true, result: {rows: [rosterRow(running.has(TEST_AGENT_ID) ? 'running' : 'stopped')]}}
            }

            if (request.method === 'fleetActivity') {
                return {ok: true, result: {capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'}, events: []}}
            }

            if (['listAgents', 'fleetStatus', 'fleetRuntimeStatus'].includes(request.method)) {
                return {ok: true, result: []}
            }

            return {ok: false, error: `fleet: unexpected test method '${request.method}'`}
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
 * @summary The retired panel spec's minimal-payload contract, re-homed onto the card path: a
 * lifecycle click crosses the fleet wire as the minimal agent-id operation — a registered wire
 * method carrying ONE string param, with no credential-shaped bytes.
 * @param {Object} request The recorded loopback fleet request.
 */
function expectMinimalLifecyclePayload(request) {
    expect(FLEET_WIRE_METHODS).toContain(request.method);
    expect(request).toEqual({
        method: 'startAgent',
        params: TEST_AGENT_ID
    });
    expect(typeof request.params).toBe('string');
    expect(JSON.stringify(request.params)).not.toMatch(/credential|pat|token/i)
}

/**
 * @summary Boot the app against the loopback, wire the authenticated bridge through the
 * worker-realm product injector, re-poll, and wait for the single wired resident to render.
 * @param {Object} page
 * @param {Object} neuralLink
 * @param {Object} fleet The running loopback bridge.
 * @returns {Promise<Object>} The Neural Link app handle.
 */
async function bootWiredCockpit(page, neuralLink, fleet) {
    await page.goto('/apps/agentos/index.html');
    await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
    await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

    // fail-closed boot → bearer through the worker-realm product injector → sanctioned re-poll
    const app = await neuralLink.connectToApp('AgentOS');
    await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});
    await reloadRoster(app);

    await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 1 agents', {timeout: 30000});
    await expect(page.locator('.fm-fleet-cards .fm-agent-card')).toHaveCount(1);

    return app
}

/**
 * @summary Read the mounted grid's bound FleetRoster record for the witness resident through the
 * Neural Link — the Body-side truth the assertions close on.
 * @param {Object} app The Neural Link app handle.
 * @returns {Promise<Object|undefined>}
 */
async function getRosterRecord(app) {
    const
        stores      = await NeuralLink_DataService.listStores({sessionId: app.sessionId}),
        rosterStore = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent');

    expect(rosterStore, 'the FleetRoster store should be registered in the App Worker').toBeTruthy();

    const snapshot = await NeuralLink_DataService.inspectStore({sessionId: app.sessionId, storeId: rosterStore.id, limit: 10});

    return snapshot.items.find(item => item.agentId === TEST_AGENT_ID)
}

/**
 * @summary The card-path lifecycle contract on the REAL mounted composition (the define-agent
 * rebuild re-homed the lifecycle surface onto the cards; the retired Control-panel NL specs died
 * with their subject and this spec is the card path's own witness): the B4 control-toggle →
 * `lifecycleIntent` → the C2
 * adapter → the authenticated bridge — minimal wire payload, registry-truth state advance on
 * success, honest terminal rendering + open retry on rejection, and no credential-shaped bytes on
 * any lifecycle request.
 */
test.describe('AgentOS fleet card lifecycle controls (Neural Link)', () => {
    test.setTimeout(90000);

    test('happy path: the card toggle Starts through the wire; Body state advances only via re-polled registry truth', async ({page, neuralLink}) => {
        const fleet = await startLifecycleFleetBridge();

        try {
            const app = await bootWiredCockpit(page, neuralLink, fleet);

            const
                card   = page.locator('.fm-fleet-cards .fm-agent-card'),
                toggle = card.locator('.fm-card-control-verbs button').first();

            // stopped + wired runtime → the Start affordance (one contextual power toggle)
            await expect(toggle.locator('.fa-play')).toBeVisible();

            await toggle.click();

            // the registry flipped to running; the settle re-poll rendered REGISTRY truth: the
            // toggle is now Stop, and no pending/reason residue survives the settled round-trip
            await expect(toggle.locator('.fa-stop')).toBeVisible({timeout: 15000});
            await expect(card.locator('.fm-card-control-status')).not.toBeVisible();

            // exactly one minimal lifecycle operation crossed the wire
            const starts = fleet.requests.filter(request => request.method === 'startAgent');
            expect(starts).toHaveLength(1);
            expectMinimalLifecyclePayload(starts[0]);

            // the Body-side record landed the re-polled state — settled, honest, credential-free
            const record = await getRosterRecord(app);
            expect(record).toBeTruthy();
            expect(record.state).toBe('ok');
            expect(record.pendingAction ?? null).toBeNull();
            expect(record.controlReason ?? null).toBeNull();

            // credential hygiene across EVERY recorded lifecycle-window request
            expect(JSON.stringify(fleet.requests)).not.toMatch(/credential|github_pat|bearer/i)
        } finally {
            await fleet.close()
        }
    });

    test('rejected path: the reason renders on the card, no fake success, and the retry stays open', async ({page, neuralLink}) => {
        const fleet = await startLifecycleFleetBridge({rejectStart: true});

        try {
            const app = await bootWiredCockpit(page, neuralLink, fleet);

            const
                card   = page.locator('.fm-fleet-cards .fm-agent-card'),
                toggle = card.locator('.fm-card-control-verbs button').first();

            await expect(toggle.locator('.fa-play')).toBeVisible();

            await toggle.click();

            // the honest terminal render: the domain rejection's kind + reason, verbatim — never a
            // fake success, never a silent swallow
            await expect(card.locator('.fm-card-control-status')).toContainText(
                '⚠ rejected: fleet: start rejected by lifecycle witness', {timeout: 15000}
            );

            // no success-driven re-poll fired: the registry was never mutated, so the card still
            // renders the stopped truth with the retry affordance OPEN (enabled Start toggle)
            await expect(toggle.locator('.fa-play')).toBeVisible();
            await expect(toggle).toBeEnabled();

            // the attempt crossed the wire exactly once, still minimal
            const starts = fleet.requests.filter(request => request.method === 'startAgent');
            expect(starts).toHaveLength(1);
            expectMinimalLifecyclePayload(starts[0]);

            // Body-side truth: state unchanged, the terminal reason held on the record (kind +
            // action), pending cleared — the applyRecord matrix's terminal-kind contract
            const record = await getRosterRecord(app);
            expect(record).toBeTruthy();
            expect(record.state).toBe('off');
            expect(record.pendingAction ?? null).toBeNull();
            expect(record.controlReason).toMatchObject({action: 'start', kind: 'rejected'});

            expect(JSON.stringify(fleet.requests)).not.toMatch(/credential|github_pat|bearer/i)
        } finally {
            await fleet.close()
        }
    });
});
