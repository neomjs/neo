import {expect, test}                from '@playwright/test';
import {createFleetWakeRoutesSource} from '../../../../../../ai/services/fleet/fleetWakeRoutesSource.mjs';

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
        listAgents                      : () => ROSTER,
        resolveViewerIdentity           : () => '@e2e-operator',
        listActiveSubscriptionIdentities: () => ['@neo-fable-clio'],
        resolveDeliveryLiveness         : () => ({alive: true, reason: null}),
        resolveTerminalDeliveryFailures : () => ({state: 'observed', reason: null, byIdentity: new Map()}),
        readPresence                    : () => PRESENCE_PAYLOAD,
        now                             : () => new Date('2026-08-03T20:01:00.000Z'),
        ...overrides
    })
}

test.describe('fleetWakeRoutesSource — the decomposed per-seat wake-route read', () => {
    test('construction refuses missing required collaborators', () => {
        expect(() => createFleetWakeRoutesSource()).toThrow(TypeError);
        expect(() => createFleetWakeRoutesSource({listAgents: () => []})).toThrow(TypeError);
        expect(() => createFleetWakeRoutesSource({resolveViewerIdentity: () => '@a'})).toThrow(TypeError)
    });

    test('a fully-answered read is wired/observed with every axis speaking for itself', async () => {
        const snapshot = await harness().readWakeRoutes();

        expect(snapshot.capability).toEqual({
            source    : 'fleet:wakeRoutes', state: 'wired', confidence: 'observed',
            capturedAt: '2026-08-03T20:01:00.000Z', reason: null
        });
        expect(snapshot.viewer).toBe('@e2e-operator');
        expect(snapshot.count).toBe(2);

        const [ada, clio] = snapshot.seats;

        expect(ada.agentIdentity).toBe('@neo-opus-ada');
        expect(ada.subscription).toEqual({state: 'none', reason: null});
        expect(clio.subscription).toEqual({state: 'active', reason: null});
        expect(clio.delivery).toEqual({state: 'alive', reason: null});
        expect(clio.lastFailure).toEqual({state: 'observed', reason: null, receipt: null});
        expect(clio.presence).toEqual({
            state: 'online', lastSeenAt: '2026-08-03T19:55:00.000Z', reason: 'recent add_memory activity'
        });
        // The one axis nobody can observe yet is a TYPED unobserved, present on every row.
        expect(ada.armed.state).toBe('unobserved');
        expect(typeof ada.armed.reason).toBe('string')
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
            listActiveSubscriptionIdentities: () => { throw new Error('plane wake fleet-identities answer unreadable') }
        }).readWakeRoutes();

        expect(snapshot.capability.state).toBe('degraded');
        expect(snapshot.capability.confidence).toBe('partial');
        expect(snapshot.capability.reason).toContain('subscription axis');

        for (const seat of snapshot.seats) {
            expect(seat.subscription.state).toBe('unknown');
            expect(seat.subscription.reason).toContain('unreadable')
        }
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

        expect(snapshot.capability.state).toBe('wired');
        expect(snapshot.seats[0].delivery).toEqual({
            state : 'down',
            reason: 'stale PID file: recorded process is gone'
        })
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

        expect(partial.capability.state).toBe('wired');
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
            listActiveSubscriptionIdentities: null,
            resolveDeliveryLiveness         : null,
            resolveTerminalDeliveryFailures : null,
            readPresence                    : null
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
        expect(snapshot.capability.state).toBe('wired')
    })
});
