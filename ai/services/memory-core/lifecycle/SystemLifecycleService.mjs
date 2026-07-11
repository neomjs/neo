import Base                      from '../../../../src/core/Base.mjs';
import ChromaLifecycleService    from './ChromaLifecycleService.mjs';
import InferenceLifecycleService from './InferenceLifecycleService.mjs';
import logger                    from '../../../mcp/server/memory-core/logger.mjs';

/**
 * @summary Facade orchestrator for initializing the Memory Core dependencies.
 *
 * It combines the independent boot sequences of the vector databases (SQLite/Chroma)
 * and the local mathematical engine (MLX/Ollama) into a single readiness promise.
 * This facade protects downstream consumer scripts from internal modularity changes.
 *
 * @class Neo.ai.services.memory-core.lifecycle.SystemLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class SystemLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.lifecycle.SystemLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.lifecycle.SystemLifecycleService',
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

        const GraphService  = (await import('../GraphService.mjs')).default;
        const StorageRouter = (await import('../managers/StorageRouter.mjs')).default;

        // Every child is a singleton whose construct() already auto-fired its own initAsync at
        // import time — awaiting ready() is the whole boot contract. The former external
        // initAsync() calls here double-initialized StorageRouter on every boot (its guard flag
        // was never set), which this collapse removes.
        await ChromaLifecycleService.ready();
        await InferenceLifecycleService.ready();
        await GraphService.ready();
        await StorageRouter.ready();

        logger.info('[SystemLifecycleService] All memory-core microservices initialized successfully!');
    }
}

export default Neo.setupClass(SystemLifecycleService);
