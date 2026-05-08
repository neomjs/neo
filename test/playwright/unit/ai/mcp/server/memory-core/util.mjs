export async function cleanupChromaManager(SDK) {
    let ChromaManager, LifecycleService, collectionsConfig;

    if (SDK) {
        ChromaManager = SDK.Memory_ChromaManager;
        LifecycleService = SDK.Memory_LifecycleService;
        collectionsConfig = SDK.Memory_Config?.data?.collections;
    } else {
        ChromaManager = (await import('../../../../../../../ai/mcp/server/memory-core/managers/ChromaManager.mjs')).default;
        LifecycleService = (await import('../../../../../../../ai/mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs')).default;
        const aiConfig = (await import('../../../../../../../ai/mcp/server/memory-core/config.mjs')).default;
        collectionsConfig = aiConfig?.collections;
    }

    if (ChromaManager?.client && collectionsConfig) {
        if (collectionsConfig.memory === 'neo-agent-memory' || collectionsConfig.session === 'neo-agent-sessions') {
            throw new Error(`FATAL: Attempted to delete production Chroma collections! Aborting cleanup. memory=${collectionsConfig.memory}, session=${collectionsConfig.session}`);
        }
        try {
            try { await ChromaManager.client.deleteCollection({name: collectionsConfig.memory}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
            try { await ChromaManager.client.deleteCollection({name: collectionsConfig.session}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
        } catch (e) {
            if (!e.message.includes('not be found')) {
                console.warn(`[Cleanup] Failed to delete test collections:`, e.message);
            }
        }
    }

    if (LifecycleService) {
        LifecycleService._initPromise = null;
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
