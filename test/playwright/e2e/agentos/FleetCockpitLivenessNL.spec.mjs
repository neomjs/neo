import {test, expect, loadAgentOsModule}                                       from '../../fixtures.mjs';
import {authenticatedFleetOptions, reloadRoster, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

const {generateLocalBearerToken} = await loadAgentOsModule('ai/mcp/server/shared/helpers/localBearer.mjs');

/**
 * @summary The liveness OWNER journey proven on the MOUNTED cockpit against a REAL fleet server:
 * `live` → transport killed → the spine banner NAMES the loss → transport restarted → the banner
 * clears. The liveness mechanism and its unit transition matrix ship separately; this covers the one
 * edge no unit can see: a genuine transport death advancing owner truth end-to-end, without a reload.
 *
 * The server drives the REAL `dispatchFleetRequest → FleetControlBridge` path (no fabricated
 * dispatch): `FleetControlBridge.activitySource` is composed through the production
 * `wireFleetActivityReadSource` (the producer whose landing unblocked this AC), with the same slot
 * readers `devFleetServer` injects (a bound `listMessages` + the synced issue tree); the roster runs
 * through `FleetControlBridge.fleetRoster` over its registry. So a wired surface reaching `live` is the
 * production producer answering, not a stub behind a real socket.
 *
 * The loss/restart are isolated to the TRANSPORT: kill closes the socket (connection-refused → the
 * `catch → degradeWiredSurface` edge), restart re-listens on the SAME port with the SAME bearer, and
 * the browser bridge is NEVER re-wired — so the liveness timer, not endpoint reconfiguration, is the
 * sole recovery cause. The witness is timer-driven (a short injected cadence, re-armed), same cockpit
 * instance (no reload), and asserts the retained safe reason reaches the rendered banner.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/FleetCockpitLivenessNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * @see apps/agentos/view/fleet/cockpit/Container.mjs (startLiveness / loadRoster / loadActivity / degradeWiredSurface / syncSpineBanner)
 * @see ai/services/fleet/devFleetServer.mjs (the production composition this mirrors)
 * @see ai/services/fleet/wireFleetActivityReadSource.mjs (the real producer the dispatch traverses)
 */

let neoBootstrapped = false;

/**
 * @summary Compose the REAL Fleet producer onto `FleetControlBridge` once — mirroring the
 * `devFleetServer` boot wiring so the transport traverses `dispatchFleetRequest → activitySource`,
 * never a fabricated response. Idempotent (the bridge + activitySource are module singletons that
 * survive the kill/restart, which is exactly why recovery needs no re-wire).
 * @returns {Promise<void>}
 */
async function wireRealFleetSources() {
    if (neoBootstrapped) return;

    // Neo namespace bootstrap (entry-point invariant) so the FleetControlBridge / FleetManager
    // singletons construct — the same three imports devFleetServer's process entry performs.
    await import('../../../../src/Neo.mjs');
    await import('../../../../src/core/_export.mjs');
    await import('../../../../src/manager/Instance.mjs');

    const
        {wireFleetActivityReadSource} = await loadAgentOsModule('ai/services/fleet/wireFleetActivityReadSource.mjs'),
        {default: path}               = await import('node:path'),
        {fileURLToPath}               = await import('node:url'),
        issuesDir                     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../resources/content/issues');

    // The production producer, with the SAME injected slot shape devFleetServer uses: the A2A slot
    // over a bound listMessages (honestly-empty here — a real bound reader, not a fabricated snapshot),
    // the PR/lane slot over the synced issue tree. Both slots read → the composer reports `wired`.
    wireFleetActivityReadSource({
        issuesDir,
        listMessages: async () => []
    });

    neoBootstrapped = true
}

/**
 * @summary Start the authenticated Fleet bridge on the REAL dispatch path (no custom `dispatch`), so
 * `fleetRoster` / `fleetActivity` resolve through `FleetControlBridge`. Pass a fixed `port` + `bearerToken`
 * on restart to re-listen at the SAME endpoint the browser bridge already targets.
 * @param {Object} [opts]
 * @param {Number} [opts.port=0] 0 = ephemeral (first boot); the captured port on restart.
 * @param {String} [opts.bearerToken] Reused across restart so the already-installed bridge authenticates.
 * @returns {Promise<{bearerToken: String, port: Number, endpoint: String, close: Function}>}
 */
async function startLivenessFleetServer({port = 0, bearerToken} = {}) {
    const {startFleetBridgeServer} = await loadAgentOsModule('ai/services/fleet/fleetBridgeServer.mjs'),
          options                  = authenticatedFleetOptions(bearerToken ? {port, bearerToken} : {port}),
          server                   = await startFleetBridgeServer(options),
          boundPort                = server.address().port;

    return {
        bearerToken: options.bearerToken,
        port       : boundPort,
        endpoint   : `http://127.0.0.1:${boundPort}/fleet`,
        close      : () => new Promise(resolve => server.close(resolve))
    }
}

test.describe('AgentOS fleet cockpit — the liveness owner journey (live → transport killed → banner names loss → restart → clears, #15293 AC4)', () => {
    test.setTimeout(150000);

    test('the ongoing owner advances gridAdapterState/streamAdapterState and the spine banner across a real transport loss and recovery, timer-driven, same-endpoint, no reload', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        // ── boot the REAL producer path, then the transport on an ephemeral port ────────────────
        await wireRealFleetSources();

        const bearerToken = generateLocalBearerToken();

        let fleet = await startLivenessFleetServer({bearerToken});

        const fleetPort = fleet.port; // the endpoint the browser bridge binds to; restart re-listens here

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app        = await neuralLink.connectToApp('AgentOS'),
              [cockpit0] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              cockpitId  = cockpit0?.properties?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        // flip the fail-closed boot bridge live (the ONE wire call — recovery must not repeat it), then
        // re-read the roster that raced the injection
        await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken});
        await reloadRoster(app);

        const readLiveness = async () => {
            const [c] = await app.queryComponent(
                {className: 'AgentOS.view.fleet.cockpit.Container'},
                ['gridAdapterState', 'streamAdapterState', 'gridDegradedReason', 'streamDegradedReason', 'id']
            );

            return c?.properties ?? {}
        };

        // both surfaces reach live through the REAL producer (roster registry + composed activitySource);
        // a fully-live spine renders NOTHING
        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the roster surface reaches live through the real bridge', timeout: 30000, intervals: [250]
        }).toBe('live');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the activity surface reaches live through the real producer', timeout: 30000, intervals: [250]
        }).toBe('live');

        await expect(page.locator('.fm-spine-banner-degraded'), 'a fully-live spine renders no degraded banner').toHaveCount(0);

        // ── pin a fast, deterministic cadence and RE-ARM the owner so the timer drives the edges ─
        await app.setProperties(cockpitId, {livenessPollInterval: 300, livenessReadTimeout: 2500});
        await app.callMethod(cockpitId, 'stopLiveness');
        await app.callMethod(cockpitId, 'startLiveness');

        // ── transport KILLED: close the socket; the next TIMER tick reads connection-refused ────
        await fleet.close();

        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the liveness timer advances the roster surface to stale on transport loss', timeout: 30000, intervals: [300]
        }).toBe('stale');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the liveness timer advances the activity surface to stale on transport loss', timeout: 30000, intervals: [300]
        }).toBe('stale');

        // a retained safe reason is held per surface (the honest WHY, not generic copy)
        const degraded = await readLiveness();

        expect(degraded.gridDegradedReason,   'the roster surface retains a safe degrade reason').toBeTruthy();
        expect(degraded.streamDegradedReason, 'the activity surface retains a safe degrade reason').toBeTruthy();
        expect(degraded.id, 'the SAME cockpit instance advanced the state — no reload').toBe(cockpitId);

        // the spine banner NAMES the loss in the DOM — and carries the RETAINED REASON, not just the
        // generic prefix (proving the safe reason reaches rendered copy, RA-3)
        const banner = page.locator('.fm-spine-banner-degraded');

        await expect(banner, 'the spine banner renders the degraded state').toBeVisible({timeout: 15000});
        await expect(banner, 'the banner names the loss AND carries the retained reason (not only the prefix)')
            .toHaveText(/Fleet feed degraded — showing last-known data · .+/);

        // ── transport RESTARTED at the SAME endpoint, SAME bearer — the bridge is NOT re-wired ──
        fleet = await startLivenessFleetServer({port: fleetPort, bearerToken});

        // recovery is timer-driven and transport-isolated: the next tick reads the re-listened server
        // through the unchanged bridge → live → the retained reason clears
        await expect.poll(async () => (await readLiveness()).gridAdapterState, {
            message: 'the liveness timer restores the roster surface to live on same-endpoint restart', timeout: 30000, intervals: [300]
        }).toBe('live');

        await expect.poll(async () => (await readLiveness()).streamAdapterState, {
            message: 'the liveness timer restores the activity surface to live on same-endpoint restart', timeout: 30000, intervals: [300]
        }).toBe('live');

        const recovered = await readLiveness();

        expect(recovered.gridDegradedReason,   'the roster reason clears on recovery').toBeFalsy();
        expect(recovered.streamDegradedReason, 'the activity reason clears on recovery').toBeFalsy();

        await expect(page.locator('.fm-spine-banner-degraded'), 'the degraded banner clears on recovery').toHaveCount(0);

        await fleet.close();

        expect(pageErrors, 'the liveness journey must be error-free in the main window').toEqual([])
    });
});
