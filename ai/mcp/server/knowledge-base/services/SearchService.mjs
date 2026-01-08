import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import fs                   from 'fs-extra';
import logger               from '../logger.mjs';
import QueryService         from './QueryService.mjs';

/**
 * @summary Orchestrates Retrieval-Augmented Generation (RAG) by combining semantic search with LLM synthesis.
 *
 * This service acts as the bridge between the user's natural language question and the project's knowledge base.
 * Instead of simply returning a list of files, it:
 * 1.  **Retrieves**: Uses `QueryService` to find the most relevant files based on semantic similarity and intelligent scoring (boosting guides, architectural docs).
 * 2.  **Reads**: Fetches the full content of these files from the local filesystem to ensure the LLM has complete context (avoiding truncated metadata).
 * 3.  **Synthesizes**: Sends the query and the file contents to the Google Gemini model to generate a precise, grounded answer.
 *
 * This "Read-Eval-Generate" loop allows agents to ask complex questions like "How do I implement a Store?" and get a
 * code-complete answer without manually searching and reading multiple files.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.SearchService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.knowledge-base.services.QueryService
 */
class SearchService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.SearchService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.SearchService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {Object|null} embeddingModel=null
     * @protected
     */
    embeddingModel = null
    /**
     * @member {Object|null} model=null
     * @protected
     */
    model = null

    /**
     * Initializes the Gemini AI models.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY) {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            this.model          = genAI.getGenerativeModel({model: aiConfig.modelName});
            this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
        }
    }

    /**
     * Ensures the service dependencies are ready.
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }

    /**
     * Performs a semantic search via QueryService and synthesizes an answer using the LLM.
     *
     * @param {Object} params
     * @param {String} params.query The natural language query.
     * @param {String} [params.type='all'] Optional content type filter (e.g., 'guide', 'src').
     * @param {Number} [params.limit=5] Number of source files to include in the context.
     * @returns {Promise<Object>} The synthesized answer and references.
     */
    async ask({query, type = 'all', limit = 5}) {
        if (!this.model) {
            throw new Error('GEMINI_API_KEY is required for RAG features.');
        }

        logger.info(`[SearchService] Processing RAG query: "${query}" (Type: ${type})`);

        // 1. Retrieve most relevant files using QueryService's scoring logic
        const queryResult = await QueryService.queryDocuments({query, type, limit});

        if (queryResult.message || !queryResult.results || queryResult.results.length === 0) {
            return {
                answer    : "No relevant documents found in the knowledge base.",
                references: []
            };
        }

        const references = queryResult.results.map(r => ({
            name  : r.source.split('/').pop(),
            source: r.source,
            score : Number(r.score)
        }));

        // 2. Read file contents for context
        const contextPromises = references.map(async (ref, index) => {
            let content = '';

            if (ref.source && await fs.pathExists(ref.source)) {
                try {
                    content = await fs.readFile(ref.source, 'utf8');
                } catch (err) {
                    logger.warn(`[SearchService] Failed to read file ${ref.source}:`, err.message);
                }
            }

            if (!content) {
                content = 'No Content (File missing or empty)';
            }

            return `--- DOCUMENT ${index + 1} (${ref.name} from ${ref.source}) ---\n${content}`;
        });

        const contextDocs = (await Promise.all(contextPromises)).join('\n\n');

        const prompt = `
You are an expert Neo.mjs architect. 
**CRITICAL INSTRUCTION:** The framework is named "Neo.mjs". Never refer to it as "Neo.js".

Answer the following question using **ONLY** the provided context documents.
If the answer cannot be found in the documents, state that you don't have enough information.

Question: ${query}

Context:
${contextDocs}

Instructions:
1. Synthesize a clear, concise answer.
2. Cite specific classes or files from the context where appropriate.
3. Do not make up code or facts not present in the text.
4. Adhere to the terminology: "Neo.mjs", "App Worker", "VDom Worker", "config system".
`;

        // 3. Generate Answer
        const result = await this.model.generateContent(prompt);
        const answer = result.response.text();

        return {
            answer,
            references
        };
    }
}

export default Neo.setupClass(SearchService);
