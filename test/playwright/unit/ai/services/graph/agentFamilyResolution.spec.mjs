import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';

import {
    getCoreSwarmAgentFamilies,
    groupReviewsByFamily,
    resolveResidentFamily,
    resolveReviewerFamily
} from '../../../../../../ai/services/graph/agentFamilyResolution.mjs';
import {IDENTITIES}                                       from '../../../../../../ai/graph/identityRoots.mjs';
import {migrateResident}                                  from '../../../../../../ai/graph/identityRootsMigration.mjs';

/**
 * Consumer-migration coverage for the identityRoots flat-fact retirement: the family read-path
 * consumes the hydration index (era chain → `currentEra.family`) with the flat property as the
 * DOCUMENTED post-epoch fallback. The regression AC is behavioral identity: the login-to-family
 * map must be exactly what the flat read produced before the move.
 */
test.describe('ai/services/graph/agentFamilyResolution — hydration-index family reads', () => {
    test('REGRESSION AC: the login-to-family map is IDENTICAL to the flat-property derivation', () => {
        const flatDerived = Object.fromEntries(
            IDENTITIES
                .filter(identity =>
                    identity.type === 'AgentIdentity' &&
                    identity.properties?.accountType === 'agent' &&
                    identity.properties?.githubLogin &&
                    identity.properties?.modelFamily
                )
                .map(identity => [identity.properties.githubLogin.replace(/^@/, ''), identity.properties.modelFamily])
        );

        expect(getCoreSwarmAgentFamilies()).toEqual(flatDerived);
    });

    test('the index path is LOAD-BEARING: a designated resident resolves without its flat property', () => {
        // Strip the flat field from a real pre-epoch resident: the era chain alone must resolve.
        const real     = IDENTITIES.find(identity => identity.id === '@neo-opus-vega'),
              stripped = {...real, properties: {...real.properties}};

        delete stripped.properties.modelFamily;

        expect(real.properties.modelFamily).toBe('claude');
        expect(resolveResidentFamily(stripped)).toBe('claude');
    });

    test('the fallback boundary: a migration-refused resident reads the flat property (the retirement witness)', () => {
        // Post-epoch residents are refused by migrateResident BY DESIGN (first era is
        // observation-owned; it exists only after the gated graph-seeding slice). Until then the
        // flat property is the only truth source — this population reaching zero IS the
        // flat-field retirement gate.
        const postEpoch = IDENTITIES.filter(identity =>
            identity.properties?.accountType === 'agent' &&
            !migrateResident(identity).valid
        );

        for (const identity of postEpoch) {
            expect(resolveResidentFamily(identity)).toBe(identity.properties.modelFamily);
        }

        // Pin today's exact fallback population so silent growth (or the retirement moment)
        // surfaces as a conscious spec update, never an invisible behavior change.
        expect(postEpoch.map(identity => identity.id)).toEqual([
            '@neo-gpt-emmy', '@neo-kimi-phoebe', '@neo-kimi-iris',
            // Provisioned 2026-08-22 ahead of first boot. Its `modelFamily` is 'unknown' rather than
            // a vendor, so this arm additionally witnesses that the flat-field fallback carries an
            // unresolved family unchanged — it must never resolve to a guessed lab.
            '@neo-preview'
        ]);
    });

    test('every current index-path resolution agrees with the flat property it will replace', () => {
        for (const identity of IDENTITIES.filter(i => i.properties?.accountType === 'agent')) {
            const migrated = migrateResident(identity);

            if (migrated.valid) {
                expect(resolveResidentFamily(identity)).toBe(identity.properties.modelFamily);
            }
        }
    });

    test('an unresolvable entry yields undefined and is excluded from the family map', () => {
        expect(resolveResidentFamily({properties: {accountType: 'agent'}})).toBeUndefined();
        expect(resolveResidentFamily(null)).toBeUndefined();
        expect(Object.values(getCoreSwarmAgentFamilies())).not.toContain(undefined);
    });
});

/**
 * Reviewer-side family resolution: the seam a per-family review budget spends against.
 *
 * The budget's unit is the FAMILY, so the question "which family does this review spend?" has to be
 * answerable, and — more importantly — has to be answerable as UNANSWERED. A resolver that returns
 * `undefined` for both "not a Neo agent" and "no login at all" hands the caller one value for two
 * situations that demand opposite handling, and the caller then picks whichever branch reads more
 * naturally. That is how an unrostered reviewer ends up spending nobody's budget and reviewing
 * without limit.
 */
test.describe('ai/services/graph/agentFamilyResolution — reviewer-side budget classification', () => {
    const families = {'neo-opus-grace': 'claude', 'neo-gpt-emmy': 'gpt', 'neo-kimi-phoebe': 'kimi'};
    const review   = login => ({author: {login}});

    test('a rostered reviewer resolves to the family whose budget the review spends', () => {
        expect(resolveReviewerFamily(review('neo-gpt-emmy'), families))
            .toEqual({classified: true, family: 'gpt', login: 'neo-gpt-emmy'});

        // The `@`-prefixed spelling is the A2A/identity form and reaches this seam through more than
        // one caller, so it resolves rather than reading as a stranger.
        expect(resolveReviewerFamily(review('@neo-gpt-emmy'), families).family).toBe('gpt');
    });

    test('an unrostered login is UNCLASSIFIED, and says so distinguishably from having no login', () => {
        // Both refuse, and both must remain legible: a human contributor is a real reviewer whose
        // family is unknown; a payload with no author is a broken record. The caller fails closed on
        // each, but an operator debugging them needs to know which one happened.
        const stranger = resolveReviewerFamily(review('some-human-contributor'), families);
        const headless = resolveReviewerFamily({}, families);

        expect(stranger).toEqual({classified: false, family: null, login: 'some-human-contributor'});
        expect(headless).toEqual({classified: false, family: null, login: null});
        expect(stranger.login, 'the refusal still names who it refused').not.toBe(headless.login);
    });

    test('a renamed handle does not silently inherit its old family', () => {
        // The failure this guards: a login that USED to be rostered keeps spending a family budget
        // after the roster moved on, because the resolver matched a name rather than the registry.
        // Absence from the map is the whole verdict — there is no fuzzy or prefix fallback.
        expect(resolveReviewerFamily(review('neo-opus-4-7'), families).classified).toBe(false);
        expect(resolveReviewerFamily(review('neo-gpt-emmy-old'), families).classified).toBe(false);
    });

    test('the counting unit is the FAMILY, so two identities of one family are one spender', () => {
        // Otherwise a family buys extra rounds by rotating seats, which is the exact loophole a
        // per-family budget exists to close.
        const {byFamily, unclassified} = groupReviewsByFamily([
            review('neo-gpt-emmy'), review('neo-gpt-emmy'), review('neo-kimi-phoebe')
        ], {...families, 'neo-gpt': 'gpt'});

        expect(byFamily).toEqual({gpt: 2, kimi: 1});
        expect(unclassified).toEqual([]);
    });

    test('unclassified reviews are reported separately, never dropped and never pooled', () => {
        // Dropping them lets an unrostered login review without limit; pooling them under one
        // placeholder makes two unrelated strangers share a budget. Neither is a decision this
        // function may take silently, so it hands both facts to the admission point.
        const {byFamily, unclassified} = groupReviewsByFamily([
            review('neo-opus-grace'), review('stranger-one'), review('stranger-two')
        ], families);

        expect(byFamily).toEqual({claude: 1});
        expect(unclassified).toEqual([{login: 'stranger-one'}, {login: 'stranger-two'}]);
    });

    test('the live roster resolves every named maintainer — the map is not empty by construction', () => {
        // The non-vacuity control. Every assertion above uses a hand-built map, so all of them would
        // still pass against a registry that resolved nobody. This one drives the real one.
        const live = getCoreSwarmAgentFamilies();

        expect(resolveReviewerFamily(review('neo-opus-grace'), live).family).toBe('claude');
        expect(resolveReviewerFamily(review('neo-fable-clio'), live).family, 'fable is claude').toBe('claude');
        expect(resolveReviewerFamily(review('neo-gpt-emmy'),   live).family).toBe('gpt');
        expect(resolveReviewerFamily(review('neo-kimi-phoebe'),live).family).toBe('kimi');
    });
});
