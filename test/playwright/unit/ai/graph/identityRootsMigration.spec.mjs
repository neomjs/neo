import {setup} from '../../../setup.mjs';

const appName = 'IdentityRootsMigrationTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('identityRootsMigration — the flat registry expressed through the identity schema, on production data', () => {
    let migration, schema, roots;

    test.beforeAll(async () => {
        migration = await import('../../../../../ai/graph/identityRootsMigration.mjs');
        schema    = await import('../../../../../ai/graph/identitySchema.mjs');
        roots     = await import('../../../../../ai/graph/identityRoots.mjs');
    });

    test('every live agent resident migrates: valid chains, zero failures, non-agents skipped by design', () => {
        const {valid, residents, report} = migration.migrateAllResidents();

        expect(report.failures).toEqual([]);
        expect(valid).toBe(true);

        // the roster is complete: every agent seed migrated, every non-agent skipped
        const agentSeeds = roots.IDENTITIES.filter(seed => seed?.properties?.accountType === 'agent');
        expect(residents).toHaveLength(agentSeeds.length);
        expect(report.skipped.map(entry => entry.accountType)).not.toContain('agent');

        // every chain re-validates through the schema, independently of the migration's own check
        for (const resident of residents) {
            expect(schema.validateEraChain(resident.identity, resident.episodes)).toEqual({valid: true, reason: null});
        }
    });

    test('the seed era carries the recorded facts VERBATIM — era-owned facts leave the identity view, sunsetTriggers move to the era layer', () => {
        const {residents} = migration.migrateAllResidents();

        for (const {identity, episodes} of residents) {
            const seed = roots.IDENTITIES.find(entry => entry.id === identity.identityKey);
            const era  = episodes[0];

            // family lifted verbatim; the identity view carries NO era-owned fact
            expect(era.family).toBe(seed.properties.modelFamily || seed.properties.family);
            for (const key of schema.ERA_OWNED_FACTS) {
                expect(identity.socialLayer[key]).toBeUndefined();
            }

            // sunsetTriggers live on the ERA now — succession semantics belong to the embodiment
            if (seed.properties.sunsetTriggers !== undefined) {
                expect(era.capabilities.sunsetTriggers).toEqual(seed.properties.sunsetTriggers);
            }

            // recorded capability facts lifted verbatim where present
            if (seed.properties.contextWindowInput !== undefined) {
                expect(era.capabilities.contextWindowInput).toBe(seed.properties.contextWindowInput);
            }

            // the era opens at the documented migration epoch with backfill provenance — never invented history
            expect(era.since).toBe(migration.MIGRATION_EPOCH);
            expect(era.capabilities.provenance).toContain('flat-registry-backfill');
        }
    });

    test('THE PROPERTY holds on production data, and hydration serves current facts for every resident', () => {
        const {residents} = migration.migrateAllResidents();

        for (const {identity, episodes, index} of residents) {
            expect(index.identityKey).toBe(identity.identityKey);
            expect(index.regenerable).toBe(true);
            expect(index.currentEra.model).toBe(migration.REGISTRY_MODEL_DESIGNATIONS[identity.identityKey]);
        }
    });

    test('migrated model values are MODEL DESIGNATIONS — never handles or social strings (field-provenance guard)', () => {
        const {residents} = migration.migrateAllResidents();

        for (const {identity, episodes} of residents) {
            const seed  = roots.IDENTITIES.find(entry => entry.id === identity.identityKey);
            const model = episodes[0].model;

            // designation shape: never an @handle, never the seed's identity/display string, and
            // every designation in this registry carries a version digit — social strings never do
            expect(model.startsWith('@')).toBe(false);
            expect(model).not.toBe(seed.name);
            expect(model).not.toBe(seed.properties.displayName);
            expect(model).toMatch(/\d/);
        }
    });

    test('the anti-fabrication residue is structural: documented swap events are candidates, never auto-built eras', () => {
        const {residents, report} = migration.migrateAllResidents();

        // both documented swap events are exported as candidates with sources and named gaps
        expect(report.backfillCandidates).toContain('@neo-fable');
        expect(report.backfillCandidates).toContain('@neo-opus-vega');
        for (const candidate of migration.ERA_BACKFILL_CANDIDATES) {
            expect(candidate.eventSource.length).toBeGreaterThan(0);
            expect(candidate.missing.length).toBeGreaterThan(0);
        }

        // and the migration did NOT build those prior eras: single seed era each
        for (const key of report.backfillCandidates) {
            const resident = residents.find(entry => entry.identity.identityKey === key);
            expect(resident.episodes).toHaveLength(1);
        }

        // unmapped agents refuse loudly instead of guessing a designation
        const unmapped = migration.migrateResident({id: '@new-peer', name: 'X', properties: {accountType: 'agent', modelFamily: 'claude'}});
        expect(unmapped.valid).toBe(false);
        expect(unmapped.reason).toContain('never guess');
    });
});
