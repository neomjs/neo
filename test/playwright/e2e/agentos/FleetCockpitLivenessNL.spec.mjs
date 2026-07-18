import {test, expect}                                                          from '../../fixtures.mjs';
import {authenticatedFleetOptions, reloadRoster, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

/**
 * @summary The liveness OWNER journey proven on the MOUNTED cockpit against a REAL fleet server:
 * `live` → transport killed → the spine banner NAMES the loss → transport restarted → the banner
 * clears. The liveness mechanism and its unit transition matrix ship separately; this covers the one
 * edge no unit can see, and it needs a real activity producer on the fleet server (now available):
 * a genuine transport death advancing owner truth end-to-end, without a reload.
 *
 * Why this is NOT the `FleetCockpitDrillRoundTripNL` adapter-loss leg: that mutates the ActivityStream
 * CHILD's `adapterState` directly (`setProperties(streamId, …)`). This drives the OWNER — the cockpit's
 * `gridAdapterState` / `streamAdapterState`, `degradeWiredSurface`, and `syncSpineBanner` — through a
 * real `registryBridge` read that genuinely FAILS (connection refused on a closed loopback server),
 * so `loadRoster` / `loadActivity` reject into `degradeWiredSurface` (the "killed" edge), not the
 * producer-answered `capability.state==='degraded'` branch. The witness is TIMER-driven, not a manual
 * `loadRoster`: the whole point of the owner is the ONGOING re-poll, so a short injected cadence proves
 * the interval advances truth on its own.
 *
 * Kill = close the real server (connection refused is an unambiguous request rejection, independent of
 * the bridge client's `{ok:false}` mapping). Restart = a fresh server + re-`wireFleetBridge` to its new
 * URL (no port-reuse flakiness); the running liveness timer reads the re-installed global next tick.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/FleetCockpitLivenessNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * @see apps/agentos/view/fleet/FleetCockpit.mjs (startLiveness / loadRoster / loadActivity / degradeWiredSurface / syncSpineBanner)
 * @see apps/agentos/view/fleet/spineBanner.mjs (deriveSpineBanner — the rendered text this asserts)
 * @see test/playwright/e2e/agentos/authenticatedFleetHarness.mjs (the real-server ingress boundary)
 */

const LIVENESS_SOURCES = {
    roster : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    runtime: {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
};

const LIVENESS_ROSTER_ROWS = [
    {id: 'live-alpha', displayName: 'Alpha', engineTag: 'fixture', family: 'claude'},
    {id: 'live-bravo', displayName: 'Bravo', engineTag: 'fixture', family: 'claude'}
].map(row => ({
    ...row,
    avatarUrl: '',
    lifecycle: {source: LIVENESS_SOURCES.runtime.source, state: 'running', confidence: 'observed'},
    sources  : LIVENESS_SOURCES
}));

/**
 * @summary Start a test-owned Fleet bridge that answers `fleetRoster` / `fleetActivity` as a wired,
 * live fleet. Killing the transport is done by CLOSING this server (not a dispatch flag): the closed
 * loopback socket makes the next real read reject with connection-refused — the faithful "killed" edge.
 * @param {Number} [port=0] 0 = ephemeral; each (re)start binds a fresh port so recovery never reuses one.
 * @returns {Promise<{bearerToken: String, endpoint: String, close: Function}>}
 */
async function startLivenessFleetBridge(port = 0) {
    const {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs');

    const options = authenticatedFleetOptions({
        port,
        dispatch: async request => {
            if (request.method === 'fleetRoster') {
                return {ok: true, result: {rows: LIVENESS_ROSTER_ROWS}}
            }

            if (request.method === 'fleetActivity') {
                return {
                    ok    : true,
                    result: {
                        capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'},
                        events    : []
                    }
                }
            }

            return {ok: false, error: `fleet: unexpected liveness-witness method '${request.method}'`}
        }
    });

    const server = await startFleetBridgeServer(options);

    return {
        bearerToken: options.bearerToken,
        endpoint   : `http://127.0.0.1:${server.address().port}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

test.describe('AgentOS fleet cockpit — the liveness owner journey (live → transport killed → banner names loss → restart → clears, #15293 AC4)', () => {
    test.setTimeout(120000);

    test('the ongoing owner advances gridAdapterState/streamAdapterState and the spine banner across a real transport loss and recovery, without reload', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        // ── boot against a REAL, live fleet server ───────────────────────────────────────────
        let fleet = await startLivenessFleetBridge();

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app        = await neuralLink.connectToApp('AgentOS'),
              [cockpit0] = await app.queryComponent({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              cockpitId  = cockpit0?.properties?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // flip the fail-closed boot bridge live, then re-read the roster that raced the injection
        await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});
        await reloadRoster(app);

        const readLiveness = async () => {
            const [c] = await app.queryComponent(
                {className: 'AgentOS.view.fleet.FleetCockpit'},
                ['gridAdapterState', 'streamAdapterState', 'gridDegradedReason', 'streamDegradedReason', 'id']
            );

            return c?.properties ?? {}
        };

        // both surfaces reach live against the wired bridge; a fully-live spine renders NOTHING
        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the roster surface reaches live against the wired bridge', timeout: 30000, intervals: [250]
        }).toBe('live');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the activity surface reaches live against the wired bridge', timeout: 30000, intervals: [250]
        }).toBe('live');

        await expect(page.locator('.fm-spine-banner-degraded'), 'a fully-live spine renders no degraded banner').toHaveCount(0);
        await expect(page.locator('.fm-spine-banner-cold'),     'a fully-live spine renders no cold banner').toHaveCount(0);

        // ── pin a fast, deterministic cadence and RE-ARM the owner so the timer drives the edges ─
        // the fields are documented as injectable-for-specs; startLiveness reads livenessPollInterval
        // at setInterval time, so it must be re-armed (stop → start) to pick the short cadence up.
        await app.setProperties(cockpitId, {livenessPollInterval: 250, livenessReadTimeout: 800});
        await app.callMethod(cockpitId, 'stopLiveness');
        await app.callMethod(cockpitId, 'startLiveness');

        // ── transport KILLED: close the real server; the next TIMER tick reads connection-refused ─
        await fleet.close();

        // the owner advances BOTH wired surfaces live → stale on its own cadence (no reload, no manual load)
        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the liveness timer advances the roster surface to stale on transport loss', timeout: 30000, intervals: [250]
        }).toBe('stale');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the liveness timer advances the activity surface to stale on transport loss', timeout: 30000, intervals: [250]
        }).toBe('stale');

        // a retained safe reason is held per surface (the honest WHY, not generic copy)
        const degraded = await readLiveness();

        expect(degraded.gridDegradedReason,   'the roster surface retains a safe degrade reason').toBeTruthy();
        expect(degraded.streamDegradedReason, 'the activity surface retains a safe degrade reason').toBeTruthy();
        expect(degraded.id, 'the SAME cockpit instance advanced the state — no reload').toBe(cockpitId);

        // the spine banner NAMES the loss in the DOM — the operator-visible truth, not worker state alone
        const banner = page.locator('.fm-spine-banner-degraded');

        await expect(banner, 'the spine banner renders the degraded state').toBeVisible({timeout: 15000});
        await expect(banner, 'the banner names the loss with last-known framing').toContainText('Fleet feed degraded — showing last-known data');

        // ── transport RESTARTED: a fresh server + re-wire; the running timer reads the new bridge ─
        const fleet2 = await startLivenessFleetBridge();

        fleet = fleet2; // afterEach / trailing close targets the live one
        await wireAuthenticatedFleetBridge({app, fleetUrl: fleet2.endpoint, bearerToken: fleet2.bearerToken});

        // recovery is timer-driven too: the next tick succeeds → live → the retained reason clears
        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the liveness timer restores the roster surface to live on recovery', timeout: 30000, intervals: [250]
        }).toBe('live');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the liveness timer restores the activity surface to live on recovery', timeout: 30000, intervals: [250]
        }).toBe('live');

        const recovered = await readLiveness();

        expect(recovered.gridDegradedReason,   'the roster reason clears on recovery').toBeFalsy();
        expect(recovered.streamDegradedReason, 'the activity reason clears on recovery').toBeFalsy();

        // the banner clears — a fully-live spine is hidden again
        await expect(page.locator('.fm-spine-banner-degraded'), 'the degraded banner clears on recovery').toHaveCount(0);

        await fleet2.close();

        expect(pageErrors, 'the liveness journey must be error-free in the main window').toEqual([])
    });
});
