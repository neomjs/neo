import {test, expect} from '../../fixtures.mjs';
import {
    NeuralLink_DataService,
    NeuralLink_InstanceService
} from '../../../../ai/services.mjs';
import {FLEET_WIRE_METHODS} from '../../../../src/ai/fleet/fleetWireMethods.mjs';
import {authenticatedFleetOptions, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const TEST_AGENT_ID = 'nl-proof-agent';

/**
 * @summary Start a recording loopback Fleet bridge on the same URL `apps/agentos` installs at boot.
 * The app still uses the production `installFleetBridge` / `createFleetRegistryBridge` client; this
 * server only replaces the Brain-side transport target for deterministic e2e assertions.
 * @param {Object} [options]
 * @param {Boolean} [options.rejectStart=false]
 * @returns {Promise<{close: Function, endpoint: String, requests: Object[]}>}
 */
async function startRecordingFleetBridge({rejectStart = false} = {}) {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
          requests                 = [],
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  if (request.method === 'startAgent') {
                      return rejectStart
                          ? {ok: false, error: 'fleet: start rejected by test bridge'}
                          : {ok: true, result: {id: request.params, state: 'running'}}
                  }

                  if (request.method === 'stopAgent') {
                      return {ok: true, result: {id: request.params, state: 'stopped'}}
                  }

                  if (request.method === 'restartAgent') {
                      return {ok: true, result: {id: request.params, state: 'running'}}
                  }

                  if (request.method === 'listAgents' || request.method === 'fleetStatus' || request.method === 'fleetRuntimeStatus') {
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
 * @summary Resolve the AgentOS roster store by semantic model, never by generated runtime id.
 * @param {String} sessionId
 * @returns {Promise<String>}
 */
async function getAgentDefinitionsStoreId(sessionId) {
    const stores = await NeuralLink_DataService.listStores({sessionId}),
          store  = stores.stores.find(candidate => candidate.model === 'AgentOS.model.AgentDefinition');

    expect(store, 'AgentDefinitions store should be registered in the App Worker').toBeTruthy();

    return store.id
}

/**
 * @summary Read a public fleet roster row from the App Worker store.
 * @param {String} sessionId
 * @param {String} storeId
 * @param {String} agentId
 * @returns {Promise<Object|undefined>}
 */
async function getAgentRow(sessionId, storeId, agentId) {
    const store = await NeuralLink_DataService.inspectStore({sessionId, storeId, limit: 10});

    return store.items.find(item => item.id === agentId)
}

/**
 * @summary Seed the public Body-side roster through Neural Link without ever crossing a credential.
 * @param {String} sessionId
 * @param {String} storeId
 * @returns {Promise<void>}
 */
async function seedPublicAgentRow(sessionId, storeId) {
    await NeuralLink_InstanceService.callMethod({
        sessionId,
        id    : storeId,
        method: 'add',
        args  : [{
            id             : TEST_AGENT_ID,
            githubUsername : TEST_AGENT_ID,
            harnessType    : 'codex',
            credentialState: 'stored-node-side',
            lifecycleState : 'defined',
            statusText     : 'Seeded public roster row for NL proof; no credential field.',
            updatedAt      : '2026-07-04T00:00:00.000Z'
        }]
    })
}

/**
 * @summary Assert the lifecycle click crossed the fleet wire as the minimal agent-id operation.
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
 * @summary The lifecycle bridge calls only. Since the Fleet cockpit became the default keeper-view, its
 * always-on activity stream (`FleetCockpit.loadActivity` -> `fleetActivity`) fires a read-observe poll on
 * boot. That poll is orthogonal to a lifecycle verb and must not be counted when asserting that a
 * Control-panel click crosses the wire as exactly one minimal lifecycle operation.
 * @param {Object[]} requests
 * @returns {Object[]}
 */
function lifecycleRequestsOnly(requests) {
    return requests.filter(request => ['startAgent', 'stopAgent', 'restartAgent'].includes(request.method))
}

test.describe('AgentOS Fleet cockpit lifecycle controls (Neural Link)', () => {
    test.setTimeout(90000);

    test('drives Start through the UI and verifies App Worker state + minimal bridge payload', async ({page, neuralLink}) => {
        const fleet = await startRecordingFleetBridge();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            // fail-closed boot -> bearer through the worker-realm product injector
            await wireAuthenticatedFleetBridge({app: await neuralLink.connectToApp('AgentOS'), fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            // the FleetSettingsPanel lifecycle surface is the 'Control' keeper-view in the shell rail
            await page.locator('.agent-shell').getByText('Control', {exact: true}).click();
            await expect(page.locator('.agent-panel-settings')).toBeVisible({timeout: 30000});

            // Use the fixture to own bridge startup and bind to this page's App Worker id.
            // Raw app-name session lookup can pick an older same-name session.
            expect(neuralLink.bridgePort).toBeGreaterThan(0);

            const app       = await neuralLink.connectToApp('AgentOS'),
                  sessionId = app.sessionId,
                  panels    = await app.queryComponent(
                      {className: 'AgentOS.view.FleetSettingsPanel'},
                      ['id', 'className', 'reference', 'windowId']
                  ),
                  buttons   = await app.queryComponent(
                      {ntype: 'button'},
                      ['id', 'text', 'handler']
                  ),
                  storeId   = await getAgentDefinitionsStoreId(sessionId);

            expect(panels).toHaveLength(1);
            expect(buttons.map(button => button.properties.text)).toEqual(expect.arrayContaining([
                'Start',
                'Stop',
                'Restart'
            ]));

            await seedPublicAgentRow(sessionId, storeId);

            const seeded = await getAgentRow(sessionId, storeId, TEST_AGENT_ID);
            expect(seeded.credential).toBeUndefined();
            expect(seeded.pat).toBeUndefined();
            expect(seeded.token).toBeUndefined();

            await page.getByRole('button', {name: 'Start', exact: true}).click();

            await expect.poll(
                () => getAgentRow(sessionId, storeId, TEST_AGENT_ID).then(row => row?.lifecycleState),
                {message: 'Start should update the App Worker roster row through the Fleet bridge', timeout: 15000}
            ).toBe('running');

            const row = await getAgentRow(sessionId, storeId, TEST_AGENT_ID);
            expect(row.statusText).toBe(`Agent ${TEST_AGENT_ID} → running.`);
            const lifecycle = lifecycleRequestsOnly(fleet.requests);
            expect(lifecycle).toHaveLength(1);
            expectMinimalLifecyclePayload(lifecycle[0])
        } finally {
            await fleet.close()
        }
    });

    test('reflects a rejected bridge call as an error without sending credentials', async ({page, neuralLink}) => {
        const fleet = await startRecordingFleetBridge({rejectStart: true});

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

            // fail-closed boot -> bearer through the worker-realm product injector
            await wireAuthenticatedFleetBridge({app: await neuralLink.connectToApp('AgentOS'), fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            // the FleetSettingsPanel lifecycle surface is the 'Control' keeper-view in the shell rail
            await page.locator('.agent-shell').getByText('Control', {exact: true}).click();
            await expect(page.locator('.agent-panel-settings')).toBeVisible({timeout: 30000});
            expect(neuralLink.bridgePort).toBeGreaterThan(0);

            const app       = await neuralLink.connectToApp('AgentOS'),
                  sessionId = app.sessionId,
                  storeId   = await getAgentDefinitionsStoreId(sessionId);

            await seedPublicAgentRow(sessionId, storeId);
            await page.getByRole('button', {name: 'Start', exact: true}).click();

            await expect.poll(
                () => getAgentRow(sessionId, storeId, TEST_AGENT_ID).then(row => row?.lifecycleState),
                {message: 'Rejected bridge calls should surface as App Worker error state', timeout: 15000}
            ).toBe('error');

            const row = await getAgentRow(sessionId, storeId, TEST_AGENT_ID);
            expect(row.statusText).toBe('fleet: start rejected by test bridge');
            const lifecycle = lifecycleRequestsOnly(fleet.requests);
            expect(lifecycle).toHaveLength(1);
            expectMinimalLifecyclePayload(lifecycle[0])
        } finally {
            await fleet.close()
        }
    })
});
