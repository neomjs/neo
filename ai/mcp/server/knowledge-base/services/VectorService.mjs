import {GoogleGenerativeAI} from '@google/generative-ai';
import aiConfig             from '../config.mjs';
import Base                 from '../../../../../src/core/Base.mjs';
import ChromaManager        from './ChromaManager.mjs';
import fs                   from 'fs-extra';
import logger               from '../logger.mjs';
import path                 from 'path';
import readline             from 'readline';

/**
 * @summary Manages vector database operations including embedding generation and storage.
 *
 * This service encapsulates all interactions with the vector database (ChromaDB) and the
 * embedding provider (Google Generative AI). It is responsible for the "Load" phase of the
 * ETL pipeline, taking structured knowledge chunks and ensuring they are correctly
 * vectorized and stored.
 *
 * **Helper Role:**
 * This service is primarily a helper for `DatabaseService` and is not intended to be
 * directly exposed as MCP tools. Its methods are invoked by `DatabaseService` as part
 * of higher-level orchestration workflows.
 *
 * ### Key Responsibilities:
 * 1.  **Embedding Generation:** Interacts with the Google Generative AI API to generate
 *     text embeddings for knowledge chunks.
 * 2.  **Vector Storage:** Manages the ChromaDB collection, including upserting new/changed
 *     documents and removing stale ones.
 * 3.  **Data Enrichment:** Pre-calculates class inheritance chains to improve query context.
 * 4.  **Diffing:** Optimizes API usage by only processing chunks that have changed since
 *     the last run.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.VectorService
 * @extends Neo.core.Base
 * @singleton
 */
class VectorService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.VectorService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.VectorService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Permanently deletes the knowledge base collection.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteCollection() {
        const collectionName = aiConfig.collectionName;
        try {
            await ChromaManager.client.deleteCollection({name: collectionName});
            const message = `Knowledge base collection '${collectionName}' deleted successfully.`;
            logger.log(message);
            return {message};
        } catch (error) {
            if (error.message.includes(`Collection ${collectionName} does not exist.`)) {
                const message = `Knowledge base collection '${collectionName}' did not exist. No action taken.`;
                logger.log(message);
                return {message};
            }
            throw error;
        }
    }

    /**
     * Reads a JSONL file, enriches data, generates embeddings, and updates ChromaDB.
     * @param {String} knowledgeBasePath The path to the JSONL source file.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async embed(knowledgeBasePath) {
        logger.log('Starting knowledge base embedding...');

        if (!await fs.pathExists(knowledgeBasePath)) {
            throw new Error(`Knowledge base file not found at ${knowledgeBasePath}.`);
        }

        const knowledgeBase = [];
        const fileStream    = fs.createReadStream(knowledgeBasePath);
        const rl            = readline.createInterface({input: fileStream, crlfDelay: Infinity});

        for await (const line of rl) {
            knowledgeBase.push(JSON.parse(line));
        }
        logger.log(`Loaded ${knowledgeBase.length} knowledge chunks from file.`);

        // Enrich with inheritance chains
        const classNameToDataMap = {};
        knowledgeBase.forEach(chunk => {
            if (chunk.kind === 'module-context' && chunk.className) {
                classNameToDataMap[chunk.className] = {
                    source : chunk.source,
                    parent : chunk.extends || null
                };
            }
        });

        knowledgeBase.forEach(chunk => {
            let currentClass = chunk.className; // Metadata is now on every chunk
            const inheritanceChain = [];
            const visited = new Set();
            
            // If no className metadata (e.g. non-class files), skip
            if (!currentClass) return;

            while (currentClass && classNameToDataMap[currentClass]?.parent && !visited.has(currentClass)) {
                visited.add(currentClass);
                const parentClassName = classNameToDataMap[currentClass].parent;
                const parentData      = classNameToDataMap[parentClassName];
                if (parentData) {
                    inheritanceChain.push({ className: parentClassName, source: parentData.source });
                }
                currentClass = parentClassName;
            }
            chunk.inheritanceChain = inheritanceChain;
        });

        const collection = await ChromaManager.getKnowledgeBaseCollection();
        logger.log(`Using collection: ${collection.name}`);

        logger.log('Fetching existing documents from ChromaDB...');
        const existingIds = new Set();
        let offset = 0;
        const limit = 2000;
        let batch;

        // ChromaDB has a default limit (usually 10) if not specified.
        // Even with a larger limit, it's safer to paginate for large collections.
        do {
            batch = await collection.get({
                include: [],
                limit: limit,
                offset: offset
            });

            batch.ids.forEach(id => existingIds.add(id));
            offset += limit;
            logger.log(`Fetched ${existingIds.size} IDs so far...`);
        } while (batch.ids.length === limit);

        logger.log(`Found ${existingIds.size} existing documents.`);

        const chunksToProcess = [];
        const allIds          = new Set();
        const processedIds    = new Set();

        knowledgeBase.forEach(chunk => {
            const chunkId = chunk.hash;
            allIds.add(chunkId);

            if (!existingIds.has(chunkId) && !processedIds.has(chunkId)) {
                chunksToProcess.push({ ...chunk, id: chunkId });
                processedIds.add(chunkId);
            }
        });

        // Convert existingIds Set to Array for filtering, as existingDocs object is no longer available
        const existingIdsArray = Array.from(existingIds);
        const idsToDelete      = existingIdsArray.filter(id => !allIds.has(id));

        logger.log(`${chunksToProcess.length} chunks to add or update.`);
        logger.log(`${idsToDelete.length} chunks to delete.`);

        if (idsToDelete.length > 0) {
            await collection.delete({ ids: idsToDelete });
            logger.log(`Deleted ${idsToDelete.length} stale chunks.`);
        }

        if (chunksToProcess.length === 0) {
            const message = 'No changes detected. Knowledge base is up to date.';
            logger.log(message);
            return {message};
        }

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error('The GEMINI_API_KEY environment variable is not set.');

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: aiConfig.embeddingModel });
        logger.log(`Initialized Google AI embedding model: ${aiConfig.embeddingModel}.`);

        logger.log('Embedding chunks...');
        const {batchSize, batchDelay, maxRetries} = aiConfig;

        for (let i = 0; i < chunksToProcess.length; i += batchSize) {
            if (i > 0 && batchDelay) {
                await this.timeout(batchDelay);
            }

            const batch = chunksToProcess.slice(i, i + batchSize);
            const textsToEmbed = batch.map(chunk => `${chunk.type}: ${chunk.name} in ${chunk.className || ''}\n${chunk.description || chunk.content || ''}`);

            let retries = 0;
            let success = false;

            while (retries < maxRetries && !success) {
                try {
                    const result = await model.batchEmbedContents({
                        requests: textsToEmbed.map(text => ({model: aiConfig.embeddingModel, content: {parts: [{text}]}}))
                    });
                    const embeddings = result.embeddings.map(e => e.values);

                    const metadatas = batch.map(chunk => {
                        const metadata = {};
                        for (const [key, value] of Object.entries(chunk)) {
                            metadata[key] = (value === null) ? 'null' : (typeof value === 'object') ? JSON.stringify(value) : value;
                        }
                        return metadata;
                    });

                    await collection.upsert({
                        ids: batch.map(chunk => chunk.id),
                        embeddings,
                        metadatas
                    });
                    logger.log(`Processed and embedded batch ${i / batchSize + 1} of ${Math.ceil(chunksToProcess.length / batchSize)}`);
                    success = true;
                } catch (err) {
                    retries++;
                    console.error(`An error occurred during embedding batch ${i / batchSize + 1}. Retrying (${retries}/${maxRetries})...`, err.message);
                    if (retries < maxRetries) {
                        await new Promise(res => setTimeout(res, 2 ** retries * 1000)); // Exponential backoff
                    } else {
                        throw new Error(`Failed to process batch ${i / batchSize + 1} after ${maxRetries} retries. Aborting.`);
                    }
                }
            }
        }

        const count   = await collection.count();
        const message = `Embedding complete. Collection now contains ${count} items.`;
        logger.log(message);
        return {message};
    }

    /**
     * Orchestrates the startup logic.
     * Ensures dependent services are ready before this service is considered ready.
     * @protected
     */
    async initAsync() {
        await super.initAsync();
        await ChromaManager.ready();
    }
}

export default Neo.setupClass(VectorService);
