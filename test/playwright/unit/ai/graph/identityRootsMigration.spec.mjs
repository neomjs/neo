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

    test('every migration-epoch resident migrates; post-epoch residents defer without failure', () => {
        const {valid, residents, report} = migration.migrateAllResidents();

        expect(report.failures).toEqual([]);
        expect(valid).toBe(true);

        // The migration roster is complete for the epoch. Post-epoch residents open their first
        // era from live observation and therefore never receive a retroactive migration seed.
        const agentSeeds = roots.IDENTITIES.filter(seed => seed?.properties?.accountType === 'agent'),
              epochSeeds = agentSeeds.filter(seed => !migration.isPostEpochResident(seed));

        expect(residents).toHaveLength(epochSeeds.length);
        expect(report.skipped.filter(entry => entry.accountType === 'agent')).toEqual([{
            id         : '@neo-gpt-emmy',
            accountType: 'agent',
            reason     : 'post-epoch-resident-no-seed-era'
        }, {
            id         : '@neo-kimi-phoebe',
            accountType: 'agent',
            reason     : 'post-epoch-resident-no-seed-era'
        }, {
            id         : '@neo-kimi-iris',
            accountType: 'agent',
            reason     : 'post-epoch-resident-no-seed-era'
        }, {
            id         : '@neo-preview',
            accountType: 'agent',
            reason     : 'post-epoch-resident-no-seed-era'
        }]);
        expect(migration.isPostEpochResident(roots.IDENTITIES.find(entry => entry.id === '@neo-gpt-emmy'))).toBe(true);
        expect(migration.isPostEpochResident(roots.IDENTITIES.find(entry => entry.id === '@neo-gpt'))).toBe(false);
        expect(migration).not.toHaveProperty('POST_EPOCH_RESIDENT_IDS');
        expect(roots.IDENTITIES.find(entry => entry.id === '@neo-gpt-emmy').properties).not.toHaveProperty('identityContract');

        // every chain re-validates through the schema, independently of the migration's own check
        for (const resident of residents) {
            expect(schema.validateEraChain(resident.identity, resident.episodes)).toEqual({valid: true, reason: null});
        }
    });

    test('the seed era carries the RECORDED facts verbatim — the module-owned epoch snapshot, never the live registry', () => {
        const {residents} = migration.migrateAllResidents();

        for (const {identity, episodes} of residents) {
            const seed  = roots.IDENTITIES.find(entry => entry.id === identity.identityKey);
            const facts = migration.REGISTRY_SEED_FACTS[identity.identityKey];
            const era   = episodes[0];

            // era facts come from the module-owned snapshot (the recorded-fact owner since the
            // flat-field retirement); the identity view carries NO era-owned fact
            expect(facts).toBeTruthy();
            expect(era.family).toBe(facts.family);
            expect(era.tier).toBe(facts.tier);
            for (const key of schema.ERA_OWNED_FACTS) {
                expect(identity.socialLayer[key]).toBeUndefined();
            }

            // sunsetTriggers live on the ERA now — succession semantics belong to the embodiment
            expect(era.capabilities.sunsetTriggers).toEqual(facts.capabilities.sunsetTriggers);

            // recorded capability facts carried verbatim from the snapshot
            expect(era.capabilities.contextWindowInput).toBe(facts.capabilities.contextWindowInput);

            // the RETIREMENT is real: the live registry entry no longer carries any of the
            // era-owned flat fields the snapshot recorded (modelFamily stays — identity-level).
            for (const retired of ['family', 'tier', 'contextWindowInput', 'parallelToolCalls', 'thoughtBudget', 'hosting', 'sunsetTriggers']) {
                expect(seed.properties).not.toHaveProperty(retired);
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

        // the ONE documented swap event is exported as a candidate with source and named gap;
        // @neo-fable is bearer-audited OFF the list (born Fable 2026-06-10; the June suspension
        // is an identity-level participation gap, never an embodiment swap — nothing to backfill)
        expect(report.backfillCandidates).toEqual(['@neo-opus-vega']);
        expect(report.backfillCandidates).not.toContain('@neo-fable');
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

        const postEpoch = migration.migrateResident(roots.IDENTITIES.find(entry => entry.id === '@neo-gpt-emmy'));
        expect(postEpoch.valid).toBe(false);
        expect(postEpoch.reason).toContain('never retro-seed');
    });
});
