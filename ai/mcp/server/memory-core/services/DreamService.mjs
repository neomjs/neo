import aiConfig      from '../config.mjs';
import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';
import GraphService  from './GraphService.mjs';
import Json          from '../../../../../src/util/Json.mjs';
import logger        from '../logger.mjs';
import Ollama        from '../../../../provider/Ollama.mjs';

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
     * @returns {Promise<Object|null>} The extracted graph payload, or null on failure
     */
    async extractGraphEntities(session) {
        logger.debug(`[DreamService] Extracting entities for session ID: ${session.meta.sessionId}`);

        const prompt = `
You are the Neo.mjs REM (Rapid Eye Movement) Sleep digestion agent.
Your task is to analyze the following episodic development session history and extract a formal knowledge graph structure consisting of Nodes and Edges.

Nodes must be core concepts, framework components, APIs, or files discussed in the session.
Edges must be the relationships between these nodes.

Enforce this STRICT JSON schema:
{
  "nodes": [
    {
      "id": "Type:Name",
      "type": "String",
      "name": "String",
      "description": "String"
    }
  ],
  "edges": [
    {
      "source": "String (must match a node id)",
      "target": "String (must match a node id)",
      "relationship": "String (e.g. IMPLEMENTS, USES, FIXES, DEPRECATES)",
      "weight": 1.0
    }
  ]
}

DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.

--- Session Episodic Memory ---
${session.document}
`;

        try {
            const provider = Neo.create(Ollama, {
                modelName: 'gemma-4-31b-it'
            });

            // Call standard generation method with explicit format enforcement
            const result = await provider.generate(prompt, {
                response_format: { type: 'json_object' }
            });

            // Extract using robust Json parser to catch malformed boundaries
            const payload = Json.extract(result.content);

            if (!payload || !payload.nodes || !payload.edges) {
                logger.warn(`[DreamService] Failed to validate extracted graph payload for session: ${session.meta.sessionId}`);
                return null;
            }

            logger.info(`[DreamService] Successfully extracted ${payload.nodes.length} nodes and ${payload.edges.length} edges for session ${session.meta.sessionId}.`);

            // Sub-Epic 3C: Bridge to knowledge-base GraphService (SQLite)
            for (const node of payload.nodes) {
                GraphService.upsertNode({
                    id: node.id,
                    type: node.type || 'Unknown',
                    name: node.name || 'Unknown',
                    description: node.description || '',
                    semanticVectorId: null // Can be populated later by vector syncing logic
                });
            }

            for (const edge of payload.edges) {
                GraphService.linkNodes(
                    edge.source,
                    edge.target,
                    edge.relationship || 'RELATED_TO',
                    edge.weight !== undefined ? parseFloat(edge.weight) : 1.0
                );
            }

            logger.info(`[DreamService] Graph entities committed to Neocortex for session ${session.meta.sessionId}.`);

            return payload;

        } catch (error) {
            logger.error('[DreamService] Error during graph extraction run:', error);
            return null;
        }
    }
}

export default Neo.setupClass(DreamService);
