import Base          from '../../../../../src/core/Base.mjs';
import aiConfig      from '../config.mjs';
import ChromaManager from './ChromaManager.mjs';
import logger        from '../logger.mjs';

/**
 * @summary Service for offline GraphRAG extraction ("REM Sleep").
 *
 * Scans recent session summaries from the `neo-agent-sessions` collection that have not
 * yet been formally digested into Graph Nodes and Edges. Uses the local Ollama provider
 * via `gemma-4-31b-it` to extract formal graph structures from episodic memories.
 *
 * @class Neo.ai.mcp.server.memory-core.services.DreamService
 * @extends Neo.core.Base
 * @singleton
 */
class DreamService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.DreamService'
         * @protected
         */
         className: 'Neo.ai.mcp.server.memory-core.services.DreamService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * @member {Object|null} sessionsCollection_=null
         * @protected
         * @reactive
         */
        sessionsCollection_: null
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        // Wait for ChromaManager to be ready (connected)
        await ChromaManager.ready();
        this.sessionsCollection = await ChromaManager.getSummaryCollection();

        if (aiConfig.data.autoDream) {
            logger.info('[Startup] DreamService: Checking for undigested session memories...');
            this.processUndigestedSessions();
        }
    }

    /**
     * Identifies session summaries that do not have the 'graphDigested' metadata flag set to true.
     * @returns {Promise<Object[]>} List of metadata objects for undigested sessions
     */
    async findUndigestedSessions() {
        // Since ChromaDB filtering on missing attributes can be tricky depending on version,
        // we'll fetch recent sessions and filter in memory if the dataset is reasonable.
        // For production, we will just query specifically.
        const limit = aiConfig.summarizationBatchLimit || 2000;
        
        try {
            const batch = await this.sessionsCollection.get({
                include: ['metadatas', 'documents'],
                limit
            });

            if (!batch || !batch.ids.length) {
                return [];
            }

            const undigested = [];
            for (let i = 0; i < batch.ids.length; i++) {
                const meta = batch.metadatas[i];
                if (meta && meta.graphDigested !== true && meta.graphDigested !== 'true') {
                    undigested.push({
                        id: batch.ids[i],
                        document: batch.documents[i],
                        meta
                    });
                }
            }

            return undigested;
        } catch (error) {
            logger.error('[DreamService] Error querying undigested sessions:', error);
            return [];
        }
    }

    /**
     * Pipeline to process undigested sessions.
     */
    async processUndigestedSessions() {
        try {
            const sessions = await this.findUndigestedSessions();
            if (sessions.length === 0) {
                logger.info('[DreamService] No undigested session memories found.');
                return;
            }

            logger.info(`[DreamService] Found ${sessions.length} undigested session(s). Beginning REM pipeline...`);
            
            // For Sub-Epic 3A, this is a skeleton pipeline.
            // We'll iterate through them and prepare them for batch inference.
            // Inference logic itself will come in 3B, and IPC transfer in 3C.
            for (const session of sessions) {
                logger.info(`[DreamService] Preparing session ${session.meta.sessionId} ("${session.meta.title}") for REM extraction.`);
                await this.extractGraphEntities(session);
            }
            
            logger.info('[DreamService] REM pipeline completed.');
        } catch (error) {
            logger.error('[DreamService] Failed to process undigested sessions:', error);
        }
    }

    /**
     * Extracts Nodes and Edges from the session memory.
     * @param {Object} session Wrapped session object containing id, document, and meta
     */
    async extractGraphEntities(session) {
        // Prepare extraction prompt implementation (Sub-Epic 3B)
        // Submit via local Ollama provider
        // Forward to knowledge-base via IPC bridge (Sub-Epic 3C)
        // Mark as digested in ChromaDB
        
        // This is a placeholder for Sub-Epic 3A
        logger.debug(`[DreamService] Stub: Extracting entities for session ID: ${session.meta.sessionId}`);
    }
}

export default Neo.setupClass(DreamService);
