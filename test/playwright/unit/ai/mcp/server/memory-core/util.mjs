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

    try {
        if (ChromaManager?.client && collectionsConfig) {
            try { await ChromaManager.client.deleteCollection({name: collectionsConfig.memory}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
            try { await ChromaManager.client.deleteCollection({name: collectionsConfig.session}); } catch(e) { if (!e.message.includes('not be found')) throw e; }
        }
    } catch (e) {
        if (!e.message.includes('not be found')) {
            console.warn(`[Cleanup] Failed to delete test collections:`, e.message);
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
