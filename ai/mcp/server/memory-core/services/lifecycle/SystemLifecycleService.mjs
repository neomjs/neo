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

        // Parallelize startup if they don't depend on each other, but for safety await sequentially
        await ChromaLifecycleService.ready();
        await InferenceLifecycleService.ready();
        
        logger.info('[SystemLifecycleService] All memory-core microservices initialized successfully!');
    }
}

export default Neo.setupClass(SystemLifecycleService);
