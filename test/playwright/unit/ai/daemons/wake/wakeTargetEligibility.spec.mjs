import {test, expect} from '@playwright/test';

import {
    collectUnroutedEligibleIdentities,
    identityParticipationById,
    isWakeTargetEligible
} from '../../../../../../ai/daemons/wake/wakeTargetEligibility.mjs';

/**
 * The roster-versus-manifest difference that makes an unrouted seat visible.
 *
 * The defect it answers had no error state of its own: a manifest missing a seat is simply smaller
 * than the roster, and nothing read a smaller set as information. A live seat therefore spent its
 * whole existence receiving another seat's wakes and none of its own, with no warning anywhere.
 *
 * The arms below are shaped around the two ways this guard dies. It fails OPEN if the difference is
 * wrong — the seat stays invisible, which is the original defect. It fails NOISY if eligibility is
 * wrong — every benched, dark and never-connected roster entry warns on every build, and within a
 * week nobody reads the output. The negative control is therefore load-bearing, not decoration.
 */

const roster = () => new Map([
    ['@active-routed',   'active'],
    ['@active-unrouted', 'active'],
    ['@benched',         'operator_benched'],
    ['@dark',            'retired'],
    ['@implicit',        'active']
]);

test.describe('collectUnroutedEligibleIdentities', () => {
    test('names an eligible identity that no route serves', () => {
        expect(collectUnroutedEligibleIdentities({
            routedIdentities: ['@active-routed', '@benched', '@dark', '@implicit'],
            participation   : roster()
        })).toEqual(['@active-unrouted'])
    });

    test('NEGATIVE CONTROL: a non-active identity with no route is silent', () => {
        // The guard's whole value is that its output stays readable. Most roster entries
        // legitimately have no route at any moment, so warning about them would make this noise on
        // every build. `@benched` and `@dark` are unrouted here and must NOT appear.
        const unrouted = collectUnroutedEligibleIdentities({
            routedIdentities: ['@active-routed', '@active-unrouted', '@implicit'],
            participation   : roster()
        });

        expect(unrouted).toEqual([]);
        expect(unrouted).not.toContain('@benched');
        expect(unrouted).not.toContain('@dark')
    });

    test('NON-VACUITY, both directions: a matching set is empty, a diverging set names exactly its members', () => {
        const everything = ['@active-routed', '@active-unrouted', '@benched', '@dark', '@implicit'];

        expect(collectUnroutedEligibleIdentities({routedIdentities: everything, participation: roster()}),
            'every eligible identity routed ⇒ nothing to say'
        ).toEqual([]);

        // Two missing rather than one: a difference that returned only its first member would pass
        // a single-member arm and under-report every real multi-seat gap.
        expect(collectUnroutedEligibleIdentities({routedIdentities: ['@benched'], participation: roster()}),
            'two eligible identities unrouted ⇒ both named, sorted'
        ).toEqual(['@active-routed', '@active-unrouted', '@implicit'])
    });

    test('routed identities match regardless of `@` spelling', () => {
        // The manifest and the roster have disagreed on this before — a bare-vs-prefixed mismatch
        // would report every routed seat as unrouted, i.e. the guard screaming about a healthy
        // plane, which is the fastest way to get it ignored.
        expect(collectUnroutedEligibleIdentities({
            routedIdentities: ['active-routed', 'active-unrouted', 'implicit'],
            participation   : roster()
        })).toEqual([])
    });

    test('an empty roster yields nothing; the no-arg call reads the LIVE roster against no routes', () => {
        expect(collectUnroutedEligibleIdentities({routedIdentities: [], participation: new Map()}),
            'an empty roster has nothing to be unrouted'
        ).toEqual([]);

        // Corrected after this arm first asserted `[]` here. The no-arg call is not "empty input" —
        // `participation` defaults to the live roster, so with nothing routed EVERY eligible
        // identity is unrouted. Asserting non-empty is both the true semantics and a live check
        // that the default map resolves at all.
        expect(collectUnroutedEligibleIdentities().length,
            'no routes against the live roster ⇒ every eligible identity is unrouted'
        ).toBeGreaterThan(0)
    })
});

test.describe('isWakeTargetEligible — the shared predicate the daemon and the manifest both read', () => {
    test('unknown identities stay eligible, non-active known ones do not', () => {
        const participation = roster();

        expect(isWakeTargetEligible('@active-routed', participation), 'active is eligible').toBe(true);
        expect(isWakeTargetEligible('@benched',       participation), 'benched is not').toBe(false);
        expect(isWakeTargetEligible('@dark',          participation), 'retired is not').toBe(false);
        expect(isWakeTargetEligible('@a-fork',        participation), 'unknown stays eligible for forks').toBe(true);
        expect(isWakeTargetEligible(null,             participation), 'a null target is not filtered here').toBe(true)
    });

    test('the live roster is populated, so the default participation map is not vacuously permissive', () => {
        // Without this the two suites above could pass against a real map that failed to build,
        // and every identity would silently read as "unknown, therefore eligible".
        expect(identityParticipationById.size).toBeGreaterThan(5)
    })
});
