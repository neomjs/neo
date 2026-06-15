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

/**
 * @summary Flushes pending WAL records through the production embed-drain path.
 *
 * The spec-side replacement for the removed `MemoryService.drainPendingEmbeds()`: `addMemory`
 * no longer embeds in-process (the orchestrator-managed embed daemon owns the drain), so specs
 * flush deterministically by running one targeted `drainWalOnce` cycle — the EXACT production
 * logic the daemon executes — against the worker's resolved WAL dir and the currently-installed
 * memory collection (real or spy).
 *
 * Pass `ids` (recommended) to reconcile only the records the calling spec just wrote: sibling
 * specs sharing the worker's WAL dir may deliberately leave foreign records pending
 * (`MemoryService.WriteAhead.spec.mjs` does), and an unscoped drain would pull those into the
 * caller's collection.
 *
 * @param {Object} [options]
 * @param {String[]} [options.ids]      Record ids to drain; omit to drain the whole dir.
 * @param {Object} [options.collection] Explicit collection; defaults to `StorageRouter.getMemoryCollection()`.
 * @param {Object} [options.SDK]        Optional `ai/services.mjs` aggregate for callers that already hold it.
 * @returns {Promise<Object>} The `drainWalOnce` cycle summary.
 */
export async function drainMemoryWal({ids, collection, SDK} = {}) {
    const aiConfig       = SDK?.Memory_Config ?? (await import('../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
    const StorageRouter  = SDK?.Memory_StorageRouter ?? (await import('../../../../../../ai/services/memory-core/managers/StorageRouter.mjs')).default;
    const {drainWalOnce} = await import('../../../../../../ai/daemons/embed/drainCycle.mjs');

    return drainWalOnce({
        dir           : aiConfig.memoryWal.dir,
        collection    : collection ?? await StorageRouter.getMemoryCollection(),
        ids,
        batchSize     : 1000,
        maxRetries    : 0,  // single attempt — a failing spy must leave records pending, not retry-loop
        backoffBaseMs : 1,
        retentionLimit: 0   // non-positive disables pruning: no side-effects on the shared worker dir
    });
}

/**
 * @summary Snapshots the given dot-path `aiConfig` leaves and returns a `restore()` thunk.
 *
 * `aiConfig` is a Provider singleton imported once per module graph; a spec that writes its leaves
 * in setup (e.g. `storagePaths.graph`, `autoIngestFileSystem`) without restoring leaks that state
 * into the next `--workers=1` spec — the shared-singleton mutation hazard (B4) this isolation helper
 * targets. Capture BEFORE the first mutation; call the returned thunk in `afterAll`/`afterEach`.
 *
 * **Contract — existing leaves only.** `restore()` reassigns each captured leaf via the proxy set
 * trap (routed to the owning provider's `setData`), which faithfully restores a leaf that EXISTED at
 * capture. A leaf that was ABSENT cannot be undone: the Provider exposes no delete API and the proxy
 * has no `deleteProperty` trap, so neither `delete` nor a re-set to `undefined` removes the path a
 * test added — the written value keeps resolving via the get trap. Rather than hand back a
 * `restore()` that silently leaks, the helper throws on a path that does not already resolve to a
 * leaf. Isolate leaves you ADD during a test by construction (`unitTestMode`), not with this helper.
 *
 * @param {Object} aiConfig The memory-core `aiConfig` Provider singleton (or a plain fixture).
 * @param {String[]} paths Dot-paths to scalar leaves that EXIST at capture, e.g.
 *     `['storagePaths.graph', 'handoffFilePath']`.
 * @returns {Function} `restore()` — reassigns each captured leaf to its original value.
 * @throws {Error} If any path does not resolve to an existing leaf at capture time.
 * @see learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md
 */
export function snapshotAiConfig(aiConfig, paths) {
    const captured = paths.map(dotPath => {
        const segments = dotPath.split('.'),
              key      = segments.pop(),
              parent   = segments.reduce((node, segment) => node?.[segment], aiConfig),
              value    = parent ? parent[key] : undefined;

        // Existence is judged by the resolved value, not `hasOwnProperty`: the proxy's
        // getOwnPropertyDescriptor trap misses leaves its get trap resolves, so hasOwnProperty is
        // unreliable here (it is false for `handoffFilePath` even though the leaf resolves to a value).
        if (value === undefined) {
            throw new Error(
                `snapshotAiConfig: "${dotPath}" does not resolve to a value at capture time. The ` +
                `Provider exposes no delete API, so a leaf a test adds cannot be undone — snapshot ` +
                `only leaves that already resolve to a value.`
            );
        }

        return {parent, key, value};
    });

    return function restore() {
        captured.forEach(({parent, key, value}) => {
            parent[key] = value
        });
    };
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
