import {test, expect} from '@playwright/test';

import {IDENTITIES}   from '../../../../../../ai/graph/identityRoots.mjs';

import {
    identityParticipationById,
    isWakeTargetEligible,
    wakeSeatIdentities
} from '../../../../../../ai/daemons/wake/wakeTargetEligibility.mjs';

/**
 * Two questions that look like one and are not: may an identity RECEIVE a wake, and should it HOLD
 * a route.
 *
 * The first is deliberately permissive — an unknown identity stays eligible so forks and local
 * custom agents keep working. The second is a census of seats that ought to exist. The first
 * version of this module used the permission predicate as the census, which warned about `@tobiu`:
 * a human owner who is permitted to receive a wake and is not a seat. @neo-gpt found it by running
 * the collector against the real roster instead of a fixture — the fixtures all passed, because
 * every fixture I wrote contained only agents.
 *
 * So the arms below run against the LIVE roster, not a hand-built map. A fixture cannot reproduce
 * the defect that motivated them.
 */

const identityOfType = accountType => IDENTITIES.find(identity =>
    identity.type === 'AgentIdentity' && identity.properties?.accountType === accountType);

test.describe('wakeSeatIdentities — the route census', () => {
    test('excludes the human owner, who is wake-permitted but is not a seat', () => {
        // The exact regression. `@tobiu` is `accountType: 'human'` and active, so the permission
        // predicate admits him; a census that reuses it reports the owner as an unrouted seat.
        expect(isWakeTargetEligible('@tobiu'), 'the owner may receive a wake — permission is permissive')
            .toBe(true);

        expect(wakeSeatIdentities, 'and is still not an expected route holder').not.toContain('@tobiu')
    });

    test('excludes system senders — and they are caught by `type`, not by `accountType`', () => {
        const system = IDENTITIES.find(identity => identity.properties?.accountType === 'system');

        expect(system, 'the roster must still carry a system account, or this control proves nothing').toBeTruthy();
        expect(wakeSeatIdentities).not.toContain(system.id);

        // Worth pinning which filter does the work: `@system` is `type: 'System'`, so the
        // AgentIdentity filter already excludes it and the accountType check never sees it. That
        // makes `@tobiu` — an AgentIdentity whose accountType is `human` — the ONLY case where the
        // accountType filter is load-bearing, and therefore the only real regression control here.
        expect(system.type, 'system senders are excluded by type before accountType is consulted')
            .not.toBe('AgentIdentity')
    });

    test('includes active agent seats, and the census is non-empty', () => {
        const agent = identityOfType('agent');

        expect(agent, 'the roster must carry at least one agent seat').toBeTruthy();
        expect(wakeSeatIdentities.length, 'an empty census would make every downstream arm vacuous')
            .toBeGreaterThan(3);

        for (const seat of wakeSeatIdentities) {
            const entry = IDENTITIES.find(identity => identity.id === seat);

            expect(entry?.properties?.accountType, `${seat} is in the census`).toBe('agent');
            expect(entry?.properties?.participationStatus ?? 'active', `${seat} is active`).toBe('active')
        }
    });

    test('excludes a non-active agent: retired seats should not be expected to hold routes', () => {
        const retiredAgents = IDENTITIES.filter(identity =>
            identity.type === 'AgentIdentity' &&
            identity.properties?.accountType === 'agent' &&
            (identity.properties?.participationStatus || 'active') !== 'active');

        // Not asserting the roster HAS one — that would couple this spec to fleet composition. When
        // one exists it must be absent from the census; when none exists the arm is a no-op and says so.
        for (const retired of retiredAgents) {
            expect(wakeSeatIdentities, `${retired.id} is a non-active agent`).not.toContain(retired.id)
        }
    });

    test('every census entry is canonical, so a consumer can compare without normalising', () => {
        // Load-bearing: the manifest builder compares as-given precisely so it can stay free of
        // graph imports. A bare handle here would make every routed seat read as unrouted.
        for (const seat of wakeSeatIdentities) {
            expect(seat.startsWith('@'), `${seat} must be canonical`).toBe(true)
        }
    })
});

test.describe('isWakeTargetEligible — receive permission, unchanged from the daemon', () => {
    test('unknown identities stay eligible, non-active known ones do not', () => {
        const participation = new Map([
            ['@active',  'active'],
            ['@benched', 'operator_benched'],
            ['@retired', 'retired']
        ]);

        expect(isWakeTargetEligible('@active',  participation)).toBe(true);
        expect(isWakeTargetEligible('@benched', participation)).toBe(false);
        expect(isWakeTargetEligible('@retired', participation)).toBe(false);
        expect(isWakeTargetEligible('@a-fork',  participation), 'unknown stays eligible for forks').toBe(true);
        expect(isWakeTargetEligible(null,       participation), 'a null target is not filtered here').toBe(true)
    });

    test('the live participation map is populated, so the default is not vacuously permissive', () => {
        // Without this, an empty map would make every identity read as "unknown, therefore eligible"
        // and both suites above would pass against a module that failed to build its roster.
        expect(identityParticipationById.size).toBeGreaterThan(5);
        expect(identityParticipationById.has('@tobiu'), 'permission covers humans too').toBe(true)
    })
});
