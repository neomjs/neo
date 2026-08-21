import {expect, test}                                            from '../../fixtures.mjs';
// the human-facing instant renders viewer-local through the ONE shared helper (TOKENS.md T5) —
// the expectation imports it instead of hard-coding the UTC wire form or a zone-dependent literal
import {formatViewerTime} from '../../../../apps/agentos/view/fleet/viewerTime.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const CAPTURED_AT = '2026-08-03T08:00:00.000Z';

const rosterRows = [
    {id: 'ada', githubUsername: 'neo-opus-ada', displayName: 'Ada', engineTag: 'fixture', family: 'claude'},
    {id: 'bob', githubUsername: 'neo-gpt-bob',  displayName: 'Bob', engineTag: 'fixture', family: 'gpt'}
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

    if (target === '@neo-gpt-bob') {
        return {
            capability: {state: 'wired', capturedAt: CAPTURED_AT},
            ...shared,
            page    : {offset: 0, limit: 20},
            sessions: [
                {
                    id         : 'bob-1', sessionId: 'bobsess1-0000', timestamp: '2026-08-02T18:00:00.000Z',
                    title      : 'Bob fixture session', summary: 'A single truthful session.', category: 'other',
                    memoryCount: 2, quality: 80, impact: 30, sourceAgentIdentities: ['@neo-gpt-bob']
                }
            ],
            count: 1,
            total: 1
        }
    }

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
          gates                    = {},
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  if (request.method === 'fleetMemories' && gates[request.params?.agentIdentity]) {
                      await gates[request.params.agentIdentity]
                  }

                  switch (request.method) {
                      case 'resolveViewerIdentity':
                          return fleetE2ESuccess({ok: true, agentIdentityNodeId: '@e2e-operator'});
                      case 'fleetRoster':
                          return fleetE2ESuccess({rows: rosterRows});
                      case 'fleetActivity':
                          return fleetE2ESuccess({capability: {state: 'wired'}, events: []});
                      case 'fleetMemories':
                          return fleetE2ESuccess(memoriesResult(request.params));
                      case 'getBootIdentity':
                          return fleetE2ESuccess({fact: null, classification: 'unknown', advisory: true});
                      default:
                          return fleetE2EFailure(`unexpected memories method: ${request.method}`)
                  }
              }
          }),
          server                   = await startFleetBridgeServer(options);

    return {
        requests,
        gates,
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

/**
 * @summary Native Fleet memories journey over session summaries: activating the resident
 * south-strip tab shows the pane; choosing an agent is the explicit first act; the App Worker
 * crosses the authenticated allowlisted bridge; summary cards render with honest multi-agent
 * attribution; the offset pages older sessions as an append against the corpus total; guarded
 * non-string titles/summaries are named; and the wire carries only the explicit target — never a
 * viewer claim, never a projection. The rematerialization variants create TRUE document absence
 * (committed clones) — a resident tab switch only hides the inactive card.
 *
 * Run: NEO_E2E_PORT=49223 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetMemoriesNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet memories — authenticated resident-tab journey (#16398)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 1000}});

    test('tab → explicit agent choice → summary cards → offset append → guarded non-string card', async ({page, neuralLink}) => {
        const fleet = await startMemoriesFleet();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            const [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']);
            expect(cockpit?.properties?.id).toBeTruthy();
            await app.callMethod(cockpit.properties.id, 'loadRoster');

            // resident south reading-surface tab (the navigation model): activate, never rail-reveal
            const tab = page.getByRole('tab', {name: 'Memories', exact: true});
            await expect(tab).toHaveCount(1);
            await tab.click();

            // True-absence removal for the rematerialization variants: a resident tab SWITCH only
            // hides the inactive card (the instance survives), so the old rail-switch removal no
            // longer destroys the pane. Drop the item through a committed document (the wire hands
            // back a clone; committing it is the production reducer path), then re-add + activate.
            const cockpitId      = cockpit.properties.id,
                  removeMemories = async () => {
                      const doc = await app.callMethod(cockpitId, 'getDockZoneDocument');
                      doc.nodes['stream-tabs'].items = doc.nodes['stream-tabs'].items.filter(id => id !== 'memories');
                      await app.callMethod(cockpitId, 'onDockZoneDocumentChange', [doc]);
                      await expect(page.locator('.fm-memories-pane')).toHaveCount(0)
                  },
                  restoreMemories = async () => {
                      const readd = await app.callMethod(cockpitId, 'applyDockZoneOperation', [{operation: 'addTab', itemId: 'memories', tabsNodeId: 'stream-tabs'}]);
                      expect(readd.errors).toEqual([]);
                      await app.callMethod(cockpitId, 'onDockZoneDocumentChange', [readd.document]);
                      await page.getByRole('tab', {name: 'Memories', exact: true}).click()
                  };

            const pane = page.locator('.fm-memories-pane');
            await expect(pane).toBeVisible({timeout: 10000});

            // choosing whose memories is an explicit act: construction fires no read
            await expect(pane).toContainText('Pick an agent to read their recent sessions.');
            await expect(pane).toContainText('Session summaries render here once an agent is chosen.');
            await expect(pane.locator('.fm-memories-card')).toHaveCount(0);

            // ── rematerialization VARIANT B: pending first-ever read, NO prior snapshot ──
            // Gate Ada's page zero, select her, remove the pane mid-flight (true document
            // absence), return.
            let releaseAda;
            fleet.gates['@neo-opus-ada'] = new Promise(resolve => { releaseAda = resolve });

            await pane.getByRole('button', {name: 'Ada'}).click();
            await expect(pane).toContainText('Reading @neo-opus-ada…');

            await removeMemories();
            await restoreMemories();

            const paneB = page.locator('.fm-memories-pane');
            await expect(paneB).toBeVisible({timeout: 10000});
            // the owner-held PENDING selection travels into the rebuilt pane: honest pending
            // state — never the null-selection "Pick an agent" while a response is in flight
            await expect(paneB).toContainText('Reading @neo-opus-ada…');
            await expect(paneB).not.toContainText('Pick an agent');
            await expect(paneB.locator('.fm-memories-card')).toHaveCount(0);

            delete fleet.gates['@neo-opus-ada'];
            releaseAda();

            // the in-flight response lands in the REBUILT pane (write-time pane resolve), with
            // the selection attached — variant B's "renders with activeAgent: null" is dead
            await expect(paneB.locator('.fm-memories-card')).toHaveCount(2, {timeout: 10000});
            await expect(pane).toContainText(`@neo-opus-ada · 2 of 3 sessions · captured ${formatViewerTime(CAPTURED_AT).text}`);
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

            // ── switch-while-pending coherence (the reviewer's exact-head probe as a witness) ──
            // Gate Bob's page zero so the switch-pending window is real and observable.
            let releaseBob;
            fleet.gates['@neo-gpt-bob'] = new Promise(resolve => { releaseBob = resolve });

            await pane.getByRole('button', {name: 'Bob'}).click();

            // old target's cards + continuation die IMMEDIATELY; pending state is honest
            await expect(pane).toContainText('Reading @neo-gpt-bob…');
            await expect(pane.locator('.fm-memories-card')).toHaveCount(0);
            await expect(older).toBeHidden();
            await expect(pane).toContainText('Waiting for this agent’s first page.');

            // ── rematerialization VARIANT A: pending switch WITH a prior (Ada) snapshot held ──
            // Remove + rebuild the pane mid-flight (true document absence): it must reopen on the
            // PENDING selection, never on the stale accepted snapshot's target, cards, or continuation.
            await removeMemories();
            await restoreMemories();
            await expect(pane).toBeVisible({timeout: 10000});
            await expect(pane).toContainText('Reading @neo-gpt-bob…');
            await expect(pane).not.toContainText('@neo-opus-ada · 3 of 3');
            await expect(pane.locator('.fm-memories-card')).toHaveCount(0);

            delete fleet.gates['@neo-gpt-bob'];
            releaseBob();

            await expect(pane.locator('.fm-memories-card')).toHaveCount(1, {timeout: 10000});
            await expect(pane).toContainText('@neo-gpt-bob · 1 of 1 sessions');
            await expect(pane.locator('.fm-memories-card').nth(0)).toContainText('Bob fixture session');
            await expect(older).toBeHidden();

            const memoriesRequests = fleet.requests.filter(request => request.method === 'fleetMemories');
            // NO offset request for Bob exists anywhere — the continuation could not fire in the
            // pending window, so page zero was never superseded or preceded
            expect(memoriesRequests.map(request => request.params)).toEqual([
                {agentIdentity: '@neo-opus-ada'},
                {agentIdentity: '@neo-opus-ada', offset: 2},
                {agentIdentity: '@neo-gpt-bob'}
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
