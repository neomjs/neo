import {setup} from '../../../../setup.mjs';

const appName = 'FleetServerCompositionTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import crypto          from 'node:crypto';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';

import {createFleetWakeFanout} from '../../../../../../ai/services/fleet/fleetWakeFanout.mjs';
import {createFleetServerApp}  from '../../../../../../ai/services/fleet/fleetServer.mjs';

const
    REPO_ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..'),
    cloudCaddy  = readFileSync(path.join(REPO_ROOT, 'ai/deploy/Caddyfile'), 'utf8'),
    localCaddy  = readFileSync(path.join(REPO_ROOT, 'ai/deploy/Caddyfile.local-agent-os'), 'utf8'),
    composeYaml = readFileSync(path.join(REPO_ROOT, 'ai/deploy/docker-compose.local-agent-os.yml'), 'utf8');

/**
 * Deploy-polarity assertions at the executable seam: these are the exact strings Caddy and
 * Compose parse, so a drifted matcher, a dropped SSE flush, or an ingress-exposed `/wake`
 * fails HERE instead of at the first live wake on a rebuilt plane.
 */
test.describe('FleetServerComposition - ingress and compose polarity for the wake lane', () => {
    for (const [label, content] of [['cloud Caddyfile', cloudCaddy], ['local-agent-os Caddyfile', localCaddy]]) {
        test(`${label}: the primary Fleet matcher is exact and includes the SSE route`, () => {
            expect(content).toContain('@fleet path /fleet /fleet/probe /fleet/events')
        });

        test(`${label}: every 502 error matcher carries the SSE route alongside its siblings`, () => {
            const errorBlocks = content.match(/handle_errors 502 \{[\s\S]*?\}/g) ?? [];

            expect(errorBlocks.length).toBeGreaterThan(0);

            for (const block of errorBlocks) {
                expect(block).toContain('/fleet /fleet/probe /fleet/events')
            }
        });

        test(`${label}: SSE responses stream unbuffered`, () => {
            expect(content).toContain('flush_interval -1')
        });

        test(`${label}: the signed wake receiver is NOT ingress-routed`, () => {
            // `/wake` must appear in no matcher and no proxy line — reachability is never
            // authentication, and the receiver's audience is the compose-internal dispatcher.
            expect(content).not.toMatch(/path[^\n]*\/wake\b/);
            expect(content).not.toMatch(/reverse_proxy[^\n]*\/wake\b/)
        })
    }

    test('the composed fleet-server declares its dialable wake self-address by service DNS', () => {
        expect(composeYaml).toContain('NEO_FLEET_WAKE_SELF_BASE: http://fleet-server:8083')
    });

    test('the composed fleet-server carries a dialable, policy-admissible MC arming path', () => {
        expect(composeYaml).toContain('NEO_FLEET_PLANE_BASE: http://ingress:8080');
        expect(composeYaml).toContain('NEO_FLEET_PLANE_INTERNAL_HOSTS: ingress')
    });

    test('bearer and identity are operator-supplied pass-throughs, never literals in the file', () => {
        expect(composeYaml).toContain('NEO_FLEET_PLANE_BEARER: ${NEO_FLEET_PLANE_BEARER:-}');
        expect(composeYaml).toContain('NEO_AGENT_IDENTITY: ${NEO_AGENT_IDENTITY:-}');
        expect(composeYaml).not.toMatch(/NEO_FLEET_PLANE_BEARER: (?!\$\{)[^\s]/)
    });

    test('the ingress the arming path dials is the address the local Caddyfile actually binds', () => {
        expect(localCaddy.trimStart().startsWith(':8080')).toBe(true)
    })
});

const
    QUIET       = {info: () => {}, warn: () => {}, error: () => {}},
    SIGNING_KEY = crypto.randomBytes(32).toString('hex');

/**
 * The real Express app with its real middleware order — only the trust collaborators are
 * injected: a plane guard that does not demand a mounted volume, an auth stub that either
 * stamps or withholds the provider identity, and a permissive host allowlist. The wake route,
 * limiter chain, admission middleware, and SSE handler are all production code.
 */
async function startTestServer({authenticated = true} = {}) {
    const fanout = createFleetWakeFanout({logger: QUIET, heartbeatMs: 0});

    await fanout.armRelaySubscription({
        identity    : '@viewer',
        wakeSelfBase: 'http://fleet-server:8083',
        callTool    : async (name, args) => (
            args.action === 'subscribe'
                ? {subscriptionId: 'WAKE_SUB:live'}
                : {subscriptionId: 'WAKE_SUB:live', signingKey: SIGNING_KEY}
        )
    });

    const app = await createFleetServerApp({
        aiConfig: {
            publicUrl  : 'http://127.0.0.1:3102/fleet',
            mcpHttpHost: '127.0.0.1',
            fleet      : {port: 0, dataDir: '/unused-by-noop-guard'}
        },
        planeGuard : () => {},
        wakeFanout : fanout,
        logger     : QUIET,
        authService: {
            setupPreCors() {},
            async setup({app: target}) {
                target.use((req, res, next) => {
                    if (authenticated) {
                        req.auth = {
                            userId          : 'u1',
                            username        : 'viewer',
                            providerUsername: 'viewer',
                            authProvider    : 'github',
                            providerUserId  : 7
                        }
                    }

                    next()
                })
            }
        },
        transportService: {
            computeAllowedHosts: () => ['127.0.0.1'],
            installCors() {}
        }
    });

    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    });

    return {
        fanout,
        server,
        base: `http://127.0.0.1:${server.address().port}`,
        async close() {
            fanout.dispose();
            await new Promise(resolve => server.close(resolve))
        }
    }
}

function signedWakeRequest(base, {envelope, headerOverrides = {}} = {}) {
    const body = JSON.stringify(envelope);

    return fetch(`${base}/wake`, {
        method : 'POST',
        headers: {
            'content-type'              : 'application/json',
            'x-neo-wake-subscription-id': envelope.subscriptionId,
            'x-neo-wake-event-id'       : envelope.eventId,
            'x-neo-wake-schema-version' : envelope.schemaVersion,
            'x-neo-wake-signature'      : crypto.createHmac('sha256', SIGNING_KEY).update(body).digest('hex'),
            ...headerOverrides
        },
        body
    })
}

test.describe('FleetServerComposition - server-level route positives and negatives', () => {
    const liveEnvelope = {
        eventId       : 'EVT:live-1',
        subscriptionId: 'WAKE_SUB:live',
        agentIdentity : '@viewer',
        eventType     : 'wake/digest',
        schemaVersion : '1.0',
        payload       : {digest: 'hello'}
    };

    test('a signed internal wake POST is accepted end-to-end through the real app', async () => {
        const harness = await startTestServer();

        try {
            const response = await signedWakeRequest(harness.base, {envelope: liveEnvelope});

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ok: true, state: 'accepted'})
        } finally {
            await harness.close()
        }
    });

    test('an unknown subscription answers the dispatcher-recognised 404 through the real app', async () => {
        const harness = await startTestServer();

        try {
            const response = await signedWakeRequest(harness.base, {
                envelope       : {...liveEnvelope, subscriptionId: 'WAKE_SUB:stranger'},
                headerOverrides: {'x-neo-wake-subscription-id': 'WAKE_SUB:stranger'}
            });

            expect(response.status).toBe(404);
            expect(await response.json()).toEqual({error: 'unknown-subscription'})
        } finally {
            await harness.close()
        }
    });

    test('an authenticated viewer receives a live SSE stream with the per-viewer state event', async () => {
        const harness = await startTestServer();

        try {
            const response = await fetch(`${harness.base}/fleet/events`, {headers: {accept: 'text/event-stream'}});

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toBe('text/event-stream');

            const reader  = response.body.getReader();
            const {value} = await reader.read();
            const opening = Buffer.from(value).toString('utf8');

            expect(opening).toContain('retry: 5000');
            await reader.cancel()
        } finally {
            await harness.close()
        }
    });

    test('an unauthenticated request never reaches the SSE surface', async () => {
        const harness = await startTestServer({authenticated: false});

        try {
            const response = await fetch(`${harness.base}/fleet/events`, {headers: {accept: 'text/event-stream'}});

            expect(response.status).toBe(401)
        } finally {
            await harness.close()
        }
    })
});
