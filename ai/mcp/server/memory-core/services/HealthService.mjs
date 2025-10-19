import aiConfig                 from '../../config.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import ChromaManager            from './ChromaManager.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

/**
 * Service for providing the health status of the memory core server.
 * @class AI.mcp.server.memory.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory.HealthService'
         * @protected
         */
        className: 'AI.mcp.server.memory.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Builds the health response for the memory core server.
     * @returns {Promise<object>}
     */
    async buildHealthResponse() {
        const processStatus = DatabaseLifecycleService.getDatabaseStatus();
        try {
            await ChromaManager.client.heartbeat();

            let memoryCount = 0, summaryCount = 0;

            const memoryCollection = await ChromaManager.getMemoryCollection().catch(() => null);
            if (memoryCollection) {
                memoryCount = await memoryCollection.count();
            }

            const summaryCollection = await ChromaManager.getSummaryCollection().catch(() => null);
            if (summaryCollection) {
                summaryCount = await summaryCollection.count();
            }

            return {
                status: "healthy",
                database: {
                    process: processStatus,
                    connection: {
                        connected: true,
                        collections: {
                            memories: {
                                name  : aiConfig.memoryCore.memoryDb.collectionName,
                                exists: !!memoryCollection,
                                count : memoryCount
                            },
                            summaries: {
                                name  : aiConfig.memoryCore.sessionDb.collectionName,
                                exists: !!summaryCollection,
                                count : summaryCount
                            }
                        }
                    }
                },
                version: "1.0.0", // TODO: Should come from package.json
                uptime: process.uptime()
            };
        } catch (error) {
            return {
                status: "unhealthy",
                database: {
                    process: processStatus,
                    connection: {
                        connected: false,
                        error    : error.message
                    }
                }
            };
        }
    }
}

export default Neo.setupClass(HealthService);
