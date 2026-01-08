import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
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
     * @param {String} query The natural language query.
     * @param {Number} [limit=5] Number of results to use for context.
     * @returns {Promise<Object>} The synthesized answer and references.
     */
    async ask(query, limit = 5) {
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

        // 3. Construct Context
        const contextDocs = results.documents[0].map((doc, index) => {
            const meta = results.metadatas[0][index];
            const source = meta.source || 'Unknown Source';
            const name = meta.name || 'Unknown Name';
            return `--- DOCUMENT ${index + 1} (${name} from ${source}) ---
${doc}`;
        }).join('\n\n');

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
