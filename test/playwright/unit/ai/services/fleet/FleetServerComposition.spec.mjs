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

    test('the canonical render carries a DEDICATED class-3 service credential by file custody — never the admission token', () => {
        expect(composeYaml).toContain('NEO_FLEET_PLANE_BEARER_FILE: /run/secrets/fleet-plane-token');

        // Separated-token teeth at the render level: the plane bearer's file and the
        // bootstrap/healthcheck admission token's file are DISTINCT paths.
        expect(composeYaml).not.toContain('NEO_FLEET_PLANE_BEARER_FILE: /run/secrets/mcp-auth-token');

        // Anchored on the service KEY's line shape — the wake self-base URL contains the same
        // literal mid-line.
        const fleetService = composeYaml.split(/\n  fleet-server:\n/)[1].split(/\n  \S+:\n/)[0];

        expect(fleetService).toContain('- fleet-plane-token');

        // And the secret itself is declared with the profile's loud-at-start custody shape.
        expect(composeYaml).toContain('fleet-plane-token:');
        expect(composeYaml).toContain('${NEO_FLEET_PLANE_TOKEN_FILE:-${HOME}/.neo-ai/secrets/fleet-plane-token}')
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

test.describe('FleetServerComposition - per-viewer ownership through the real server and arming context', () => {
    test('two authenticated viewers arm two MC-owned routes with their own bearers, and neither receives the other\'s digest', async () => {
        const {startFleetServer} = await import('../../../../../../ai/services/fleet/fleetServer.mjs');

        const
            viewersByBearer = {
                'ada-token'    : {login: 'ada', providerUserId: 1, identity: '@ada'},
                'grace-token'  : {login: 'grace', providerUserId: 2, identity: '@grace'},
                'service-token': {login: 'svc', providerUserId: 9, identity: '@svc'},
                // The class-3 mints — DISTINCT credentials for the same viewers, because the
                // ledger forbids the class-1 admission bearer from serving the MC audience.
                'ada-mc-token'  : {login: 'ada', providerUserId: 1, identity: '@ada'},
                'grace-mc-token': {login: 'grace', providerUserId: 2, identity: '@grace'}
            },
            keysByIdentity = {},
            toolCallsByIdentity = {};

        // One plane-client stub per CREDENTIAL: init proves the bearer's own identity, and
        // every subscription it creates is owned by exactly that identity — MC's caller-owned
        // model, mirrored. No privileged callTool ever touches the fan-out directly.
        const createPlaneClient = ({credential}) => {
            const viewer = viewersByBearer[credential];

            return {
                async init() {
                    return viewer ? {ok: true, identity: viewer.identity} : {ok: false, reason: 'unknown bearer'}
                },
                async callTool(name, args) {
                    (toolCallsByIdentity[viewer.identity] ??= []).push(args.action);

                    if (args.action === 'subscribe') return {subscriptionId: `WAKE_SUB:${viewer.login}`};

                    if (args.action === 'rotate-key') {
                        const key = crypto.randomBytes(32).toString('hex');
                        keysByIdentity[viewer.identity] = key;
                        return {subscriptionId: `WAKE_SUB:${viewer.login}`, signingKey: key}
                    }
                },
                async close() {}
            }
        };

        const server = await new Promise((resolve, reject) => {
            startFleetServer({
                host    : '127.0.0.1',
                port    : 0,
                aiConfig: {
                    publicUrl    : 'http://127.0.0.1:3102/fleet',
                    mcpHttpHost  : '127.0.0.1',
                    mcpListenHost: '127.0.0.1',
                    fleet        : {
                        port              : 0,
                        dataDir           : '/unused',
                        wakeSelfBase      : 'http://fleet-server:8083',
                        planeBase         : 'http://ingress:8080',
                        planeBearer       : 'service-token',
                        planeBearerFile   : '',
                        admissionTokenFile: '',
                        planeInternalHosts: ['ingress']
                    }
                },
                planeGuard        : () => {},
                logger            : QUIET,
                createPlaneClient,
                resolveViewerClaim: async () => ({agentIdentityNodeId: '@svc'}),
                authService       : {
                    setupPreCors() {},
                    async setup({app: target}) {
                        target.use((req, res, next) => {
                            const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
                            const viewer = viewersByBearer[bearer];

                            if (viewer) {
                                req.auth = {
                                    userId          : viewer.login,
                                    username        : `${viewer.login} display`,
                                    providerUsername: viewer.login,
                                    authProvider    : 'github',
                                    providerUserId  : viewer.providerUserId
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
            }).then(resolve, reject)
        });

        const base = `http://127.0.0.1:${server.address().port}`;

        async function connectSse(fleetBearer, mcBearer = null) {
            const headers = {accept: 'text/event-stream', authorization: `Bearer ${fleetBearer}`};

            if (mcBearer) {
                headers['x-neo-mc-authorization'] = `Bearer ${mcBearer}`
            }

            const response = await fetch(`${base}/fleet/events`, {headers});

            expect(response.status).toBe(200);

            const reader = response.body.getReader();
            // Drain the handshake (retry + per-viewer state event).
            await reader.read();

            return reader
        }

        try {
            // The non-alias falsifier FIRST: a viewer presenting ONLY the class-1 Fleet
            // admission bearer arms NOTHING — that header is never forwarded to /mc/mcp.
            const classOneOnly = await connectSse('ada-token');

            expect(toolCallsByIdentity['@ada']).toBeUndefined();
            await classOneOnly.cancel();

            // The identical-token mutant: PATs carry no audience claim, so the SAME bytes in
            // both headers would be admitted by both verifiers — the arming seam must refuse
            // equality itself. Zero MC calls, honest unarmed stream.
            const sameToken = await connectSse('ada-token', 'ada-token');

            expect(toolCallsByIdentity['@ada']).toBeUndefined();
            await sameToken.cancel();

            // Per-viewer arming rides the SEPARATELY CARRIED class-3 credential.
            const
                adaReader   = await connectSse('ada-token', 'ada-mc-token'),
                graceReader = await connectSse('grace-token', 'grace-mc-token');

            // Both viewers armed their OWN MC-owned routes with their OWN class-3 bearers.
            expect(toolCallsByIdentity['@ada']).toEqual(['subscribe', 'rotate-key']);
            expect(toolCallsByIdentity['@grace']).toEqual(['subscribe', 'rotate-key']);

            // A wake for ada, signed with ada's MC-active key, through the real receiver.
            const adaEnvelope = {
                eventId       : 'EVT:ada-1',
                subscriptionId: 'WAKE_SUB:ada',
                agentIdentity : '@ada',
                eventType     : 'wake/digest',
                schemaVersion : '1.0',
                payload       : {digest: 'for ada only'}
            };
            const body = JSON.stringify(adaEnvelope);

            const delivery = await fetch(`${base}/wake`, {
                method : 'POST',
                headers: {
                    'content-type'              : 'application/json',
                    'x-neo-wake-subscription-id': 'WAKE_SUB:ada',
                    'x-neo-wake-event-id'       : 'EVT:ada-1',
                    'x-neo-wake-schema-version' : '1.0',
                    'x-neo-wake-signature'      : crypto.createHmac('sha256', keysByIdentity['@ada']).update(body).digest('hex')
                },
                body
            });

            expect(delivery.status).toBe(200);

            const adaChunk = await Promise.race([
                adaReader.read().then(({value}) => Buffer.from(value).toString('utf8')),
                new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), 1500))
            ]);

            expect(adaChunk).toContain('for ada only');

            const graceChunk = await Promise.race([
                graceReader.read().then(({value}) => Buffer.from(value).toString('utf8')),
                new Promise(resolve => setTimeout(() => resolve('SILENT'), 400))
            ]);

            expect(graceChunk).toBe('SILENT');

            await adaReader.cancel();
            await graceReader.cancel()
        } finally {
            await new Promise(resolve => server.close(resolve))
        }
    })
});

test.describe('FleetServerComposition - the relay stream consumer against the composed admission chain', () => {
    test('the production credential chain end-to-end: the resolved fleet-client mint is admitted and drives cold catch-up; the plane-MCP mint is refused with an honest observation', async () => {
        const {startFleetServer, assertFleetPlaneAdmissionBearerClass} = await import('../../../../../../ai/services/fleet/fleetServer.mjs');
        const {createFleetWakeSseConsumer}                             = await import('../../../../../../ai/services/fleet/fleetWakeSseConsumer.mjs');

        const waitUntil = async (predicate, timeoutMs = 2000) => {
            const deadline = Date.now() + timeoutMs;

            while (Date.now() < deadline) {
                if (predicate()) return true;
                await new Promise(resolve => setTimeout(resolve, 20))
            }

            return predicate()
        };

        // The deployed plane's admission shape, mirrored: the fleet surface admits the relay
        // viewer's fleet-client mint and does NOT admit the relay's plane-MCP mint — a minted
        // MC credential resolves to no provider subject there.
        const server = await startFleetServer({
            host    : '127.0.0.1',
            port    : 0,
            aiConfig: {
                publicUrl    : 'http://127.0.0.1:3102/fleet',
                mcpHttpHost  : '127.0.0.1',
                mcpListenHost: '127.0.0.1',
                fleet        : {
                    port              : 0,
                    dataDir           : '/unused',
                    wakeSelfBase      : 'http://fleet-server:8083',
                    planeBase         : 'http://ingress:8080',
                    planeBearer       : 'service-token',
                    planeBearerFile   : '',
                    admissionTokenFile: '',
                    planeInternalHosts: ['ingress']
                }
            },
            planeGuard       : () => {},
            logger           : QUIET,
            createPlaneClient: ({credential}) => ({
                async init() {
                    return credential === 'service-token'
                        ? {ok: true, identity: '@svc'}
                        : {ok: false, reason: 'unknown bearer'}
                },
                async callTool(name, args) {
                    if (args.action === 'subscribe')  return {subscriptionId: 'WAKE_SUB:svc'};
                    if (args.action === 'rotate-key') return {subscriptionId: 'WAKE_SUB:svc', signingKey: 'b'.repeat(64)}
                },
                async close() {}
            }),
            resolveViewerClaim: async () => ({agentIdentityNodeId: '@svc'}),
            authService       : {
                setupPreCors() {},
                async setup({app: target}) {
                    target.use((req, res, next) => {
                        const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

                        if (bearer === 'relay-fleet-pat') {
                            req.auth = {
                                userId          : 'svc',
                                username        : 'svc display',
                                providerUsername: 'svc',
                                authProvider    : 'github',
                                providerUserId  : 9
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

        const base = `http://127.0.0.1:${server.address().port}`;

        // The RELAY's own config, resolved the way production resolves it: a distinct
        // fleet-client mint declared BESIDE the plane-MCP mint. The class teeth pass exactly
        // because the mints differ.
        const credential = assertFleetPlaneAdmissionBearerClass({
            aiConfig: {fleet: {
                planeBearer             : 'relay-mc-mint',
                planeBearerFile         : '',
                planeAdmissionBearer    : 'relay-fleet-pat',
                planeAdmissionBearerFile: '',
                admissionTokenFile      : ''
            }}
        });

        expect(credential).toBe('relay-fleet-pat');

        const pollCalls = [];

        const consumer = createFleetWakeSseConsumer({
            eventsUrl   : `${base}/fleet/events`,
            credential,
            retryFloorMs: 50,
            logger      : QUIET,
            pollDigest  : async args => {
                pollCalls.push(args);
                return {counts: {pending: 4}, watermark: 30}
            }
        });

        // The pre-repair defect, pinned at the wire: production used to hand this consumer the
        // plane-MCP credential, which the fleet surface refuses — and the axis must render that
        // refusal, never a fabricated verdict. The long floor keeps the retry loop out of the
        // assertion window.
        const wrongClass = createFleetWakeSseConsumer({
            eventsUrl   : `${base}/fleet/events`,
            credential  : 'relay-mc-mint',
            retryFloorMs: 5000,
            logger      : QUIET
        });

        try {
            consumer.start();

            // The composed handshake vouches the boot-armed subscription id, and that alone
            // drives the cold catch-up — no live wake exists anywhere in this test.
            await waitUntil(() => consumer.resolveDeliveryLiveness().reason?.includes?.('caught up'));

            expect(consumer.describe().subscriptionId).toBe('WAKE_SUB:svc');
            expect(pollCalls).toEqual([{subscriptionId: 'WAKE_SUB:svc', sinceLogId: 0}]);
            expect(consumer.describe().watermark).toBe(30);

            const liveness = consumer.resolveDeliveryLiveness();

            expect(liveness.alive).toBe(true);
            expect(liveness.reason).toContain('armed for this viewer');
            expect(liveness.reason).toContain('4 pending caught up');

            wrongClass.start();
            await waitUntil(() => wrongClass.describe().lastDisconnect === 'stream refused: HTTP 401');

            expect(wrongClass.describe().lastDisconnect).toBe('stream refused: HTTP 401');
            expect(wrongClass.resolveDeliveryLiveness().alive).toBe('unknown');
            expect(wrongClass.describe().subscriptionId).toBeNull()
        } finally {
            consumer.stop();
            wrongClass.stop();
            await new Promise(resolve => server.close(resolve))
        }
    })
});
