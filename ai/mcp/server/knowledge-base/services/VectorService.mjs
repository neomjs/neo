import aiConfig                  from '../config.mjs';
import TextEmbeddingService      from '../../memory-core/services/TextEmbeddingService.mjs';
import mcConfig                  from '../../memory-core/config.mjs';
import Base                      from '../../../../../src/core/Base.mjs';
import ChromaManager             from './ChromaManager.mjs';
import fs                        from 'fs-extra';
import logger                    from '../logger.mjs';
import path                      from 'path';
import readline                  from 'readline';
import DestructiveOperationGuard from '../../shared/services/DestructiveOperationGuard.mjs';

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
     * @param {Object}       [options]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteCollection({confirmation} = {}) {
        const collectionName = aiConfig.collectionName;
        try {
            await DestructiveOperationGuard.assertDestructiveTargetAllowed({
                operation: 'knowledge-base.chroma.delete',
                subsystem: 'knowledge-base',
                mode     : 'delete',
                target   : {
                    collectionName,
                    chroma: {
                        host: aiConfig.host,
                        port: aiConfig.port,
                        path: aiConfig.path
                    },
                    path    : aiConfig.path,
                    repoRoot: aiConfig.neoRootDir
                },
                confirmation
            });

            await ChromaManager.client.deleteCollection({name: collectionName});
            ChromaManager._knowledgeBaseCollectionPromise = null;
            ChromaManager.knowledgeBaseCollection = null;
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
     *
     * **Work-volume gate (#10572):** when invoked via MCP (`viaMcp: true`), refuses
     * synchronous execution if `chunksToProcess.length` exceeds `aiConfig.mcpSyncMaxChunks`
     * (default 50, aligned with `batchSize`). Returns a structured `{error, code, ...}`
     * payload that the MCP server's `Server.mjs` converts to `isError: true` per its
     * existing `'error' in result` contract. CLI invocations (via `npm run ai:sync-kb`)
     * pass `viaMcp: false` and bypass the gate — explicit opt-in to long-running work.
     *
     * @param {String}  knowledgeBasePath          The path to the JSONL source file.
     * @param {Object}  [opts]                     Optional invocation context.
     * @param {Boolean} [opts.viaMcp=false]        True when called via MCP tool dispatch;
     *                                             enables the work-volume gate.
     * @returns {Promise<object>} A promise that resolves to a success message, OR a
     *     `{error, code: 'KB_SYNC_VOLUME_EXCEEDED', ...}` shape when the MCP gate fires.
     * @see #10572
     */
    async embed(knowledgeBasePath, {viaMcp = false} = {}) {
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

        // Work-volume gate (#10572): refuse synchronous embedding via MCP when the
        // post-delta queue exceeds the configured threshold. The threshold default
        // matches `batchSize` (one batch is the floor for "small enough to run
        // synchronously"); real latency is provider/tier/retry-state-dependent so
        // the threshold is empirically tunable rather than timing-derived.
        // CLI invocations pass viaMcp: false and bypass.
        const mcpThreshold = aiConfig.mcpSyncMaxChunks ?? 50;
        if (viaMcp && chunksToProcess.length > mcpThreshold) {
            // Defensive log-path resolution mirrors logger.mjs's lazy resolution — keeps
            // the refusal message coherent even on existing gitignored config.mjs deployments
            // that pre-date the `logPath` template key. Without the fallback, the rendered
            // message would carry `undefined/kb-server-...`.
            const logDir = aiConfig.logPath || `${aiConfig.neoRootDir}/.neo-ai-data/logs`;
            const errorPayload = {
                error  : `KB sync work volume exceeds MCP-callable threshold`,
                message: `${chunksToProcess.length} chunks need re-embedding (threshold: ${mcpThreshold}). ` +
                         `Synchronous embedding at this volume risks agent freeze. ` +
                         `Run via CLI: \`npm run ai:sync-kb\`. ` +
                         `Tail progress: \`tail -f ${logDir}/kb-server-$(date +%Y-%m-%d).log\`.`,
                code           : 'KB_SYNC_VOLUME_EXCEEDED',
                chunksToProcess: chunksToProcess.length,
                threshold      : mcpThreshold
            };
            logger.warn(`[VectorService] ${errorPayload.error}: ${errorPayload.message}`);
            return errorPayload;
        }

        logger.log(`Using TextEmbeddingService with provider: ${mcConfig.embeddingProvider}.`);

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
                    const embeddings = await TextEmbeddingService.embedTexts(textsToEmbed, mcConfig.embeddingProvider);

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
