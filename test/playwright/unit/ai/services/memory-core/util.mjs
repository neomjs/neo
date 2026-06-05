/**
 * @summary Clears process-singleton Memory Core lifecycle and collection bindings between specs.
 *
 * Memory Core specs mutate `aiConfig.collections.*` and `aiConfig.storagePaths.graph` per file.
 * A graph-only cleanup must still clear the Memory Core lifecycle promise plus Chroma collection
 * handles, otherwise the next `--workers=1` spec can reuse a collection binding resolved by an
 * earlier spec while resolving config leaf names from the later spec.
 *
 * @param {Object} [SDK] Optional `ai/services.mjs` aggregate import for callers that already hold it.
 */
export async function resetMemoryCoreLifecycle(SDK) {
    let ChromaManager, LifecycleService, StorageRouter;

    if (SDK) {
        ChromaManager    = SDK.Memory_ChromaManager;
        LifecycleService = SDK.Memory_LifecycleService;
        StorageRouter    = SDK.Memory_StorageRouter;
    } else {
        ChromaManager    = (await import('../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;
        LifecycleService = (await import('../../../../../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs')).default;
        StorageRouter    = (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
    }

    if (LifecycleService) {
        LifecycleService._initPromise = null;
    }

    if (StorageRouter) {
        StorageRouter._initPromise = null;
    }

    if (ChromaManager) {
        ChromaManager._memoryCollectionPromise = null;
        ChromaManager._summaryCollectionPromise = null;
        ChromaManager._graphCollectionPromise = null;
        ChromaManager.memoryCollection = null;
        ChromaManager.summaryCollection = null;
        ChromaManager.graphCollection = null;
    }
}

export async function cleanupChromaManager(SDK) {
    let ChromaManager, collectionsConfig;

    if (SDK) {
        ChromaManager = SDK.Memory_ChromaManager;
        collectionsConfig = SDK.Memory_Config?.data?.collections;
    } else {
        ChromaManager = (await import('../../../../../../ai/services/memory-core/managers/ChromaManager.mjs')).default;
        const aiConfig = (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        collectionsConfig = aiConfig?.collections;
    }

    if (ChromaManager?.client && collectionsConfig) {
        // Defense-in-depth: refuse cleanup when `UNIT_TEST_MODE !== 'true'` regardless of
        // collection name. The earlier guard checked only the name; under `npx playwright`
        // without the unit-test config, `aiConfig.collections.*` falls through to canonical
        // names AND `UNIT_TEST_MODE` is unset — both invariants must hold for cleanup to proceed.
        // The substrate-level guard in `ChromaManager.deleteCollection` is the hard backstop;
        // this helper-level check fails fast with a clearer diagnostic before any chroma call.
        if (process.env.UNIT_TEST_MODE !== 'true') {
            throw new Error(`FATAL: cleanupChromaManager() invoked without UNIT_TEST_MODE=true. Refusing cleanup to protect live Chroma collections. Run via 'npm run test-unit' (loads playwright.config.unit.mjs) instead of bare 'npx playwright'.`);
        }
        if (collectionsConfig.memory === 'neo-agent-memory' || collectionsConfig.session === 'neo-agent-sessions') {
            throw new Error(`FATAL: Attempted to delete production Chroma collections! Aborting cleanup. memory=${collectionsConfig.memory}, session=${collectionsConfig.session}`);
        }
        try {
            // Route through the guarded ChromaManager.deleteCollection so the substrate-
            // level invariant fires uniformly. Test-prefixed names skip the guard cleanly under
            // UNIT_TEST_MODE; the bare `client.deleteCollection` access path is deprecated.
            try { await ChromaManager.deleteCollection({name: collectionsConfig.memory}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
            try { await ChromaManager.deleteCollection({name: collectionsConfig.session}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
        } catch (e) {
            if (!e.message.includes('not be found')) {
                console.warn(`[Cleanup] Failed to delete test collections:`, e.message);
            }
        }
    }

    await resetMemoryCoreLifecycle(SDK);
}

export class TestLifecycleHelper {
    static async cleanupGraphService(GraphService, SystemLifecycleService, testDbPath, fs, strategy = 'destroy') {
        if (strategy === 'clear') {
            if (GraphService?.db) {
                GraphService.db.nodes.clear();
                GraphService.db.edges.clear();
                if (GraphService.db.vicinityLoadedNodes) { GraphService.db.vicinityLoadedNodes.clear(); }
                if (GraphService.db.storage) {
                    try { await GraphService.db.storage.clear(); } catch (e) {
                        console.warn(`[Cleanup] Failed to clear test database:`, e.message);
                    }
                }
            }
            await resetMemoryCoreLifecycle();
            return;
        }

        if (GraphService?.db) {
            try { GraphService.db.destroy(); } catch (e) {}
            GraphService.db = null;
            GraphService._initPromise = null;
        }

        if (SystemLifecycleService) {
            SystemLifecycleService._initPromise = null;
        }

        await resetMemoryCoreLifecycle();

        if (fs && testDbPath) {
            try {
                if (fs.existsSync(testDbPath)) {
                    fs.unlinkSync(testDbPath);
                }
                if (fs.existsSync(testDbPath + '-wal')) {
                    fs.unlinkSync(testDbPath + '-wal');
                }
                if (fs.existsSync(testDbPath + '-shm')) {
                    fs.unlinkSync(testDbPath + '-shm');
                }
            } catch (e) {
                console.warn(`[Cleanup] Failed to delete test database files:`, e.message);
            }
        }
    }
}
