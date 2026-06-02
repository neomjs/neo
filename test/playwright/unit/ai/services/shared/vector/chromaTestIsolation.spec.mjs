import {test, expect} from '@playwright/test';
import {
    CHROMA_PRODUCTION_DATABASE,
    CHROMA_TEST_DATABASE,
    dropChromaTestDatabase,
    ensureChromaTestDatabase
} from '../../../../../../../ai/services/shared/vector/chromaTestIsolation.mjs';

/**
 * Self-test for the unit-test Chroma database-isolation helpers. chromadb 3.x has no
 * getOrCreateDatabase and manages databases on a separate AdminClient, so these helpers ensure the
 * dedicated test database exists before collection ops and drop it wholesale for cleanup. The
 * AdminClient is injected here (no live Chroma server), and the critical assertion is the
 * defense-in-depth guard: `dropChromaTestDatabase` must NEVER reach `default_database`.
 */
test.describe('chromaTestIsolation helpers', () => {
    test('constants: the test database is isolated from production', () => {
        expect(CHROMA_TEST_DATABASE).not.toBe(CHROMA_PRODUCTION_DATABASE);
        expect(CHROMA_PRODUCTION_DATABASE).toBe('default_database');
    });

    test('ensureChromaTestDatabase is a no-op create when the database already exists', async () => {
        const calls = [];
        const adminClient = {
            getDatabase   : async args => { calls.push(['get',    args]) },
            createDatabase: async args => { calls.push(['create', args]) }
        };

        const result = await ensureChromaTestDatabase({database: CHROMA_TEST_DATABASE, adminClient});

        expect(calls.map(c => c[0])).toEqual(['get']); // getDatabase resolved → createDatabase NOT called
        expect(result).toBe(CHROMA_TEST_DATABASE);
    });

    test('ensureChromaTestDatabase creates the database when getDatabase rejects (not-found)', async () => {
        const created = [];
        const adminClient = {
            getDatabase   : async () => { throw new Error('database not found') },
            createDatabase: async args => { created.push(args) }
        };

        const result = await ensureChromaTestDatabase({
            database: CHROMA_TEST_DATABASE, tenant: 'default_tenant', adminClient
        });

        expect(created).toEqual([{name: CHROMA_TEST_DATABASE, tenant: 'default_tenant'}]);
        expect(result).toBe(CHROMA_TEST_DATABASE);
    });

    test('ensureChromaTestDatabase rejects when database is missing', async () => {
        await expect(ensureChromaTestDatabase({adminClient: {}})).rejects.toThrow(/`database` is required/);
    });

    test('dropChromaTestDatabase drops the named test database', async () => {
        const deleted = [];
        const adminClient = {deleteDatabase: async args => { deleted.push(args) }};

        const result = await dropChromaTestDatabase({
            database: CHROMA_TEST_DATABASE, tenant: 'default_tenant', adminClient
        });

        expect(deleted).toEqual([{name: CHROMA_TEST_DATABASE, tenant: 'default_tenant'}]);
        expect(result).toBe(CHROMA_TEST_DATABASE);
    });

    test('dropChromaTestDatabase REFUSES to drop the production database', async () => {
        const deleted = [];
        const adminClient = {deleteDatabase: async args => { deleted.push(args) }};

        await expect(dropChromaTestDatabase({database: CHROMA_PRODUCTION_DATABASE, adminClient}))
            .rejects.toThrow(/refusing to drop the production database/);

        expect(deleted).toEqual([]); // deleteDatabase must never be reached for default_database
    });

    test('dropChromaTestDatabase rejects when database is missing', async () => {
        await expect(dropChromaTestDatabase({adminClient: {}})).rejects.toThrow(/`database` is required/);
    });
});
