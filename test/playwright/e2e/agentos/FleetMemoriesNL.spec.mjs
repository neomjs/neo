import {expect, test}                                            from '../../fixtures.mjs';
import {authenticatedFleetOptions, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const
    CAPTURED_AT = '2026-08-02T12:00:00.000Z',
    CURSOR      = {timestamp: '2026-08-02T10:00:00.000Z', id: 'turn-1'};

const rosterRows = [
    {id: 'ada', githubUsername: 'neo-opus-ada', displayName: 'Ada', engineTag: 'fixture', family: 'claude'}
];

/**
 * @summary One fixture envelope per page, exactly the `fleetMemories` source contract: the newest
 * page carries two rows (one honest fallback summary) and a cursor; the `before` continuation
 * carries the older row whose summary is a NON-STRING — the vocabulary-collision class the model
 * boundary must name instead of coercing to `[object Object]`.
 * @param {Object} params
 * @returns {Object}
 */
function memoriesResult(params = {}) {
    const
        target = params.agentIdentity,
        shared = {
            viewer    : '@e2e-operator',
            target,
            projection: target === '@e2e-operator' ? 'private' : 'public'
        };

    if (params.before) {
        return {
            capability: {state: 'wired', capturedAt: CAPTURED_AT},
            ...shared,
            page : {before: params.before, limit: 20},
            turns: [
                {id: 'turn-0', sessionId: '36ea85e4-fcdc', timestamp: '2026-08-02T09:00:00.000Z', summary: {payload: 'not a string'}, summaryFallback: false}
            ],
            count     : 1,
            nextCursor: null
        }
    }

    return {
        capability: {state: 'wired', capturedAt: CAPTURED_AT},
        ...shared,
        page : {before: null, limit: 20},
        turns: [
            {id: 'turn-2', sessionId: '9286a9c0-91be', timestamp: '2026-08-02T11:00:00.000Z', summary: 'Wake axes merged after two review cycles', summaryFallback: false},
            {id: 'turn-1', sessionId: '9286a9c0-91be', timestamp: '2026-08-02T10:00:00.000Z', summary: 'Stall telltales calibrated from live measurement', summaryFallback: true}
        ],
        count     : 2,
        nextCursor: CURSOR
    }
}

async function startMemoriesFleet() {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
          requests                 = [],
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  switch (request.method) {
                      case 'resolveViewerIdentity':
                          return {ok: true, result: {ok: true, agentIdentityNodeId: '@e2e-operator'}};
                      case 'fleetRoster':
                          return {ok: true, result: {rows: rosterRows}};
                      case 'fleetActivity':
                          return {ok: true, result: {capability: {state: 'wired'}, events: []}};
                      case 'fleetMemories':
                          return {ok: true, result: memoriesResult(request.params)};
                      case 'getBootIdentity':
                          return {ok: true, result: {fact: null, classification: 'unknown', advisory: true}};
                      default:
                          return {ok: false, error: `unexpected memories method: ${request.method}`}
                  }
              }
          }),
          server                   = await startFleetBridgeServer(options);

    return {
        requests,
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

/**
 * @summary Native Fleet memories journey: the real auto-hide rail invokes the pane; choosing an
 * agent is the explicit first act; the App Worker crosses the authenticated allowlisted bridge;
 * the envelope's rows render with honest per-row fallback naming; the cursor pages older turns as
 * an append; and the wire carries only the explicit target — never a viewer claim, never a
 * caller-chosen projection.
 *
 * Run: NEO_E2E_PORT=49223 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetMemoriesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet memories — authenticated rail journey (#16398)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 1000}});

    test('rail → explicit agent choice → turn rows → cursor append → guarded non-string summary', async ({page, neuralLink}) => {
        const fleet = await startMemoriesFleet();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            const [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']);
            expect(cockpit?.properties?.id).toBeTruthy();
            await app.callMethod(cockpit.properties.id, 'loadRoster');

            const rail = page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Memories'});
            await expect(rail).toHaveCount(1);
            await rail.click();

            const pane = page.locator('.fm-memories-pane');
            await expect(pane).toBeVisible({timeout: 10000});

            // choosing whose memories is an explicit act: construction fires no read
            await expect(pane).toContainText('Pick an agent to read their recent turns.');
            await expect(pane).toContainText('Memories render here once an agent is chosen.');
            await expect(pane.locator('.fm-memories-turn')).toHaveCount(0);

            await pane.getByRole('button', {name: 'Ada'}).click();

            await expect(pane.locator('.fm-memories-turn')).toHaveCount(2, {timeout: 10000});
            await expect(pane).toContainText('@neo-opus-ada · public projection · captured 2026-08-02 12:00Z');
            await expect(pane.locator('.fm-memories-turn').nth(0)).toContainText('Wake axes merged after two review cycles');
            await expect(pane.locator('.fm-memories-turn').nth(0)).toContainText('session 9286a9c0');
            await expect(pane.locator('.fm-memories-turn').nth(1)).toContainText('fallback summary');

            // the cursor pages older turns as an APPEND, and its exhaustion hides the affordance
            const older = pane.getByRole('button', {name: 'Older turns'});
            await expect(older).toBeVisible();
            await older.click();

            await expect(pane.locator('.fm-memories-turn')).toHaveCount(3, {timeout: 10000});
            await expect(older).toBeHidden();

            // the vocabulary-collision class: a non-string summary is NAMED at the model boundary, never coerced
            await expect(pane.locator('.fm-memories-turn').nth(2)).toContainText('Summary unavailable for this turn.');
            await expect(pane).not.toContainText('[object Object]');

            const memoriesRequests = fleet.requests.filter(request => request.method === 'fleetMemories');
            expect(memoriesRequests.map(request => request.params)).toEqual([
                {agentIdentity: '@neo-opus-ada'},
                {agentIdentity: '@neo-opus-ada', before: CURSOR}
            ]);
            // the wire carries the explicit target only — no viewer claim, no caller-chosen projection
            expect(memoriesRequests.every(request =>
                request.params.viewerIdentity === undefined && request.params.projection === undefined
            )).toBe(true)
        } finally {
            await fleet.close()
        }
    })
});
