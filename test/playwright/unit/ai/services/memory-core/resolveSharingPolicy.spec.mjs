import {expect, test}         from '@playwright/test';
import {resolveSharingPolicy} from '../../../../../../ai/services/memory-core/helpers/resolveSharingPolicy.mjs';

/**
 * The A/B controls a reviewer required before this could ship: an ordinary caller must not be able to
 * select a broader read scope than the deployment configured.
 *
 * Driven as a pure function on purpose. Reaching the `private`-default branch through a service would
 * mean mutating `aiConfig.memorySharing.defaultPolicy`, which the config-mutation guard blocks and
 * which would leak across specs sharing the singleton. Passing the default in as a parameter makes
 * BOTH deployment shapes reachable without touching it — which is also why the helper takes it as an
 * argument rather than reading it.
 */
test.describe('resolveSharingPolicy (#16611)', () => {
    test('A — on a PRIVATE-default plane a caller CANNOT widen to team', () => {
        // The isolation-defeating case. Without the clamp, `team` drops the userId predicate and the
        // query returns every maintainer's records on a deployment that asked for per-org isolation.
        expect(resolveSharingPolicy({configuredDefault: 'private', requested: 'team'}))
            .toEqual({clamped: true, policy: 'private'});

        expect(resolveSharingPolicy({configuredDefault: 'private', requested: 'legacy'}))
            .toEqual({clamped: true, policy: 'private'});
    });

    test('B — on a TEAM-default plane the same request is honoured', () => {
        // The control that proves the clamp is scope-relative, not a blanket refusal of `team`.
        expect(resolveSharingPolicy({configuredDefault: 'team', requested: 'team'}))
            .toEqual({clamped: false, policy: 'team'});
    });

    test('NARROWING is always honoured, on either default', () => {
        // The legitimate use, including the documented test seam. A clamp that also blocked narrowing
        // would break `querySummaries({memorySharing: "private"})`, which is the safe direction.
        expect(resolveSharingPolicy({configuredDefault: 'team', requested: 'private'}))
            .toEqual({clamped: false, policy: 'private'});

        expect(resolveSharingPolicy({configuredDefault: 'legacy', requested: 'private'}))
            .toEqual({clamped: false, policy: 'private'});
    });

    test('team and legacy are equal breadth, so neither escalates past the other', () => {
        // Both drop the userId predicate; they differ only in which commons rows they additively
        // include. Ranking one above the other would clamp a lateral move for no security gain.
        expect(resolveSharingPolicy({configuredDefault: 'team', requested: 'legacy'}))
            .toEqual({clamped: false, policy: 'legacy'});

        expect(resolveSharingPolicy({configuredDefault: 'legacy', requested: 'team'}))
            .toEqual({clamped: false, policy: 'team'});
    });

    test('an absent request resolves to the configured default, unclamped', () => {
        for (const configuredDefault of ['private', 'team', 'legacy']) {
            expect(resolveSharingPolicy({configuredDefault}), configuredDefault)
                .toEqual({clamped: false, policy: configuredDefault});
        }
    });

    test('an UNKNOWN policy name is not a licence to widen', () => {
        // Fails closed to the default rather than treating an unrecognised string as honourable —
        // otherwise a typo, or a probe, reads as a request the clamp never evaluated.
        expect(resolveSharingPolicy({configuredDefault: 'private', requested: 'everything'}))
            .toEqual({clamped: true, policy: 'private'});
    });
});
