import {expect, test} from '../../fixtures.mjs';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import ViewerTime     from '../../../../apps/agentos/util/ViewerTime.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

// The human-facing instant renders viewer-local through the ONE shared class (TOKENS.md T5) —
// the expectation imports it instead of hard-coding either the UTC wire form or a zone-dependent literal.

const WINDOW = {
    semantics  : 'half-open',
    windowStart: '2026-07-17T12:00:00.000Z',
    windowEnd  : '2026-07-18T12:00:00.000Z'
};

const rosterRows = [
    {id: 'ada', githubUsername: 'neo-opus-ada', displayName: 'Ada', engineTag: 'fixture', family: 'claude'}
];

function birdView({hash, synthesis, citations = [], degraded = false}) {
    return {
        notAuthority      : true,
        generatedAt       : WINDOW.windowEnd,
        sourceManifestHash: hash,
        coverage          : {
            totalResolved : 2,
            included      : degraded ? 1 : 2,
            degraded,
            degradedReason: degraded ? 'bounded fixture gap' : null
        },
        citations,
        synthesisAvailable        : !degraded,
        synthesisUnavailableReason: degraded ? 'coverage-degraded' : null,
        synthesis                 : degraded ? null : synthesis
    }
}

function historyResult(params = {}) {
    if (!params.firstUsePreset && !params.windowStart && (params.partition || 'unified') === 'unified') {
        return {
            capability         : {state: 'wired', capturedAt: WINDOW.windowEnd},
            needsFirstUseWindow: true,
            partition          : 'unified',
            viewerState        : {lastSeen: null, lastVisitAt: null},
            window             : null,
            sources            : null
        }
    }

    const partition = params.partition || 'unified';

    return {
        capability         : {state: 'degraded', capturedAt: WINDOW.windowEnd},
        needsFirstUseWindow: false,
        partition,
        viewerState        : {lastSeen: null, lastVisitAt: WINDOW.windowEnd},
        window             : WINDOW,
        sources            : {
            memory: {
                source           : 'memory',
                state            : 'available',
                unavailableReason: null,
                envelope         : birdView({hash: 'a1b2c3d4', synthesis: `Memory history for ${partition}`})
            },
            pullRequests: {
                source           : 'pull-requests',
                state            : 'degraded',
                unavailableReason: null,
                envelope         : birdView({
                    hash     : 'd4c3b2a1',
                    synthesis: null,
                    degraded : true,
                    citations: [{
                        type     : 'pull-request',
                        id       : 'pull:15470',
                        drillDown: {operation: 'get_conversation', arguments: {pr_number: 15470}}
                    }]
                })
            }
        }
    }
}

async function startCatchUpFleet() {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
          requests                 = [],
          options                  = authenticatedFleetOptions({
              dispatch: async request => {
                  requests.push(request);

                  switch (request.method) {
                      case 'resolveViewerIdentity':
                          return fleetE2ESuccess({ok: true, agentIdentityNodeId: '@e2e-operator'});
                      case 'fleetRoster':
                          return fleetE2ESuccess({rows: rosterRows});
                      case 'fleetActivity':
                          return fleetE2ESuccess({capability: {state: 'wired'}, events: []});
                      case 'fleetHistory':
                          return fleetE2ESuccess(historyResult(request.params));
                      case 'markFleetCaughtUp':
                          return fleetE2ESuccess({status: 'advanced', lastSeen: request.params.windowEnd});
                      case 'getBootIdentity':
                          return fleetE2ESuccess({fact: null, classification: 'unknown', advisory: true});
                      default:
                          return fleetE2EFailure(`unexpected catch-up method: ${request.method}`)
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
 * @summary Native Fleet catch-up journey: activating the resident south-strip tab shows the pane;
 * the App Worker crosses the authenticated allowlisted bridge; a first-use choice yields two
 * source-owned `notAuthority` envelopes; per-agent partitioning changes the Memory read intent;
 * the exact rendered end advances the runtime-only anchor; and Live Activity re-activates the
 * stream tab and focuses the existing bounded adjacency.
 *
 * Run: NEO_E2E_PORT=49221 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetCatchUpNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet catch-up — authenticated resident-tab journey (#14620)', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1600, height: 1000}});

    test('tab → explicit window → independent envelopes → partition → mark → live adjacency', async ({page, neuralLink}) => {
        const fleet = await startCatchUpFleet();

        try {
            await page.goto(`/apps/agentos/index.html?${new URLSearchParams({fleetUrl: fleet.endpoint})}`);
            await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

            const app = await neuralLink.connectToApp('AgentOS');
            await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});

            const [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']);
            expect(cockpit?.properties?.id).toBeTruthy();
            await app.callMethod(cockpit.properties.id, 'loadRoster');

            // resident south reading-surface tab (the navigation model): activate, never rail-reveal
            const tab = page.getByRole('tab', {name: 'Catch up', exact: true});
            await expect(tab).toHaveCount(1);
            await tab.click();

            const pane = page.locator('.fm-catch-up-pane');
            await expect(pane).toBeVisible({timeout: 10000});
            await expect(pane).toContainText('No runtime anchor yet');
            await expect(pane).toContainText('Choose 24 hours, 3 days, or one week');
            await expect(pane.locator('.fm-catch-up-source')).toHaveCount(0);

            await pane.getByRole('button', {name: '24h'}).click();
            await expect(pane.locator('.fm-catch-up-source')).toHaveCount(2, {timeout: 10000});
            await expect(pane.locator('.fm-catch-up-source').nth(0)).toContainText('Memory history for unified');
            await expect(pane.locator('.fm-catch-up-source').nth(0)).toContainText('manifest a1b2c3d4');
            await expect(pane.locator('.fm-catch-up-source').nth(1)).toContainText('Coverage degraded · bounded fixture gap');

            const citation = pane.locator('a.fm-catch-up-citation, .fm-catch-up-citation a').first();
            await expect(citation).toHaveAttribute('href', 'https://github.com/neomjs/neo/pull/15470');
            await expect(citation).toHaveAttribute('rel', 'noopener noreferrer');

            await pane.getByRole('button', {name: 'Ada'}).click();
            await expect(pane.locator('.fm-catch-up-source').nth(0)).toContainText('Memory history for @neo-opus-ada');

            await pane.getByRole('button', {name: 'Mark caught up'}).click();
            await expect(pane).toContainText(`Caught up through ${ViewerTime.formatViewerTime(WINDOW.windowEnd).text}`);

            await pane.getByRole('button', {name: 'Live activity'}).click();
            await expect.poll(() => page.locator('.fm-activity-stream').evaluate(element => document.activeElement === element))
                .toBe(true);

            const historyRequests = fleet.requests.filter(request => request.method === 'fleetHistory');
            expect(historyRequests.map(request => request.params)).toEqual([
                {partition: 'unified'},
                {firstUsePreset: 'daily', partition: 'unified'},
                {partition: '@neo-opus-ada'}
            ]);
            expect(historyRequests.every(request => request.params.viewerIdentity === undefined)).toBe(true);
            expect(fleet.requests.filter(request => request.method === 'markFleetCaughtUp').map(request => request.params))
                .toEqual([{windowEnd: WINDOW.windowEnd}])
        } finally {
            await fleet.close()
        }
    })
});
