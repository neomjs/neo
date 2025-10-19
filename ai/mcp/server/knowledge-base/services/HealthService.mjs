import aiConfig                 from '../../config.mjs';
import Base                     from '../../../../../src/core/Base.mjs';
import ChromaManager            from './ChromaManager.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

/**
 * Service for providing the health status of the knowledge base server.
 * @class Neo.ai.mcp.server.knowledge-base.service.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.service.HealthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.service.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Builds the health response for the knowledge base server.
     * @returns {Promise<object>}
     */
    async healthcheck() {
        const processStatus = DatabaseLifecycleService.get_database_status();
        try {
            await ChromaManager.client.heartbeat();

            let collectionCount = 0;

            const collection = await ChromaManager.getKnowledgeBaseCollection().catch(() => null);
            if (collection) {
                collectionCount = await collection.count();
            }

            return {
                status: "healthy",
                database: {
                    process: processStatus,
                    connection: {
                        connected: true,
                        collection: {
                            name:   aiConfig.knowledgeBase.collectionName,
                            exists: !!collection,
                            count:  collectionCount
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
