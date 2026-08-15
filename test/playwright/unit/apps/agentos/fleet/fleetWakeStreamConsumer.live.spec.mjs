import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {unitTestMode: true},
    appConfig: {
        name             : 'FleetWakeStreamConsumerLiveTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

import {createFleetServerApp} from '../../../../../../ai/services/fleet/fleetServer.mjs';

import {createFleetWakeStreamConsumer} from '../../../../../../apps/agentos/fleet/fleetWakeStreamConsumer.mjs';

// The L3 live non-destructive probe for the browser consumer: the REAL composed fleet server —
// real admission chain, real events limiter, real fanout handshake (retry hint + state frame) —
// answered by the REAL browser twin over actual HTTP. Nothing is stubbed on the wire; the custom
// auth middleware is the harness's identity stamp, exactly as the server's own spec uses it.

const QUIET = {info() {}, warn() {}, error() {}};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function liveConfig({authMiddleware}) {
    return {
        publicUrl    : 'https://agent-os.example.test/mc/mcp',
        allowedHosts : null,
        mcpHttpHost  : '127.0.0.1',
        mcpListenHost: '127.0.0.1',
        authMiddleware,
        auth         : {
            mode                   : 'custom',
            host                   : null,
            issuerUrl              : null,
            trustProxyIdentity     : false,
            pinFirstProviderSubject: false,
            githubApiBaseUrl       : 'https://api.github.test',
            patCacheTtlSeconds     : 60,
            patValidationTimeoutMs : 5_000,
            allowedUsers           : []
        },
        fleet: {
            port          : 8083,
            dataDir       : '/app/.neo-ai-data/fleet',
            cockpitOrigins: ['http://localhost:8080', 'http://127.0.0.1:8080']
        }
    }
}

async function startLiveServer({authMiddleware}) {
    const app = await createFleetServerApp({
        aiConfig: liveConfig({authMiddleware}),
        logger  : QUIET,
        planeGuard() {}
    });

    const server = await new Promise((resolve, reject) => {
        const candidate = app.listen(0, '127.0.0.1', () => resolve(candidate));
        candidate.once('error', reject)
    });

    return {
        eventsUrl: `http://127.0.0.1:${server.address().port}/fleet/events`,
        close    : () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
}

test.describe('fleetWakeStreamConsumer — L3 live probe against the real composed server', () => {
    test('an admitted viewer gets the REAL handshake: state observed alive, and the server retry hint raises the client floor', async () => {
        const {eventsUrl, close} = await startLiveServer({
            authMiddleware(req, res, next) {
                // The stable-subject triple the stream key derives from — provider coordinates,
                // never the mutable login (the same principal discipline the admission owns).
                req.auth = {
                    userId          : 'live-viewer',
                    username        : 'live-viewer',
                    source          : 'test-provider',
                    authProvider    : 'github',
                    providerUserId  : '424242',
                    providerUsername: 'live-viewer'
                };
                next()
            }
        });

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl,
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({authorization: 'Bearer live-class-1'})
        });

        try {
            consumer.start();
            await wait(150);

            const liveness = consumer.resolveDeliveryLiveness();

            expect(liveness.alive).toBe(true);
            expect(liveness.reason).toContain('composed wake stream connected');

            const snapshot = consumer.describe();

            // The REAL fanout handshake: its `retry: 5000` hint raised the injected 10ms floor,
            // and the real `state` frame landed as the first observation.
            expect(snapshot.retryFloorMs).toBe(5000);
            expect(snapshot.lastState).not.toBeNull();
            expect(snapshot.connected).toBe(true)
        } finally {
            consumer.stop();
            await close()
        }
    });

    test('an unadmitted viewer is REFUSED by the real chain and observed honestly — poll remains the truth lane', async () => {
        const {eventsUrl, close} = await startLiveServer({
            authMiddleware(req, res, next) {
                req.auth = {source: 'custom'}; // identityless: transport admitted, subject absent
                next()
            }
        });

        const consumer = createFleetWakeStreamConsumer({
            eventsUrl,
            retryFloorMs: 10,
            logger      : QUIET,
            authHeaders : () => ({})
        });

        try {
            consumer.start();
            await wait(150);

            const liveness = consumer.resolveDeliveryLiveness();

            expect(liveness.alive).toBe('unknown');
            expect(liveness.reason).toMatch(/stream refused: HTTP (401|403)/);
            expect(liveness.reason).toContain('poll remains the truth lane')
        } finally {
            consumer.stop();
            await close()
        }
    })
});
