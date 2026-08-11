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

    test('C — a LEGACY-default plane CANNOT be widened to team', () => {
        // The escalation that survived inside the first fix. `legacy` and `team` are NOT equal
        // breadth: `legacy` post-filters to caller-owned + shared + untagged rows, while `team` runs
        // no post-filter and returns every maintainer's records. `team` is a strict superset, so a
        // legacy-configured deployment honouring a requested `team` reads past its own isolation.
        expect(resolveSharingPolicy({configuredDefault: 'legacy', requested: 'team'}))
            .toEqual({clamped: true, policy: 'legacy'});
    });

    test('C-control — the reverse is a NARROWING and stays honoured', () => {
        // Non-vacuity for the arm above: the fix must deny the escalation without clamping the
        // lateral-looking move in the safe direction, which would break legitimate narrowing.
        expect(resolveSharingPolicy({configuredDefault: 'team', requested: 'legacy'}))
            .toEqual({clamped: false, policy: 'legacy'});
    });

    test('the ordering is strict and total across all three policies', () => {
        // Pins private < legacy < team as a whole, so a future edit cannot restore the equal-rank
        // model by touching one transition and leaving the others green.
        expect(resolveSharingPolicy({configuredDefault: 'private', requested: 'legacy'}))
            .toEqual({clamped: true, policy: 'private'});

        expect(resolveSharingPolicy({configuredDefault: 'private', requested: 'team'}))
            .toEqual({clamped: true, policy: 'private'});

        expect(resolveSharingPolicy({configuredDefault: 'legacy', requested: 'private'}))
            .toEqual({clamped: false, policy: 'private'});

        expect(resolveSharingPolicy({configuredDefault: 'team', requested: 'private'}))
            .toEqual({clamped: false, policy: 'private'});
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
