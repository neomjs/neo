import aiConfig           from '../config.mjs';
import Base               from '../../../../../src/core/Base.mjs';
import ChromaManager      from './ChromaManager.mjs';
import VectorService      from './VectorService.mjs';
import ApiSource          from '../source/ApiSource.mjs';
import ConceptSource      from '../source/ConceptSource.mjs';
import DiscussionSource   from '../source/DiscussionSource.mjs';
import LearningSource     from '../source/LearningSource.mjs';
import PullRequestSource  from '../source/PullRequestSource.mjs';
import ReleaseNotesSource from '../source/ReleaseNotesSource.mjs';
import TestSource         from '../source/TestSource.mjs';
import TicketSource       from '../source/TicketSource.mjs';
import crypto             from 'crypto';
import dotenv             from 'dotenv';
import fs                 from 'fs-extra';
import logger             from '../logger.mjs';
import path               from 'path';

const cwd       = aiConfig.neoRootDir;
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;

dotenv.config({
    path: insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
    quiet: true
});

/**
 * @summary Core engine for building and maintaining the AI's knowledge base.
 *
 * This service is the core engine for building and maintaining the AI's knowledge base.
 * It orchestrates the entire ETL (Extract, Transform, Load) process for knowledge and
 * ensures the database is synchronized on application startup.
 *
 * ### Key Responsibilities:
 * 1.  **Autonomous Startup:** On initialization, it automatically checks if the knowledge base
 *     is synchronized with the source files and runs the necessary embedding or creation
 *     processes to bring it up-to-date.
 * 2.  **ETL Pipeline:**
 *     - **Extract:** Reads from diverse source-of-truth files (`createKnowledgeBase`).
 *     - **Transform:** Parses and structures data into a unified JSONL format.
 *     - **Load:** Delegates embedding and vector storage to `VectorService`.
 * 3.  **Lifecycle Management:** Provides methods for the full lifecycle of the knowledge base,
 *     from creation and synchronization to deletion.
 * 4.  **Backup Surface:** Exposes `manageDatabaseBackup({action: 'export'})` as a peer to
 *     `Memory_DatabaseService.manageDatabaseBackup`, reached via the `ai/services.mjs` SDK
 *     boundary. Deliberately NOT registered as an MCP tool in `toolService.mjs` — the
 *     `npm run ai:backup` script-over-tool path protects the ~80-tool MCP budget (see
 *     #9903 precedent, #10132 for retirement rationale). `makeSafe` no-match passthrough
 *     forwards raw args through the SDK when no openapi operation is registered.
 *     Non-destructive — captures the current ChromaDB collection state as JSONL for
 *     consumption by the canonical backup orchestrator (`buildScripts/ai/backup.mjs`),
 *     without triggering sync, re-embedding, or compaction. See #10129 for the
 *     atomic-bundle substrate design.
 *
 * @class Neo.ai.mcp.server.knowledge-base.services.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Creates a SHA-256 hash from a stable JSON string representation of a chunk's content.
     * This hash is used to detect changes in content without having to compare the full text.
     * @param {Object} chunk The chunk object.
     * @returns {String} The hexadecimal hash string.
     * @private
     */
    createContentHash(chunk) {
        const contentString = JSON.stringify({
            type       : chunk.type,
            name       : chunk.name,
            description: chunk.description,
            content    : chunk.content,
            extends    : chunk.extends,
            configType : chunk.configType,
            params     : chunk.params,
            returns    : chunk.returns
        });
        return crypto.createHash('sha256').update(contentString).digest('hex');
    }

    /**
     * @summary Exports the Knowledge Base ChromaDB collection as JSONL.
     *
     * Peer-symmetric with `Memory_DatabaseService.exportDatabase`. Called by the canonical
     * backup orchestrator (`buildScripts/ai/backup.mjs`) to populate the `kb/` subfolder
     * of an atomic timestamped bundle, or invoked standalone for ad-hoc KB snapshots.
     * Non-destructive: reads the current collection state without triggering sync, re-embed,
     * or compaction. See #10129 for bundle layout.
     *
     * @param {Object}  options
     * @param {String} [options.backupPath=aiConfig.backupPath] Directory for the JSONL artifact.
     * @returns {Promise<{message: String}>}
     */
    async exportDatabase({backupPath = aiConfig.backupPath} = {}) {
        try {
            logger.log('Starting knowledge base export...');
            const collection = await ChromaManager.getKnowledgeBaseCollection();
            const count      = await this.#exportCollection(collection, backupPath, 'knowledge-base-backup');
            return {message: `Export complete. Exported ${count} knowledge base chunks.`};
        } catch (error) {
            logger.error('[DatabaseService] Error exporting knowledge base:', error);
            const exportError = new Error(`DATABASE_EXPORT_ERROR: ${error.message}`);
            exportError.code  = 'DATABASE_EXPORT_ERROR';
            throw exportError;
        }
    }

    /**
     * Helper method to stream a ChromaDB collection into a timestamped JSONL artifact.
     * Mirror of `Memory_DatabaseService#exportCollection` — duplicated deliberately to keep
     * each MCP service's backup logic locally discoverable (see #10129 Phase 3: peer scripts,
     * not delegation). Pagination cap + surgical per-id rescue mode make this robust against
     * partially corrupted HNSW segments.
     *
     * @param {Object} collection The ChromaDB collection to export.
     * @param {String} backupPath The directory to save the backup file.
     * @param {String} filePrefix The prefix for the backup filename.
     * @returns {Promise<Number>} The number of exported documents.
     * @private
     */
    async #exportCollection(collection, backupPath, filePrefix) {
        logger.log(`Fetching all documents from "${collection.name}"...`);

        const count = await collection.count();
        if (count === 0) {
            logger.log(`No documents found in ${collection.name} to export.`);
            return 0;
        }

        logger.log(`Found ${count} documents in ${collection.name} to export.`);

        await fs.ensureDir(backupPath);
        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        const limit = 2000;
        let offset  = 0;

        while (offset < count) {
            logger.log(`Fetching batch: ${offset} to ${Math.min(offset + limit, count)} of ${count}`);

            let batch;
            try {
                batch = await collection.get({
                    include: ['documents', 'embeddings', 'metadatas'],
                    limit,
                    offset
                });
            } catch (batchErr) {
                logger.log(`Batch ${offset} fetch failed: ${batchErr.message}. Initiating surgical 1-by-1 rescue mode...`);

                const idBatch = await collection.get({include: [], limit, offset});

                batch = {ids: [], metadatas: [], documents: [], embeddings: []};

                for (const id of idBatch.ids) {
                    try {
                        const single = await collection.get({
                            ids    : [id],
                            include: ['documents', 'embeddings', 'metadatas']
                        });

                        if (single.ids?.length > 0) {
                            batch.ids.push(single.ids[0]);
                            batch.documents.push(single.documents[0]);
                            batch.metadatas.push(single.metadatas[0]);
                            batch.embeddings.push(single.embeddings[0]);
                        }
                    } catch (singleErr) {
                        logger.error(`Skipping corrupted vector ID during export: ${id}`);
                    }
                }
            }

            if (!batch.ids || batch.ids.length === 0) break;

            for (let i = 0; i < batch.ids.length; i++) {
                const record = {
                    id       : batch.ids[i],
                    embedding: batch.embeddings[i],
                    metadata : batch.metadatas[i],
                    document : batch.documents[i]
                };
                writeStream.write(JSON.stringify(record) + '\n');
            }

            offset += limit;
        }

        await new Promise(resolve => writeStream.end(resolve));
        logger.log(`Successfully exported ${count} documents to: ${backupFile}`);
        return count;
    }

    /**
     * @summary Dispatcher for knowledge-base backup operations — peer of `Memory_DatabaseService.manageDatabaseBackup`.
     *
     * Reached exclusively via the `ai/services.mjs` SDK — deliberately NOT registered as an
     * MCP tool in `toolService.mjs` serviceMapping (script-over-tool per #9903 precedent, to
     * protect the ~80-tool MCP budget against the 100-tool harness cap; see #10132 for the
     * full retirement rationale). `makeSafe` no-match passthrough forwards raw args through
     * when no matching openapi operation is found, so `backup.mjs` can invoke this dispatcher
     * with `{action, backupPath}` without a Zod schema. The manual throw below is the actual
     * rejection path for invalid actions.
     *
     * Currently supports `action: 'export'` only. Import + truncate are out-of-scope per
     * #10129 (restore tooling is a separate ticket).
     *
     * @param {Object}  options
     * @param {String}  options.action       The action to perform. Currently 'export'.
     * @param {String} [options.backupPath]  Forwarded to `exportDatabase` when action is 'export'.
     * @returns {Promise<Object>}
     */
    async manageDatabaseBackup({action, ...config}) {
        if (action === 'export') {
            return this.exportDatabase(config);
        }

        throw new Error(
            `Unknown action: ${action}. KB backup currently supports 'export' only; ` +
            `'import' and 'truncate' are deferred to follow-up tickets (see #10129 Out of Scope: Restore tooling).`
        );
    }

    /**
     * Manages knowledge base data operations based on the provided action.
     * @param {Object}  params
     * @param {String}  params.action     'sync', 'create', 'embed', or 'delete'
     * @param {Boolean} [params.viaMcp]   True when dispatched from the MCP toolService
     *                                    wrapper; threaded through to `embed()` to enable
     *                                    the work-volume gate (#10572). CLI callers
     *                                    omit this and bypass the gate.
     * @returns {Promise<Object>}
     */
    async manageKnowledgeBase({action, viaMcp = false}) {
        switch (action) {
            case 'sync':
                return this.syncDatabase({viaMcp});
            case 'create':
                return this.createKnowledgeBase();
            case 'embed':
                return this.embedKnowledgeBase({viaMcp});
            case 'delete':
                return this.deleteDatabase();
            default:
                throw new Error(`Invalid action: ${action}. Must be 'sync', 'create', 'embed', or 'delete'.`);
        }
    }

    /**
     * Parses all knowledge sources (JSDoc, guides, release notes, tickets) and generates
     * a structured JSONL file at `dist/ai-knowledge-base.jsonl`.
     *
     * This function acts as the "compiler" for the knowledge base. Its primary role is to
     * read from various source-of-truth files and convert them into a unified, structured format.
     * It uses a write stream to handle potentially large amounts of data efficiently without
     * holding everything in memory at once.
     *
     * ### Key Characteristics:
     * - **Input:** Reads from `docs/output/all.json` for API data and `learn/tree.json` for the guide structure.
     * - **Processing:** It breaks down the content into logical "chunks" (e.g., a class, a method, a section of a guide).
     * - **Output:** It streams each chunk as a JSON object into the `dist/ai-knowledge-base.jsonl` file.
     *
     * @returns {Promise<object>} A promise that resolves to a success message with the total chunk count.
     */
    async createKnowledgeBase() {
        logger.log('Starting knowledge base file creation...');
        const outputPath = aiConfig.dataPath;
        await fs.ensureDir(path.dirname(outputPath));
        const writeStream = fs.createWriteStream(outputPath);
        let totalChunks   = 0;

        const sources = [
            ApiSource,
            ConceptSource,
            DiscussionSource,
            LearningSource,
            PullRequestSource,
            ReleaseNotesSource,
            TicketSource,
            TestSource
        ];

        const createHashFn = this.createContentHash.bind(this);

        for (const source of sources) {
            const sourceName = source.className.split('.').pop();
            logger.log(`Extracting knowledge from ${sourceName}...`);
            totalChunks += await source.extract(writeStream, createHashFn);
        }

        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                const message = `Knowledge base file created with ${totalChunks} chunks.`;
                logger.log(message);
                resolve({message});
            });
            writeStream.on('error', reject);
            writeStream.end();
        });
    }

    /**
     * Permanently deletes the entire knowledge base collection from ChromaDB.
     * Delegates to VectorService.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteDatabase() {
        return await VectorService.deleteCollection();
    }

    /**
     * Reads the generated JSONL file and upserts the data into the ChromaDB collection.
     * Delegates to VectorService.
     * @param {Object}  [opts]
     * @param {Boolean} [opts.viaMcp=false] True when invoked via MCP tool dispatch;
     *                                      threaded to VectorService.embed for #10572's
     *                                      work-volume gate.
     * @returns {Promise<object>} A promise that resolves to a success message, OR a
     *     `{error, code: 'KB_SYNC_VOLUME_EXCEEDED', ...}` shape when the MCP gate fires.
     */
    async embedKnowledgeBase({viaMcp = false} = {}) {
        return await VectorService.embed(aiConfig.dataPath, {viaMcp});
    }

    /**
     * Orchestrates the automated startup synchronization of the knowledge base.
     *
     * This method is called automatically by the framework after the service is constructed.
     * It ensures that the knowledge base is ready and up-to-date before the application
     * proceeds.
     *
     * The logic is as follows:
     * 1. It first waits for the underlying database connection to be ready.
     * 2. It then checks for the existence of the `ai-knowledge-base.jsonl` file.
     * 3. If the file does not exist, it triggers a full `syncDatabase()` (create + embed).
     * 4. If the file exists, it triggers `embedKnowledgeBase()` to process any new or changed content.
     *
     * This entire process is awaited via the `ready()` promise on the service, ensuring
     * that dependent services or startup sequences only proceed once the knowledge base is
     * fully initialized.
     * @protected
     */
    async initAsync() {
        await super.initAsync();

        // Wait for ChromaManager (which waits for LifecycleService) to be ready
        await ChromaManager.ready();

        logger.info('[Startup] Checking knowledge base status...');

        try {
            if (aiConfig.data.autoSync) {
                logger.info('[Startup] Starting full synchronization (Create + Embed)...');
                await this.syncDatabase();
                logger.info('✅ [Startup] Full synchronization complete.');
            }
        } catch (error) {
            logger.warn('⚠️  [Startup] Knowledge base synchronization/embedding failed:', error.message);
        }
    }

    /**
     * A convenience orchestrator that runs the entire knowledge base synchronization process.
     * It first creates the knowledge base file and then embeds its contents into the vector database.
     * This provides a simple, single-command way to update the knowledge base from scratch.
     * @param {Object}  [opts]
     * @param {Boolean} [opts.viaMcp=false] True when invoked via MCP tool dispatch;
     *                                      threaded to embed() for #10572's work-volume gate.
     * @returns {Promise<object>} A promise that resolves to the final success message from the embedding step.
     */
    async syncDatabase({viaMcp = false} = {}) {
        logger.log('Starting full database synchronization...');
        await this.createKnowledgeBase();
        return await this.embedKnowledgeBase({viaMcp});
    }
}

export default Neo.setupClass(DatabaseService);
