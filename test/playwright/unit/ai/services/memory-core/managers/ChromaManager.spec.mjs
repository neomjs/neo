import { setup } from '../../../../../setup.mjs';

const appName = 'ChromaManagerTest';

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

import {test, expect}                                     from '@playwright/test';
import Neo                                                from '../../../../../../../src/Neo.mjs';
import * as core                                          from '../../../../../../../src/core/_export.mjs';
import InstanceManager                                    from '../../../../../../../src/manager/Instance.mjs';
import aiConfig                                           from '../../../../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaManager                                      from '../../../../../../../ai/services/memory-core/managers/ChromaManager.mjs';
import {CHROMA_PRODUCTION_DATABASE, CHROMA_TEST_DATABASE} from '../../../../../../../ai/services/shared/vector/chromaTestIsolation.mjs';
import logger                                             from '../../../../../../../ai/mcp/server/memory-core/logger.mjs';
import StorageRouter                                      from '../../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import SystemLifecycleService                             from '../../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs';
import {resetMemoryCoreLifecycle}                         from '../util.mjs';

// Unit test mode resolves storagePaths.graph to ':memory:' by construction.

test.describe('Neo.ai.services.memory-core.managers.ChromaManager', () => {
    test('logs an operator-actionable config error before throwing on missing Chroma coordinates', () => {
        const errors        = [];
        const originalError = logger.error;

        logger.error = msg => errors.push(msg);

        try {
            expect(() => ChromaManager.resolveChromaClientConfig({engines: {}}))
                .toThrow(/engines\.chroma\.\{host, port\}/);

            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain('Boot-time config error');
            expect(errors[0]).toContain('engines.chroma.{host, port}');
        } finally {
            logger.error = originalError;
        }
    });

    test('resolveChromaClientConfig returns the configured database verbatim (no fallback substitution)', () => {
        const resolved = ChromaManager.resolveChromaClientConfig({
            engines: {chroma: {host: 'localhost', port: 8000, database: 'some-explicit-db'}}
        });

        expect(resolved).toEqual({host: 'localhost', port: 8000, database: 'some-explicit-db'});
    });

    test('assertCollectionNotProdBleed: a test-named collection in the production database is refused (#14031/#14044)', () => {
        // The bleed signature: test isolation routed the collection NAME to a test variant
        // (test-*) but the DATABASE fell back to production. Refuse at the collection boundary.
        expect(() => ChromaManager.assertCollectionNotProdBleed({
            name: 'test-memory-123-abc', database: CHROMA_PRODUCTION_DATABASE
        })).toThrow(/collection-boundary test-write isolation/);

        // A production-NAMED collection in the production database is NOT refused — the legitimate
        // fresh-workspace / cloud daemon case: prod coordinates + prod-named collections, inheriting
        // Playwright's TEST_WORKER_INDEX, must boot without tripping the guard (the resolver-level
        // db-name guard wrongly blocked this; the collection-name discriminator fixes it).
        expect(() => ChromaManager.assertCollectionNotProdBleed({
            name: 'neo-agent-memory', database: CHROMA_PRODUCTION_DATABASE
        })).not.toThrow();

        // A test-named collection in an isolated TEST database is the normal unit-test path — allowed.
        expect(() => ChromaManager.assertCollectionNotProdBleed({
            name: 'test-memory-123-abc', database: CHROMA_TEST_DATABASE
        })).not.toThrow();
    });

    test('under UNIT_TEST_MODE Chroma uses an isolated daemon, data dir, and database (#14010)', () => {
        // The spec runs with unitTestMode:true, so the config leaf must resolve to the dedicated
        // test coordinates by construction. No interrupted unit run can create collections in the
        // live Chroma daemon because the client never points at its endpoint or persist dir.
        // The test-database toggle is ON (declaratively resolved from UNIT_TEST_MODE), so the resolver
        // selects the dedicated test database — never default_database — by construction. Both NAMES are
        // config literals; the toggle (not an env var the runner must remember to set) drives selection.
        expect(aiConfig.engines.chroma.useTestDatabase).toBe(true);
        expect(aiConfig.engines.chroma.databaseTest).toBe(CHROMA_TEST_DATABASE);
        expect(aiConfig.engines.chroma.database).toBe(CHROMA_PRODUCTION_DATABASE);
        expect(aiConfig.engines.chroma.dataDir).toBe(aiConfig.engines.chroma.dataDirTest);
        expect(aiConfig.engines.chroma.dataDir).not.toBe(aiConfig.engines.chroma.dataDirProd);
        expect(aiConfig.engines.chroma.port).toBe(aiConfig.engines.chroma.portTest);
        expect(aiConfig.engines.chroma.port).not.toBe(aiConfig.engines.chroma.portProd);

        // …and the resolver carries the isolated namespace (databaseTest) through to the client coordinates.
        const {database, port} = ChromaManager.resolveChromaClientConfig(aiConfig);
        expect(database).toBe(CHROMA_TEST_DATABASE);
        expect(database).not.toBe(CHROMA_PRODUCTION_DATABASE);
        expect(port).toBe(aiConfig.engines.chroma.portTest);
    });

    test('the constructed ChromaClient targets the isolated test database', () => {
        // construct() wires resolveChromaClientConfig(...).database (the toggle-selected test DB) into
        // `new ChromaClient({database})`, so the live client targets the isolated namespace, not prod.
        expect(ChromaManager.client.database).toBe(aiConfig.engines.chroma.databaseTest);
        expect(ChromaManager.client.database).not.toBe(CHROMA_PRODUCTION_DATABASE);
    });

    test('resolveChromaClientConfig fails closed: refuses the production database under the test toggle (#12335 AC1)', () => {
        // With the test toggle ON, a misconfigured databaseTest that resolves into the production namespace
        // must fail closed before any ChromaClient construct/connect — so no unit run can touch production.
        expect(() => ChromaManager.resolveChromaClientConfig({
            engines: {chroma: {host: 'localhost', port: 8000, database: CHROMA_PRODUCTION_DATABASE, databaseTest: CHROMA_PRODUCTION_DATABASE, useTestDatabase: true}}
        })).toThrow(/refusing the production database .* test-database toggle/);

        // A correctly isolated test database resolves cleanly (the guard fires only when the resolved DB is prod).
        expect(ChromaManager.resolveChromaClientConfig({
            engines: {chroma: {host: 'localhost', port: 8000, database: CHROMA_PRODUCTION_DATABASE, databaseTest: CHROMA_TEST_DATABASE, useTestDatabase: true}}
        }).database).toBe(CHROMA_TEST_DATABASE);
    });

    test('resetMemoryCoreLifecycle clears singleton readiness and collection handles', async () => {
        const stalePromise = Promise.resolve({name: 'stale-collection'});

        SystemLifecycleService._initPromise   = stalePromise;
        StorageRouter._initPromise            = stalePromise;
        ChromaManager._memoryCollectionPromise  = stalePromise;
        ChromaManager._summaryCollectionPromise = stalePromise;
        ChromaManager._graphCollectionPromise   = stalePromise;
        ChromaManager.memoryCollection  = {name: 'stale-memory'};
        ChromaManager.summaryCollection = {name: 'stale-summary'};
        ChromaManager.graphCollection   = {name: 'stale-graph'};

        await resetMemoryCoreLifecycle();

        expect(SystemLifecycleService._initPromise).toBeNull();
        expect(StorageRouter._initPromise).toBeNull();
        expect(ChromaManager._memoryCollectionPromise).toBeNull();
        expect(ChromaManager._summaryCollectionPromise).toBeNull();
        expect(ChromaManager._graphCollectionPromise).toBeNull();
        expect(ChromaManager.memoryCollection).toBeNull();
        expect(ChromaManager.summaryCollection).toBeNull();
        expect(ChromaManager.graphCollection).toBeNull();
    });

    test('invalidateCollectionCache clears targeted and all collection handles', () => {
        const stalePromise = Promise.resolve({name: 'stale-collection'});

        ChromaManager._memoryCollectionPromise  = stalePromise;
        ChromaManager._summaryCollectionPromise = stalePromise;
        ChromaManager._graphCollectionPromise   = stalePromise;
        ChromaManager.memoryCollection  = {name: 'stale-memory'};
        ChromaManager.summaryCollection = {name: 'stale-summary'};
        ChromaManager.graphCollection   = {name: 'stale-graph'};

        ChromaManager.invalidateCollectionCache('summary');

        expect(ChromaManager._memoryCollectionPromise).toBe(stalePromise);
        expect(ChromaManager.memoryCollection).toEqual({name: 'stale-memory'});
        expect(ChromaManager._summaryCollectionPromise).toBeNull();
        expect(ChromaManager.summaryCollection).toBeNull();
        expect(ChromaManager._graphCollectionPromise).toBe(stalePromise);
        expect(ChromaManager.graphCollection).toEqual({name: 'stale-graph'});

        ChromaManager.invalidateCollectionCache();

        expect(ChromaManager._memoryCollectionPromise).toBeNull();
        expect(ChromaManager._summaryCollectionPromise).toBeNull();
        expect(ChromaManager._graphCollectionPromise).toBeNull();
        expect(ChromaManager.memoryCollection).toBeNull();
        expect(ChromaManager.summaryCollection).toBeNull();
        expect(ChromaManager.graphCollection).toBeNull();
    });

    test('isCollectionNotFoundError classifies Chroma stale-handle signatures', () => {
        const namedError = new Error('boom');
        namedError.name  = 'ChromaNotFoundError';

        expect(ChromaManager.isCollectionNotFoundError(namedError)).toBe(true);
        expect(ChromaManager.isCollectionNotFoundError(new Error('The requested resource could not be found'))).toBe(true);
        expect(ChromaManager.isCollectionNotFoundError(new Error('connection refused'))).toBe(false);
    });

    test('should prevent console.warn global state theft during concurrent collection fetching', async () => {
        // Set up a custom warn logger to inspect leaks
        const warningLogs  = [];
        const originalWarn = console.warn;
        let originalClient;

        console.warn = (...args) => {
            warningLogs.push(args.join(' '));
        };

        try {
            if (!SystemLifecycleService._initPromise) { await SystemLifecycleService.initAsync(); } else { await SystemLifecycleService.ready(); }

            originalClient = ChromaManager.client;

            // Mock the client to simulate async latency and rogue warnings
            ChromaManager.client = {
                getOrCreateCollection: async () => {
                    // Simulate Chroma DB latency
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Simulate Chroma's hardcoded schema wrapper warning
                    console.warn("No embedding function configuration found");
                    return { dummy: true };
                }
            };

            // Clear singleton caches to force concurrent fresh executions
            ChromaManager._memoryCollectionPromise  = null;
            ChromaManager._summaryCollectionPromise = null;

            // Execute simultaneously! Before the mutex, this would steal () => {}
            // and leave global console.warn permanently corrupt.
            const [mem, summary] = await Promise.all([
                ChromaManager.getMemoryCollection(),
                ChromaManager.getSummaryCollection()
            ]);

            expect(mem).toBeDefined();
            expect(summary).toBeDefined();

            // After they resolve, console.warn MUST still be our trackable mock, NOT () => {}
            console.warn("TEST_SHOULD_WORK");

            // The DUMMY_WARNING should NOT be captured (because the Mutex suppressed it!)
            expect(warningLogs).not.toContain("No embedding function configuration found");

            // The explicit test must be captured, proving the restore was lossless
            expect(warningLogs).toContain("TEST_SHOULD_WORK");

        } finally {
            // Un-mock
            console.warn = originalWarn;
            if (originalClient) ChromaManager.client = originalClient;
            await resetMemoryCoreLifecycle();
        }
    });
});
