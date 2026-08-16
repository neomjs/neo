import {test, expect}                                   from '../../fixtures.mjs';
import {generateLocalBearerToken}                       from '../../../../ai/mcp/server/shared/helpers/localBearer.mjs';
import {E2E_FLEET_VIEWER, wireAuthenticatedFleetBridge} from './authenticatedFleetHarness.mjs';

/**
 * @summary The viewer wake journey proven on the MOUNTED cockpit against the REAL
 * push-lane producer: bridge wired (two mints, two headers) → the cockpit's liveness tick rebinds
 * the wake stream to the NEW bridge (custody heal) → the fanout's `state` handshake vouches
 * `armedForViewer` + the subscription id → the telltale renders `wake: live` → a digest pushed
 * through the production fan-out lands in the page (feed detail on the telltale title) →
 * transport killed → the telltale carries the consumer's own absence-of-signal reason → transport
 * restarted at the SAME endpoint → the consumer's OWN reconnect (no re-wire) restores `live`.
 *
 * The SSE surface is the PRODUCTION fan-out (`createFleetWakeFanout`) — registerStream's
 * handshake, arming via the real `armRelaySubscription` path (plane calls injected), and
 * `handleDigest` routing by proven identity. Only the HTTP shell around it is fixture: admission
 * is a bearer-equality check, and every OTHER wire surface answers 404 DELIBERATELY — the roster
 * and activity stay honestly degraded throughout, proving the viewer-wake axis is independent
 * chrome, not a spine passenger.
 *
 * The cold-drain leg rides the capability's BROKERED digest-poll default: the vouched handshake
 * triggers one `POST /fleet/events/digest` carrying the SAME two headers as the stream, the
 * fixture answers the endpoint contract, and the drained count renders in the telltale detail —
 * no worker-realm injection, no mint outside the bridge closure. The consumer-level catch-up
 * mechanics (watermark continuity, fresh ≠ empty ≠ failed) stay pinned in
 * `fleetWakeStreamConsumer.spec.mjs`; the server-side brokering (viewer-credentialed MC session)
 * is pinned in `fleetWakeArming.spec.mjs` + `FleetServerComposition.spec.mjs`.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/FleetCockpitViewerWakeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 *
 * @see apps/agentos/view/fleet/FleetCockpit.mjs (ensureViewerWakeStream / stampViewerWake / syncViewerWakeTelltale)
 * @see apps/agentos/fleet/fleetWakeStreamConsumer.mjs (the browser consumer under test)
 * @see ai/services/fleet/fleetWakeFanout.mjs (the production push-lane producer)
 */

const VIEWER_IDENTITY = E2E_FLEET_VIEWER.agentIdentityNodeId;

/**
 * @summary Starts the wake fixture: the PRODUCTION fan-out behind a minimal admission shell.
 * `/fleet/events` admits by bearer equality and hands the response to `registerStream`; every
 * other path answers a refusal, so only the push lane is wired — deliberately.
 * @param {Object} options
 * @param {String} options.bearerToken Class-1 admission the stream must present.
 * @param {Number} [options.port=0] 0 = ephemeral; the captured port on restart.
 * @returns {Promise<Object>} `{fanout, headersSeen, port, endpoint, arm, close}`
 */
async function startWakeFixture({bearerToken, port = 0}) {
    const
        {createServer}          = await import('node:http'),
        {createFleetWakeFanout} = await import('../../../../ai/services/fleet/fleetWakeFanout.mjs');

    const
        fanout      = createFleetWakeFanout({heartbeatMs: 1000, logger: {error: () => {}, warn: () => {}}}),
        digestCalls = [],
        headersSeen = [];

    const server = createServer((req, res) => {
        const origin = req.headers.origin;

        // the fixture's CORS shell: the SSE fetch carries two custom headers, so the preflight
        // must allow them, and the streaming response must carry the origin grant (set BEFORE
        // registerStream's writeHead — setHeader values merge into it).
        origin && res.setHeader('access-control-allow-origin', origin);

        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'access-control-allow-headers': 'accept, authorization, content-type, x-neo-mc-authorization',
                'access-control-allow-methods': 'GET, POST'
            });
            res.end();
            return
        }

        if (req.method === 'POST' && req.url.startsWith('/fleet/events/digest')) {
            const class1 = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

            let raw = '';

            req.on('data', chunk => { raw += chunk });
            req.on('end', () => {
                let body = null;

                try { body = JSON.parse(raw) } catch {/* refused below */}

                digestCalls.push({
                    body,
                    class1Matches: class1 === bearerToken,
                    class3       : req.headers['x-neo-mc-authorization'] ?? null
                });

                if (class1 !== bearerToken || !req.headers['x-neo-mc-authorization'] || !body?.subscriptionId) {
                    res.writeHead(403, {'content-type': 'application/json'});
                    res.end('{"state":"refused","error":"fleet: digest poll refused"}');
                    return
                }

                // the endpoint contract: the brokered MC poll-digest result inside the ok envelope
                res.writeHead(200, {'content-type': 'application/json'});
                res.end(JSON.stringify({state: 'ok', result: {counts: {pending: 4}, watermark: 7}}))
            });
            return
        }

        if (req.method === 'GET' && req.url.startsWith('/fleet/events')) {
            const class1 = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

            headersSeen.push({
                class1Matches: class1 === bearerToken,
                class3       : req.headers['x-neo-mc-authorization'] ?? null
            });

            if (class1 !== bearerToken) {
                res.writeHead(401, {'content-type': 'application/json'});
                res.end('{"error":"fleet: admission refused"}');
                return
            }

            fanout.registerStream(VIEWER_IDENTITY, res);
            return
        }

        // every non-push surface refuses — roster/activity degrade honestly, by design
        res.writeHead(404, {'content-type': 'application/json'});
        res.end('{"state":"refused","error":"fleet: unknown operation"}')
    });

    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

    const boundPort = server.address().port;

    return {
        digestCalls,
        fanout,
        headersSeen,
        port    : boundPort,
        endpoint: `http://127.0.0.1:${boundPort}/fleet`,

        /**
         * @summary Arms the push lane through the REAL arming path with an injected plane: the
         * fake `callTool` answers `subscribe` with the subscription id and `rotate-key` with a
         * signing key — after which `describeStateFor` vouches `armedForViewer` + the id.
         * @param {String} subscriptionId
         * @returns {Promise<Object>}
         */
        arm(subscriptionId) {
            return fanout.armRelaySubscription({
                identity    : VIEWER_IDENTITY,
                wakeSelfBase: `http://127.0.0.1:${boundPort}`,
                callTool    : async (name, args) => args.action === 'subscribe'
                    ? {subscriptionId}
                    : {signingKey: 'e2e-signing-key-not-a-secret'}
            })
        },

        close() {
            return new Promise(resolve => {
                fanout.dispose();
                server.close(resolve);
                // the brokered digest poll leaves a keep-alive socket behind — without this,
                // `server.close` waits out the idle timeout and the test eats its own budget
                server.closeAllConnections?.()
            })
        }
    }
}

test.describe('FleetCockpit — viewer wake push journey (#17130 leg 2)', () => {
    test('bridge wire → custody rebind → armed handshake → live telltale → pushed digest → loss → self-reconnect', async ({page, neuralLink}) => {
        test.setTimeout(180_000);

        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        const
            bearerToken    = generateLocalBearerToken(),
            mcMint         = generateLocalBearerToken(), // distinct by construction — never aliased
            subscriptionId = 'WAKE_SUB:e2e-viewer-wake';

        let fixture = await startWakeFixture({bearerToken});

        const fixturePort = fixture.port;

        expect((await fixture.arm(subscriptionId)).armed, 'the real arming path must arm against the injected plane').toBe(true);

        // ── boot the cockpit (fail-closed bridge), then wire the authenticated one ──────────────
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});

        const app        = await neuralLink.connectToApp('AgentOS'),
              [cockpit0] = await app.queryComponent({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              cockpitId  = cockpit0?.properties?.id;

        expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        await wireAuthenticatedFleetBridge({app, fleetUrl: fixture.endpoint, bearerToken, mcAuthorization: mcMint});

        // a fast deterministic cadence so the liveness tick performs the custody rebind promptly
        await app.setProperties(cockpitId, {livenessPollInterval: 300, livenessReadTimeout: 2500});
        await app.callMethod(cockpitId, 'stopLiveness');
        await app.callMethod(cockpitId, 'startLiveness');

        const telltale = page.locator('.fm-viewer-wake');

        // ── the armed handshake reaches the chrome: live, quietly ───────────────────────────────
        await expect(telltale, 'the telltale reaches wake: live through the rebound bridge').toHaveText(/^wake: live/, {timeout: 30000});
        await expect(telltale).toHaveClass(/fm-viewer-wake-live/);

        const liveTitle = await telltale.getAttribute('title');

        expect(liveTitle, 'the title carries the armed reason').toContain('armed for this viewer');

        // two mints, two headers, wire-level: the admitted stream presented the class-1 bearer and
        // the DISTINCT class-3 mint on its own header
        const admitted = fixture.headersSeen.filter(entry => entry.class1Matches);

        expect(admitted.length).toBeGreaterThan(0);
        expect(admitted[admitted.length - 1].class3).toBe(`Bearer ${mcMint}`);

        // ── the COLD DRAIN through the brokered default: the vouched handshake fired exactly one
        // digest poll on the events origin, carrying the SAME two headers, and the drained count
        // renders in the telltale detail — the catch-up truth lane, end-to-end in the page
        await expect.poll(async () => await telltale.getAttribute('title') ?? '', {
            message: 'the brokered cold drain reaches the telltale detail', timeout: 20000, intervals: [250]
        }).toContain('catch-up: fresh (4 pending drained)');

        const drained = fixture.digestCalls[0];

        expect(drained, 'the vouched handshake must trigger the digest poll').toBeTruthy();
        expect(drained.class1Matches).toBe(true);
        expect(drained.class3).toBe(`Bearer ${mcMint}`);
        expect(drained.body.subscriptionId).toBe(subscriptionId);
        expect(drained.body.sinceLogId).toBe(0);

        // ── a digest pushed through the PRODUCTION fan-out lands in the page ────────────────────
        fixture.fanout.handleDigest({
            subscriptionId,
            agentIdentity: VIEWER_IDENTITY,
            envelope     : {
                schemaVersion: '1.0',
                eventType    : 'wake/digest',
                eventId      : '01H-E2E-WAKE-1',
                logId        : 7,
                agentIdentity: VIEWER_IDENTITY,
                subscriptionId,
                payload      : {watermark: 7},
                emittedAt    : new Date().toISOString()
            }
        });

        await expect.poll(async () => await telltale.getAttribute('title') ?? '', {
            message: 'the pushed digest reaches the telltale detail (the feed rendering)', timeout: 20000, intervals: [250]
        }).toContain('last signals: wake/digest');

        // the wake axis is independent chrome: the spine may be degraded (every non-push surface
        // refuses here, deliberately) while MY push lane is live — different surfaces, different truths
        await expect(telltale).toHaveText(/^wake: live/);

        // ── transport KILLED: the consumer's own observation reaches the chrome verbatim ────────
        await fixture.close();

        await expect(telltale, 'a dead stream renders the absence-of-signal reason, never a verdict')
            .toHaveText(/^wake: .*poll remains the truth lane/, {timeout: 30000});
        await expect(telltale).toHaveClass(/fm-viewer-wake-degraded/);

        // ── transport RESTARTED at the SAME endpoint: the consumer reconnects ITSELF ────────────
        fixture = await startWakeFixture({bearerToken, port: fixturePort});
        expect((await fixture.arm(subscriptionId)).armed).toBe(true);

        // no re-wire, no new bridge: recovery is the consumer's own backoff loop
        await expect(telltale, 'the consumer self-reconnects and the telltale returns to live')
            .toHaveText(/^wake: live/, {timeout: 60000});

        await fixture.close();

        expect(pageErrors, 'the wake journey must be error-free in the main window').toEqual([])
    })
});
