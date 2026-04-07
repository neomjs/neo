import Base                      from '../../../../../../src/core/Base.mjs';
import ChromaLifecycleService    from './ChromaLifecycleService.mjs';
import InferenceLifecycleService from './InferenceLifecycleService.mjs';
import logger                    from '../../logger.mjs';

/**
 * @summary Facade orchestrator for initializing the Memory Core dependencies.
 *
 * It combines the independent boot sequences of the vector databases (SQLite/Chroma)
 * and the local mathematical engine (MLX/Ollama) into a single readiness promise.
 * This facade protects downstream consumer scripts from internal modularity changes.
 *
 * @class Neo.ai.mcp.server.memory-core.services.lifecycle.SystemLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class SystemLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.lifecycle.SystemLifecycleService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.lifecycle.SystemLifecycleService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Boots the underlying data and inference services.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        
        logger.info('[SystemLifecycleService] Booting internal memory-core microservices. Please stand by...');

        const GraphService        = (await import('../GraphService.mjs')).default;
        const SQLiteVectorManager = (await import('../../managers/SQLiteVectorManager.mjs')).default;
        const StorageRouter       = (await import('../../managers/StorageRouter.mjs')).default;

        if (!StorageRouter._initPromise) await StorageRouter.initAsync();
        if (!SQLiteVectorManager._initPromise) await SQLiteVectorManager.initAsync();
        if (!GraphService._initPromise) await GraphService.initAsync();
        if (!ChromaLifecycleService._initPromise) await ChromaLifecycleService.initAsync();
        if (!InferenceLifecycleService._initPromise) await InferenceLifecycleService.initAsync();

        await StorageRouter.ready();
        await SQLiteVectorManager.ready();
        await GraphService.ready();
        await ChromaLifecycleService.ready();
        await InferenceLifecycleService.ready();

        logger.info('[SystemLifecycleService] All memory-core microservices initialized successfully!');
    }
}

export default Neo.setupClass(SystemLifecycleService);
