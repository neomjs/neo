import aiConfig      from '../../../../../buildScripts/ai/aiConfig.mjs';
import chromaManager from './chromaManager.mjs';

/**
 * Builds the payload returned by GET /healthcheck.
 * @returns {Promise<Object>}
 */
export async function buildHealthResponse() {
    const {heartbeat, memoryCollection, summaryCollection} = await chromaManager.checkConnectivity();

    return {
        status   : 'healthy',
        timestamp: new Date().toISOString(),
        database : {
            host       : aiConfig.memory.host,
            port       : aiConfig.memory.port,
            heartbeat,
            collections: {
                memories : memoryCollection,
                summaries: summaryCollection
            }
        },
        uptime: process.uptime()
    };
}
