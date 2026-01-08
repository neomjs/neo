import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import fs                   from 'fs-extra';
import logger               from '../logger.mjs';

/**
 * @summary Service for performing semantic search and RAG-based summarization.
 * @class Neo.ai.mcp.server.knowledge-base.services.SearchService
 * @extends Neo.core.Base
 * @singleton
 */
class SearchService extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.knowledge-base.services.SearchService',
        singleton: true,
        embeddingModel_: null,
        model_: null
    }

    construct(config) {
        super.construct(config);

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (GEMINI_API_KEY) {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            this.model = genAI.getGenerativeModel({model: aiConfig.modelName});
            this.embeddingModel = genAI.getGenerativeModel({model: aiConfig.embeddingModel});
        }
    }

    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }

    /**
     * Performs a semantic search and synthesizes an answer using the LLM.
     * @param {Object} params
     * @param {String} params.query The natural language query.
     * @param {Number} [params.limit=5] Number of results to use for context.
     * @returns {Promise<Object>} The synthesized answer and references.
     */
    async ask({query, limit = 5}) {
        if (!this.model) {
            throw new Error('GEMINI_API_KEY is required for RAG features.');
        }

        logger.info(`[SearchService] Processing RAG query: "${query}"`);

        // 1. Generate Embedding for Query
        const embeddingResult = await this.embeddingModel.embedContent(query);
        const queryEmbedding = embeddingResult.embedding.values;

        // 2. Query ChromaDB
        const collection = await ChromaManager.getKnowledgeBaseCollection();
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit,
            include: ['documents', 'metadatas', 'distances']
        });

        if (!results.documents[0] || results.documents[0].length === 0) {
            return {
                answer: "No relevant documents found in the knowledge base.",
                references: []
            };
        }

        // 3. Construct Context (Read from Files)
        const contextPromises = results.metadatas[0].map(async (meta, index) => {
            const source = meta.source;
            const name   = meta.name || 'Unknown Name';
            const doc    = results.documents[0][index];
            let content  = '';

            if (source && await fs.pathExists(source)) {
                try {
                    content = await fs.readFile(source, 'utf8');
                    // Optional: Truncate really large files? 
                    // For now, let's assume reasonable sizes or rely on model context window.
                } catch (err) {
                    logger.warn(`[SearchService] Failed to read file ${source}:`, err.message);
                }
            }
            
            // Fallback to metadata content if file read failed or yielded empty
            if (!content) {
                content = doc || meta.content || meta.description || 'No Content';
            }

            return `--- DOCUMENT ${index + 1} (${name} from ${source}) ---\n${content}`;
        });

        const contextDocs = (await Promise.all(contextPromises)).join('\n\n');

        const prompt = `
You are an expert Neo.mjs architect. Answer the following question using ONLY the provided context documents.
If the answer cannot be found in the documents, state that you don't have enough information.

Question: ${query}

Context:
${contextDocs}

Instructions:
1. Synthesize a clear, concise answer.
2. Cite specific classes or files from the context where appropriate.
3. Do not make up code or facts not present in the text.
`;

        // 4. Generate Answer
        const result = await this.model.generateContent(prompt);
        const answer = result.response.text();

        // 5. Format References
        const references = results.metadatas[0].map((meta, index) => ({
            name: meta.name,
            source: meta.source,
            score: results.distances[0][index]
        }));

        return {
            answer,
            references
        };
    }
}

export default Neo.setupClass(SearchService);
