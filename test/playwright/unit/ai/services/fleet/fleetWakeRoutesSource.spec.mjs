import {expect, test}                      from '@playwright/test';
import fs                                  from 'node:fs/promises';
import os                                  from 'node:os';
import path                                from 'node:path';
import {createFleetWakeRoutesSource}       from '../../../../../../ai/services/fleet/fleetWakeRoutesSource.mjs';
import {createPlaneWakeObservationsReader} from '../../../../../../ai/services/fleet/planeWakeIdentitiesReader.mjs';

const ROSTER = [
    {id: 'ada',  githubUsername: 'neo-opus-ada'},
    {id: 'clio', githubUsername: 'neo-fable-clio'}
];

const PRESENCE_PAYLOAD = {
    generatedAt: '2026-08-03T20:00:00.000Z',
    agents     : [
        {
            identity: '@neo-opus-ada', state: 'idle', reason: 'stale add_memory activity',
            signals : {activityRecency: {lastActivityAt: '2026-08-03T18:29:27.443Z', fresh: false}}
        },
        {
            identity: '@neo-fable-clio', state: 'online', reason: 'recent add_memory activity',
            signals : {activityRecency: {lastActivityAt: '2026-08-03T19:55:00.000Z', fresh: true}}
        }
    ]
};

/**
 * @summary Build one fully-wired harness; per-axis collaborators are overridable per test.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function harness(overrides = {}) {
    return createFleetWakeRoutesSource({
        listAgents                        : () => ROSTER,
        resolveViewerIdentity             : () => '@e2e-operator',
        listActiveSubscriptionObservations: () => [{identity: '@neo-fable-clio', lastPollAt: '2026-08-03T19:58:00.000Z'}],
        resolveDeliveryLiveness           : () => ({alive: true, reason: null}),
        resolveTerminalDeliveryFailures   : () => ({state: 'observed', reason: null, byIdentity: new Map()}),
        readPresence                      : () => PRESENCE_PAYLOAD,
        now                               : () => new Date('2026-08-03T20:01:00.000Z'),
        ...overrides
    })
}

test.describe('fleetWakeRoutesSource — the decomposed per-seat wake-route read', () => {
    test('construction refuses missing required collaborators', () => {
        expect(() => createFleetWakeRoutesSource()).toThrow(TypeError);
        expect(() => createFleetWakeRoutesSource({listAgents: () => []})).toThrow(TypeError);
        expect(() => createFleetWakeRoutesSource({resolveViewerIdentity: () => '@a'})).toThrow(TypeError)
    });

    test('the envelope flip: with EVERY axis answering — arming included — wired/observed is finally reachable', async () => {
        // The conjunction rule's promised payoff. The arming axis was the structurally silent one
        // (a hardcoded false in the envelope until the receiver-manifest read existed); with a
        // genuine arming answer joining the other four axes, the envelope certifies the full
        // conjunction for the first time.
        const snapshot = await harness({
            resolveSeatArming: () => ({
                state     : 'observed',
                reason    : null,
                byIdentity: new Map([[
                    '@neo-fable-clio',
                    {routeCount: 2, adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir'}
                ]])
            })
        }).readWakeRoutes();

        expect(snapshot.capability).toEqual({
            source    : 'fleet:wakeRoutes', state: 'wired', confidence: 'observed',
            capturedAt: '2026-08-03T20:01:00.000Z',
            reason    : null
        });
        expect(snapshot.viewer).toBe('@e2e-operator');
        expect(snapshot.count).toBe(2);

        const [ada, clio] = snapshot.seats;

        // The armed row carries the allowlisted route detail — and ONLY it.
        expect(clio.armed).toEqual({
            state : 'armed',
            reason: null,
            route : {routeCount: 2, adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir'}
        });
        // A seat absent from a healthy manifest answer is genuinely UNARMED — a first-class
        // healthy answer, never collapsed into unknown.
        expect(ada.armed).toEqual({state: 'none', reason: null});

        expect(ada.subscription).toEqual({state: 'none', reason: null});
        // The active row carries the redacted poll-recency observation — the route-health
        // derivation input this axis exists to deliver.
        expect(clio.subscription).toEqual({state: 'active', reason: null, lastPollAt: '2026-08-03T19:58:00.000Z'});
        expect(clio.delivery).toEqual({state: 'alive', reason: null});
        expect(clio.lastFailure).toEqual({state: 'observed', reason: null, receipt: null});
        expect(clio.presence).toEqual({
            state: 'online', lastSeenAt: '2026-08-03T19:55:00.000Z', reason: 'recent add_memory activity'
        })
    });

    test('the composition witness: a declared manifest path ALONE — no resolver injection — arms the envelope through the receiver\'s own loader', async () => {
        // The production path end-to-end: the deployment-declared coordinate (the
        // `fleet.wakeReceiverManifestPath` leaf's value in production, a literal here) composes
        // the arming authority inside the source, which reads a REAL 0600 manifest file through
        // `loadWakeReceiverManifest` — mode gate, schema gate, allowlist projection included.
        // The injected resolver the envelope-flip test uses above is deliberately absent.
        const
            dir          = await fs.mkdtemp(path.join(os.tmpdir(), 'wake-manifest-')),
            manifestPath = path.join(dir, 'routes.json'),
            signingKey   = 'a-very-secret-hmac-key-material-0123456789abcdef';

        await fs.writeFile(manifestPath, JSON.stringify({
            schemaVersion: 1,
            routes       : {
                'WAKE_SUB:one': {
                    signingKey,
                    agentIdentity        : '@neo-fable-clio',
                    harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir', instanceAddress: '/Users/x/.claude-instances/neo-fable-clio'},
                    adapterConfig        : {attemptTimeoutMs: 30000}
                }
            }
        }), {mode: 0o600});
        await fs.chmod(manifestPath, 0o600);

        try {
            const snapshot = await harness({wakeReceiverManifestPath: manifestPath}).readWakeRoutes();

            expect(snapshot.capability).toEqual({
                source    : 'fleet:wakeRoutes', state: 'wired', confidence: 'observed',
                capturedAt: '2026-08-03T20:01:00.000Z',
                reason    : null
            });

            const [ada, clio] = snapshot.seats;

            expect(clio.armed).toEqual({
                state : 'armed',
                reason: null,
                route : {routeCount: 1, adapter: 'osascript', appName: 'Claude', addressType: 'userDataDir'}
            });
            // The real loader's answer feeds the same none-vs-unknown judgment as the injected one.
            expect(ada.armed).toEqual({state: 'none', reason: null});

            // The key-material negative holds through the REAL path too: the manifest on disk
            // carries the HMAC key, the published snapshot never does.
            expect(JSON.stringify(snapshot)).not.toContain(signingKey)
        } finally {
            await fs.rm(dir, {recursive: true, force: true})
        }
    });

    test('the armed-certification control survives: an absent arming read still forbids wired, as a typed unobserved', async () => {
        // The conjunction rule, preserved: the no-local-wake-lane branch (cloud profiles inject no
        // manifest path) keeps every seat's arming row a TYPED unobserved and keeps `wired`
        // unreachable — the reason names exactly the one silent axis.
        const snapshot = await harness().readWakeRoutes();

        expect(snapshot.capability).toEqual({
            source    : 'fleet:wakeRoutes', state: 'degraded', confidence: 'partial',
            capturedAt: '2026-08-03T20:01:00.000Z',
            reason    : 'arming axis: arming read path unavailable'
        });

        const [ada] = snapshot.seats;

        expect(ada.armed.state).toBe('unobserved');
        expect(typeof ada.armed.reason).toBe('string')
    });

    test('a throwing arming resolver degrades EVERY seat to unknown with the reason — never a fabricated none', async () => {
        const snapshot = await harness({
            resolveSeatArming: () => { throw new Error('receiver manifest walk exploded') }
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.reason).toContain('arming axis: receiver manifest walk exploded');

        for (const seat of snapshot.seats) {
            expect(seat.armed.state).toBe('unknown');
            expect(seat.armed.reason).toContain('receiver manifest walk exploded')
        }
    });

    test('a terminal receipt reaches its seat as a first-class row fact', async () => {
        const byIdentity = new Map([[
            '@neo-fable-clio',
            [{subscriptionId: 'sub-1', errorClass: 'connect-timeout', failedAt: '2026-08-03T19:00:00.000Z'}]
        ]]);

        const snapshot = await harness({
            resolveTerminalDeliveryFailures: () => ({state: 'observed', reason: null, byIdentity})
        }).readWakeRoutes();

        const clio = snapshot.seats.find(seat => seat.agentIdentity === '@neo-fable-clio');

        expect(clio.lastFailure.receipt).toEqual({errorClass: 'connect-timeout', failedAt: '2026-08-03T19:00:00.000Z'});
        expect(clio.lastFailure.reason).toContain('connect-timeout');

        // The sibling seat keeps its own clean answer — no shared-state bleed.
        const ada = snapshot.seats.find(seat => seat.agentIdentity === '@neo-opus-ada');

        expect(ada.lastFailure.receipt).toBeNull()
    });

    test('a throwing subscription scan degrades EVERY seat axis with the same reason, never a fabricated none', async () => {
        const snapshot = await harness({
            listActiveSubscriptionObservations: () => { throw new Error('plane wake fleet-identities answer unreadable') }
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.confidence).toBe('partial');
        expect(snapshot.capability.reason).toContain('subscription axis');

        for (const seat of snapshot.seats) {
            expect(seat.subscription.state).toBe('unknown');
            expect(seat.subscription.reason).toContain('unreadable')
        }
    });

    test('an active subscription no poll has touched renders lastPollAt null — absence-of-signal, never a verdict', async () => {
        const snapshot = await harness({
            listActiveSubscriptionObservations: () => [{identity: '@neo-fable-clio', lastPollAt: null}]
        }).readWakeRoutes();

        const clio = snapshot.seats.find(seat => seat.agentIdentity === '@neo-fable-clio');

        expect(clio.subscription).toEqual({state: 'active', reason: null, lastPollAt: null})
    });

    test('a pre-observation supplier (bare identity strings) fails the WHOLE axis honestly — a skipped entry would fabricate none', async () => {
        const snapshot = await harness({
            listActiveSubscriptionObservations: () => ['@neo-fable-clio']
        }).readWakeRoutes();

        for (const seat of snapshot.seats) {
            expect(seat.subscription.state).toBe('unknown');
            expect(seat.subscription.reason).toContain('unreadable')
        }
    });

    test('the production chain pin: the fleet-identities wire shape → plane observations reader → routes source → recency on the seat row', async () => {
        // The exact plane answer `WakeSubscriptionService.fleetIdentities` serves (identities plus
        // redacted observations), consumed through the REAL plane reader into the REAL source —
        // the reachability Memory Core → plane reader → fleetWakeRoutesSource, pinned hermetically.
        const planeClient = {
            async callTool(name, args) {
                expect(name).toBe('manage_wake_subscription');
                expect(args).toEqual({action: 'fleet-identities'});

                return {
                    identities  : ['@neo-fable-clio', '@neo-opus-ada'],
                    observations: [
                        {identity: '@neo-fable-clio', lastPollAt: '2026-08-03T19:59:30.000Z'},
                        {identity: '@neo-opus-ada',   lastPollAt: null}
                    ]
                }
            }
        };

        const snapshot = await harness({
            listActiveSubscriptionObservations: createPlaneWakeObservationsReader(planeClient)
        }).readWakeRoutes();

        const
            clio = snapshot.seats.find(seat => seat.agentIdentity === '@neo-fable-clio'),
            ada  = snapshot.seats.find(seat => seat.agentIdentity === '@neo-opus-ada');

        expect(clio.subscription).toEqual({state: 'active', reason: null, lastPollAt: '2026-08-03T19:59:30.000Z'});
        expect(ada.subscription).toEqual({state: 'active', reason: null, lastPollAt: null})
    });

    test('a plane predating the recency disclosure (identities only) degrades to null recency — never a broken axis', async () => {
        const snapshot = await harness({
            listActiveSubscriptionObservations: createPlaneWakeObservationsReader({
                async callTool() {
                    return {identities: ['@neo-fable-clio']}
                }
            })
        }).readWakeRoutes();

        const clio = snapshot.seats.find(seat => seat.agentIdentity === '@neo-fable-clio');

        expect(clio.subscription).toEqual({state: 'active', reason: null, lastPollAt: null})
    });

    test('typed-unknown delivery axes (the plane mode reality) degrade honestly and name themselves', async () => {
        const snapshot = await harness({
            resolveDeliveryLiveness: () => ({
                alive : 'unknown',
                reason: 'delivery-lane liveness is not exposed by the containerized plane yet'
            }),
            resolveTerminalDeliveryFailures: () => ({
                state     : 'unknown',
                reason    : 'terminal delivery receipts live with the containerized delivery authority; not exposed yet',
                byIdentity: new Map()
            })
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.reason).toContain('delivery axis');
        expect(snapshot.capability.reason).toContain('failure axis');

        const seat = snapshot.seats[0];

        expect(seat.delivery.state).toBe('unknown');
        expect(seat.delivery.reason).toContain('not exposed by the containerized plane');
        expect(seat.lastFailure.state).toBe('unknown');
        // The observable axes stay untouched by the silent ones.
        expect(seat.subscription.state).not.toBe('unknown');
        expect(seat.presence.state).toBe('idle')
    });

    test('an out-of-contract delivery answer cannot fabricate a state', async () => {
        const snapshot = await harness({
            resolveDeliveryLiveness: () => ({alive: 'yes-definitely'})
        }).readWakeRoutes();

        expect(snapshot.seats[0].delivery).toEqual({
            state : 'unknown',
            reason: 'delivery liveness resolver returned an out-of-contract value'
        })
    });

    test('a down delivery lane is an OBSERVED fact, distinct from unreadable', async () => {
        const snapshot = await harness({
            resolveDeliveryLiveness: () => ({alive: false, reason: 'stale PID file: recorded process is gone'})
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.reason).not.toContain('delivery axis');
        expect(snapshot.seats[0].delivery).toEqual({
            state : 'down',
            reason: 'stale PID file: recorded process is gone'
        })
    });

    test('a persisted leading-@ registry spelling joins EVERY axis — one canonical identity boundary for both presence consumers', async () => {
        // defineAgent persists githubUsername unchanged, so '@neo-opus-ada' is an accepted
        // production spelling; the shared canonicalizer must join it instead of emitting '@@…'
        // and fabricating seat-absent across subscription/arming/failure/presence axes.
        const result = await harness({
            listAgents  : () => [{id: 'prefixed-seat', githubUsername: '@neo-opus-ada'}],
            readPresence: () => ({agents: [PRESENCE_PAYLOAD.agents[0]]})
        }).readWakeRoutes();

        const seat = result.seats[0];

        expect(seat.agentIdentity).toBe('@neo-opus-ada');
        expect(seat.presence.state).toBe('idle');
        expect(seat.presence.reason).not.toBe('seat absent from the presence report')
    });

    test('an absent presence reader is a typed unobserved; a malformed answer is unknown; a missing seat answers only for itself', async () => {
        const unbound = await harness({readPresence: null}).readWakeRoutes();

        expect(unbound.seats[0].presence.state).toBe('unobserved');
        expect(unbound.capability.reason).toContain('presence axis');

        const malformed = await harness({readPresence: () => ({nope: true})}).readWakeRoutes();

        expect(malformed.seats[0].presence).toEqual({
            state: 'unknown', lastSeenAt: null, reason: 'presence answer unreadable'
        });

        const partial = await harness({
            readPresence: () => ({agents: [PRESENCE_PAYLOAD.agents[1]]})
        }).readWakeRoutes();

        const ada  = partial.seats.find(seat => seat.agentIdentity === '@neo-opus-ada'),
              clio = partial.seats.find(seat => seat.agentIdentity === '@neo-fable-clio');

        expect(partial.capability.state).toBe('degraded');
        expect(clio.presence.state).toBe('online');
        expect(ada.presence).toEqual({
            state: 'unknown', lastSeenAt: null, reason: 'seat absent from the presence report'
        })
    });

    test('an unreadable roster is a source-level degrade with zero seats — never an empty fleet claim', async () => {
        const snapshot = await harness({
            listAgents: () => { throw new Error('registry unavailable') }
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.confidence).toBe('none');
        expect(snapshot.capability.reason).toContain('registry unavailable');
        expect(snapshot.seats).toEqual([]);
        expect(snapshot.count).toBe(0)
    });

    test('every axis silent still answers rows: all-unknown seats under degraded/none-adjacent truth', async () => {
        const snapshot = await harness({
            listActiveSubscriptionObservations: null,
            resolveDeliveryLiveness           : null,
            resolveTerminalDeliveryFailures   : null,
            readPresence                      : null
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.confidence).toBe('none');
        expect(snapshot.count).toBe(2);

        const seat = snapshot.seats[0];

        expect(seat.subscription.state).toBe('unknown');
        expect(seat.delivery.state).toBe('unknown');
        expect(seat.lastFailure.state).toBe('unknown');
        expect(seat.presence.state).toBe('unobserved')
    });

    test('a throwing viewer resolver yields a null viewer without taking the read down', async () => {
        const snapshot = await harness({
            resolveViewerIdentity: () => { throw new Error('no request context') }
        }).readWakeRoutes();

        expect(snapshot.viewer).toBeNull();
        expect(snapshot.capability.state).toBe('degraded')
    });

    test('a NON-ARRAY roster answer is unreadable, never an empty fleet — the control against observed-empty', async () => {
        const unreadable = await harness({
            listAgents: () => ({rows: 'not an array'})
        }).readWakeRoutes();

        expect(unreadable.capability.state).toBe('degraded');
        expect(unreadable.capability.confidence).toBe('none');
        expect(unreadable.capability.reason).toContain('unreadable');
        expect(unreadable.seats).toEqual([]);

        // The control: a genuinely empty roster READS as observed-empty partial truth (the arming
        // axis alone degrades it), with zero seats and NO roster complaint in the reason.
        const observedEmpty = await harness({listAgents: () => []}).readWakeRoutes();

        expect(observedEmpty.capability.confidence).toBe('partial');
        expect(observedEmpty.capability.reason).not.toContain('roster');
        expect(observedEmpty.count).toBe(0)
    });

    test('the file-backed receipt reader feeds the source: a host receipt reaches exactly its seat', async () => {
        const {createTerminalDeliveryFailuresFileReader} = await import('../../../../../../ai/services/fleet/fleetWakeStateAdapter.mjs');

        const receiptFile = JSON.stringify({
            'sub-clio': {
                subscriptionId: 'sub-clio',
                agentIdentity : '@neo-fable-clio',
                errorClass    : 'receiver-unreachable',
                failedAt      : '2026-08-03T19:00:00.000Z'
            }
        });

        const snapshot = await harness({
            resolveTerminalDeliveryFailures: createTerminalDeliveryFailuresFileReader({
                deliveryFailureFilePath: '/virtual/wake-delivery-failures.json',
                readDeliveryFailureFile: () => receiptFile
            })
        }).readWakeRoutes();

        const clio = snapshot.seats.find(seat => seat.agentIdentity === '@neo-fable-clio'),
              ada  = snapshot.seats.find(seat => seat.agentIdentity === '@neo-opus-ada');

        expect(clio.lastFailure.receipt).toEqual({errorClass: 'receiver-unreachable', failedAt: '2026-08-03T19:00:00.000Z'});
        expect(ada.lastFailure).toEqual({state: 'observed', reason: null, receipt: null})
    })
});
