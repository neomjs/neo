import {test, expect}                                            from '../../fixtures.mjs';
import {NeuralLink_DataService}                                  from '../../../../ai/services.mjs';
import {authenticatedFleetOptions, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const
    TEST_AGENT_ID   = 'nl-journey-agent',
    TEST_CREDENTIAL = 'github_pat_NL_JOURNEY_WITNESS_1234abcd';

/**
 * @summary Start a recording loopback Fleet bridge whose `defineAgent` returns the canonical
 * public readback — the only success truth the S5 surface accepts. Roster-shaped reads return
 * empty (this journey witnesses the DEFINE path; the roster wave owns live rows).
 * @returns {Promise<{close: Function, endpoint: String, requests: Object[], bearerToken: String}>}
 */
async function startDefineCapableFleetBridge() {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
          requests                 = [],
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  if (request.method === 'defineAgent') {
                      const {githubUsername, harnessType} = request.params ?? {};

                      return {ok: true, result: {
                          id       : TEST_AGENT_ID,
                          githubUsername,
                          harnessType,
                          updatedAt: '2026-07-18T00:00:00.000Z'
                      }}
                  }

                  if (['listAgents', 'fleetStatus', 'fleetRuntimeStatus', 'fleetRoster', 'fleetActivity'].includes(request.method)) {
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
 * @summary The S5 add-agent journey on the REAL mounted surface (the close-target's NL witness):
 * rail zone → form → bridge round-trip → readback-confirmed — with the canonical readback as the
 * only thing that lands in Body state, and the credential traveling exactly once (the defineAgent
 * request), never echoed into any store row or status surface.
 */
test.describe('AgentOS S5 add-agent journey (Neural Link)', () => {
    test.setTimeout(120000);

    test('rail zone → form → readback-confirmed: the canonical readback is the only Body truth', async ({page, neuralLink}) => {
        const fleet = await startDefineCapableFleetBridge();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            // fail-closed boot → bearer through the worker-realm product injector
            await wireAuthenticatedFleetBridge({app: await neuralLink.connectToApp('AgentOS'), fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            // the S5 zone is rail chrome (invoked-not-ambient): open it via its rail tab
            await page.locator('.agent-shell').getByText('Add agent', {exact: true}).click();
            await expect(page.locator('.fm-add-agent-form')).toBeVisible({timeout: 30000});

            // the flow's honest gating: with the bridge wired, submit is a live affordance
            const submit = page.locator('.fm-add-submit');
            await expect(submit).toBeEnabled();

            await page.locator('.fm-add-agent-form input[type="text"]').fill(TEST_AGENT_ID);
            await page.locator('.fm-add-agent-form input[type="password"]').fill(TEST_CREDENTIAL);
            await submit.click();

            // readback-confirmed renders as the terminal status — no optimistic success wording
            await expect(page.locator('.fm-add-status.is-readback-confirmed')).toBeVisible({timeout: 15000});

            // the settle rule on the REAL surface: the PAT field is empty after the round-trip
            await expect(page.locator('.fm-add-agent-form input[type="password"]')).toHaveValue('');

            // exactly one defineAgent crossed the wire, carrying the payload — and the credential
            // exists NOWHERE else: not in another request, not in the readback we injected
            const defines = fleet.requests.filter(request => request.method === 'defineAgent');
            expect(defines).toHaveLength(1);
            expect(defines[0].params).toMatchObject({githubUsername: TEST_AGENT_ID, credential: TEST_CREDENTIAL});
            expect(JSON.stringify(fleet.requests.filter(request => request.method !== 'defineAgent'))).not.toContain(TEST_CREDENTIAL);

            // the Body-side truth is the canonical readback row — credential-free by construction
            const
                app       = await neuralLink.connectToApp('AgentOS'),
                stores    = await NeuralLink_DataService.listStores({sessionId: app.sessionId}),
                defsStore = stores.stores.find(candidate => candidate.model === 'AgentOS.model.AgentDefinition');

            expect(defsStore, 'AgentDefinitions store should be registered in the App Worker').toBeTruthy();

            const store = await NeuralLink_DataService.inspectStore({sessionId: app.sessionId, storeId: defsStore.id, limit: 10}),
                  row   = store.items.find(item => item.id === TEST_AGENT_ID);

            expect(row).toBeTruthy();
            expect(row.githubUsername).toBe(TEST_AGENT_ID);
            expect(JSON.stringify(row)).not.toContain(TEST_CREDENTIAL)
        } finally {
            await fleet.close()
        }
    });
});
