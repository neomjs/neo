import {expect, test}                                            from '../../fixtures.mjs';
import {authenticatedFleetOptions, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const CAPTURED_AT = '2026-08-03T08:00:00.000Z';

const rosterRows = [
    {id: 'ada', githubUsername: 'neo-opus-ada', displayName: 'Ada', engineTag: 'fixture', family: 'claude'}
];

/**
 * @summary One fixture envelope per page, exactly the `fleetMemories` source contract over
 * session summaries: the newest page carries two cards (one a multi-agent session whose
 * attribution must render), the offset continuation carries the older card whose title and
 * summary are NON-STRINGS — the vocabulary-collision class the model boundary must name instead
 * of coercing to `[object Object]`.
 * @param {Object} params
 * @returns {Object}
 */
function memoriesResult(params = {}) {
    const
        target = params.agentIdentity,
        shared = {viewer: '@e2e-operator', target};

    if (params.offset > 0) {
        return {
            capability: {state: 'wired', capturedAt: CAPTURED_AT},
            ...shared,
            page    : {offset: params.offset, limit: 20},
            sessions: [
                {
                    id         : 'summary-0', sessionId: '36ea85e4-fcdc', timestamp: '2026-08-02T09:00:00.000Z',
                    title      : {payload: 'not a string'}, summary: {payload: 'also not a string'}, category: 'other',
                    memoryCount: 3, quality: 50, impact: 20, sourceAgentIdentities: ['@neo-opus-ada']
                }
            ],
            count: 1,
            total: 3
        }
    }

    return {
        capability: {state: 'wired', capturedAt: CAPTURED_AT},
        ...shared,
        page    : {offset: 0, limit: 20},
        sessions: [
            {
                id         : 'summary-2', sessionId: '9286a9c0-91be', timestamp: '2026-08-02T21:00:00.000Z',
                title      : 'Wake transport and integrity contracts', summary: 'Established verifiable wake transport between plane and host.', category: 'feature',
                memoryCount: 61, quality: 95, impact: 85, sourceAgentIdentities: ['@neo-opus-ada', '@neo-gpt-emmy']
            },
            {
                id         : 'summary-1', sessionId: '9286a9c0-91be', timestamp: '2026-08-02T19:00:00.000Z',
                title      : 'Terminal audit for a grid PR', summary: 'Verified five required actions without repository mutation.', category: 'analysis',
                memoryCount: 1, quality: 100, impact: 40, sourceAgentIdentities: ['@neo-opus-ada']
            }
        ],
        count: 2,
        total: 3
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
 * @summary Native Fleet memories journey over session summaries: the real auto-hide rail invokes
 * the pane; choosing an agent is the explicit first act; the App Worker crosses the authenticated
 * allowlisted bridge; summary cards render with honest multi-agent attribution; the offset pages
 * older sessions as an append against the corpus total; guarded non-string titles/summaries are
 * named; and the wire carries only the explicit target — never a viewer claim, never a projection.
 *
 * Run: NEO_E2E_PORT=49223 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetMemoriesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet memories — authenticated rail journey (#16398)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 1000}});

    test('rail → explicit agent choice → summary cards → offset append → guarded non-string card', async ({page, neuralLink}) => {
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
            await expect(pane).toContainText('Pick an agent to read their recent sessions.');
            await expect(pane).toContainText('Session summaries render here once an agent is chosen.');
            await expect(pane.locator('.fm-memories-card')).toHaveCount(0);

            await pane.getByRole('button', {name: 'Ada'}).click();

            await expect(pane.locator('.fm-memories-card')).toHaveCount(2, {timeout: 10000});
            await expect(pane).toContainText('@neo-opus-ada · 2 of 3 sessions · captured 2026-08-03 08:00Z');
            await expect(pane.locator('.fm-memories-card').nth(0)).toContainText('Wake transport and integrity contracts');
            await expect(pane.locator('.fm-memories-card').nth(0)).toContainText('feature · 61 memories · quality 95');
            // multi-agent session: attribution beyond the selected target renders explicitly
            await expect(pane.locator('.fm-memories-card').nth(0)).toContainText('with @neo-gpt-emmy');
            await expect(pane.locator('.fm-memories-card').nth(1)).not.toContainText('with @');

            // the offset pages older sessions as an APPEND, and corpus exhaustion hides the affordance
            const older = pane.getByRole('button', {name: 'Older sessions'});
            await expect(older).toBeVisible();
            await older.click();

            await expect(pane.locator('.fm-memories-card')).toHaveCount(3, {timeout: 10000});
            await expect(pane).toContainText('3 of 3 sessions');
            await expect(older).toBeHidden();

            // the vocabulary-collision class: non-string title AND summary are NAMED at the model boundary
            await expect(pane.locator('.fm-memories-card').nth(2)).toContainText('Title unavailable for this session.');
            await expect(pane.locator('.fm-memories-card').nth(2)).toContainText('Summary unavailable for this session.');
            await expect(pane).not.toContainText('[object Object]');

            const memoriesRequests = fleet.requests.filter(request => request.method === 'fleetMemories');
            expect(memoriesRequests.map(request => request.params)).toEqual([
                {agentIdentity: '@neo-opus-ada'},
                {agentIdentity: '@neo-opus-ada', offset: 2}
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
