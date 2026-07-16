import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';

import {getCoreSwarmAgentFamilies, resolveResidentFamily} from '../../../../../../ai/services/graph/agentFamilyResolution.mjs';
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
        expect(postEpoch.map(identity => identity.id)).toEqual(['@neo-gpt-emmy']);
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
