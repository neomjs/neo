import aiConfig                        from '../../mcp/server/knowledge-base/config.mjs';
import {partitionRowsByVectorValidity} from '../memory-core/helpers/vectorWriteInvariant.mjs';
import {validateJsonlSourceFile}       from '../memory-core/helpers/vectorJsonlSourceValidation.mjs';
import Base                            from '../../../src/core/Base.mjs';
import ChromaManager                   from './ChromaManager.mjs';
import DestructiveOperationGuard       from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';
import VectorService                   from './VectorService.mjs';
// SourceRegistry owns KB source discovery. Importing `./source/_export.mjs` triggers
// auto-registration of Neo's default Source classes when `aiConfig.useDefaultSources !== false`,
// plus declarative `aiConfig.customSources` entries.
import SourceRegistry from './source/_export.mjs';
import crypto         from 'crypto';
import dotenv         from 'dotenv';
import fs             from 'fs-extra';
import logger         from '../../mcp/server/knowledge-base/logger.mjs';
import path           from 'path';
import readline       from 'readline';

const cwd       = aiConfig.neoRootDir;
const insideNeo = process.env.npm_package_name?.includes('neo.mjs') ?? false;

dotenv.config({
    path : insideNeo ? path.resolve(cwd, '.env') : path.resolve(cwd, '../../.env'),
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
 *     `npm run ai:backup` script-over-tool path protects the MCP tool budget. `makeSafe`
 *     no-match passthrough forwards raw args through the SDK when no openapi operation is
 *     registered.
 *     Non-destructive — captures the current ChromaDB collection state as JSONL for
 *     consumption by the canonical backup orchestrator (`ai/scripts/maintenance/backup.mjs`),
 *     without triggering sync, re-embedding, or compaction.
 *
 * @class Neo.ai.services.knowledge-base.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Creates a SHA-256 hash from a stable JSON string representation of a chunk's content
     * and source identity tuple. This hash is used to detect changes in content without
     * having to compare the full text, while keeping byte-identical chunks from different
     * tenants or repositories collision-safe.
     * @param {Object} chunk The chunk object.
     * @returns {String} The hexadecimal hash string.
     * @private
     */
    createContentHash(chunk) {
        // Prefer the nested tenant-shape only when it exposes a tenant field; Tier-1's inherited
        // `knowledgeBase` ops leaf is not one (see VectorService.getTenantIsolationConfig).
        // A wrong surface here would corrupt content-hash tenant collision-safety.
        const nestedKb = aiConfig.knowledgeBase;
        const kbConfig = (nestedKb != null && (
            nestedKb.defaultTenantId   !== undefined ||
            nestedKb.defaultRepoSlug   !== undefined ||
            nestedKb.defaultVisibility !== undefined
        )) ? nestedKb : aiConfig;
        const contentString = JSON.stringify({
            tenantId   : chunk.tenantId ?? kbConfig.defaultTenantId,
            repoSlug   : chunk.repoSlug ?? kbConfig.defaultRepoSlug,
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
     * backup orchestrator (`ai/scripts/maintenance/backup.mjs`) to populate the `kb/` subfolder
     * of an atomic timestamped bundle, or invoked standalone for ad-hoc KB snapshots.
     * Non-destructive: reads the current collection state without triggering sync, re-embed,
     * or compaction.
     *
     * @param {Object}  options
     * @param {String} [options.backupPath=aiConfig.backupPath] Directory for the JSONL artifact.
     * @returns {Promise<{message: String, count: Number, collectionId: String|null}>} `count` is the
     *          numeric export row count, consumed by the backup orchestrator's `verifyBundleIntegrity`
     *          for KB row-count parity (without it the verifier reads a non-numeric source count and
     *          skips KB parity). `collectionId` is the source's identity at capture time — the axis
     *          that lets a `count: 0` receipt distinguish "this source was empty" from "a different
     *          source is here now"; `null` degrades that axis to `unknown` rather than asserting
     *          continuity. See `ai/services/shared/captureReceipt.mjs`.
     */
    async exportDatabase({backupPath = aiConfig.backupPath} = {}) {
        try {
            logger.log('Starting knowledge base export...');
            const collection = await ChromaManager.getKnowledgeBaseCollection();
            const count      = await this.#exportCollection(collection, backupPath, 'knowledge-base-backup');
            return {
                message     : `Export complete. Exported ${count} knowledge base chunks.`,
                count,
                collectionId: collection?.id ?? null
            };
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
     * each service's backup logic locally discoverable instead of delegating across
     * subsystems. Pagination cap + surgical per-id rescue mode make this robust against
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

        const limit  = 2000;
        let   offset = 0;

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
     * MCP tool in `toolService.mjs` serviceMapping to protect the MCP tool budget against
     * harness caps. `makeSafe` no-match passthrough forwards raw args through when no
     * matching openapi operation is found, so `backup.mjs` can invoke this dispatcher with
     * `{action, backupPath}` without a Zod schema. The manual throw below is the actual
     * rejection path for invalid actions.
     *
     * Supports `action: 'export'`, `'import'`, and `'truncate'`. Import + truncate are the
     * restore-tooling counterparts to `'export'`, peer-symmetric with
     * `Memory_DatabaseService.manageDatabaseBackup`.
     *
     * @param {Object}  options
     * @param {String}  options.action      `'export'`, `'import'`, or `'truncate'`.
     * @param {String} [options.backupPath] Forwarded to `exportDatabase` when action is `'export'`.
     * @param {String} [options.file]       Forwarded to `importDatabase` when action is `'import'`. Path to a JSONL file or directory.
     * @param {String} [options.mode]       Forwarded to `importDatabase` when action is `'import'`. `'merge'` (default) or `'replace'`.
     * @param {String|Object} [options.confirmation] Forwarded to `importDatabase` (`replace` mode) or `truncateDatabase` for the destructive-operation guard.
     * @returns {Promise<Object>}
     */
    async manageDatabaseBackup({action, ...config}) {
        if (action === 'export') {
            return this.exportDatabase(config);
        } else if (action === 'import') {
            return this.importDatabase(config);
        } else if (action === 'truncate') {
            return this.truncateDatabase(config);
        }

        throw new Error(
            `Unknown action: ${action}. Supported actions: 'export', 'import', 'truncate'.`
        );
    }

    /**
     * Imports a previously exported JSONL file (or directory of JSONL files) into the
     * Knowledge Base ChromaDB collection. Records preserve their original embeddings — no
     * re-embedding is triggered, so a restore from a same-version bundle is fast and
     * cost-free.
     *
     * Peer-symmetric counterpart of `exportDatabase`. Called by the canonical restore
     * orchestrator (`ai/scripts/maintenance/restore.mjs`).
     *
     * @param {Object}        options
     * @param {String}        options.file               Absolute path to a JSONL file OR a directory containing `.jsonl` files.
     * @param {String}       [options.mode='merge']      `'merge'` upserts on top of existing data; `'replace'` truncates the collection first via the destructive-operation guard.
     * @param {String|Object} [options.confirmation]     Explicit production confirmation token (forwarded to `truncateDatabase` when mode is `'replace'`).
     * Parsing and Chroma writes share the existing 500-row bound: a source file is
     * never materialized in full before its first write.
     *
     * @returns {Promise<{message: String, imported: Number, mode: String}>}
     */
    async importDatabase({file, mode = 'merge', confirmation} = {}) {
        try {
            if (!file) {
                throw new Error('importDatabase requires a `file` argument (path to a JSONL file or directory of JSONL files)');
            }
            if (!await fs.pathExists(file)) {
                throw new Error(`Backup source not found at ${file}`);
            }
            if (mode !== 'merge' && mode !== 'replace') {
                throw new Error(`Unknown mode: ${mode}. Must be 'merge' or 'replace'.`);
            }

            const stat        = await fs.stat(file);
            const sourceFiles = [];

            if (stat.isDirectory()) {
                const entries = await fs.readdir(file);
                for (const entry of entries) {
                    if (entry.endsWith('.jsonl')) {
                        sourceFiles.push(path.join(file, entry));
                    }
                }
            } else if (file.endsWith('.jsonl')) {
                sourceFiles.push(file);
            } else {
                throw new Error(`Unsupported source: ${file} is neither a directory nor a .jsonl file`);
            }

            if (sourceFiles.length === 0) {
                return {message: 'No JSONL files found to import.', imported: 0, mode};
            }

            if (mode === 'replace') {
                // Prove the FULL source before any destructive operation: every row of every file
                // must parse and carry a non-empty id plus a valid same-dimension vector. Without
                // this pass, a corrupt final row would truncate the collection and only then be
                // discovered by the per-batch write gate below.
                for (const filePath of sourceFiles) {
                    await validateJsonlSourceFile({filePath, expectedDimension: aiConfig.vectorDimension});
                }

                logger.log('Replace mode: truncating Knowledge Base collection before import...');
                await this.truncateDatabase({confirmation});
            }

            logger.log(`Starting Knowledge Base import. Discovered ${sourceFiles.length} backup file(s) (mode: ${mode})...`);

            const collection = await ChromaManager.getKnowledgeBaseCollection();
            let   imported   = 0;

            for (const filePath of sourceFiles) {
                logger.log(`Importing: ${filePath}`);

                // KB chunks store content in `metadata.content`, not in Chroma's
                // primary `document` slot — so 100% of KB backup records carry `document: null`.
                // Chroma's `collection.upsert` rejects null entries in the `documents` array
                // with "Expected each document to be a string, but got object". Omit the
                // `documents` field entirely when every record in the batch has a null doc;
                // substitute empty strings for any remaining nulls in mixed batches so each
                // array element satisfies Chroma's string-shape requirement uniformly.
                const BATCH_SIZE   = 500;
                const fileStream   = fs.createReadStream(filePath);
                const rl           = readline.createInterface({input: fileStream, crlfDelay: Infinity});
                let   batch        = [];
                let   fileImported = 0;

                const flushBatch = async () => {
                    if (batch.length === 0) return;

                    // Detach the full batch before awaiting Chroma. The readline loop cannot
                    // grow it while the write is pending, and the completed rows become
                    // collectible as soon as this flush returns.
                    const writeBatch = batch;
                    batch = [];

                    // Atomic vector-write invariant (mirrors the Memory Core boundary): an
                    // explicit-embedding import must carry a valid same-dimension vector — a row
                    // without one is rejected fail-loud BEFORE any upsert, never half-persisted
                    // as metadata-only. Replace mode's pre-truncate source proof catches corrupt
                    // rows first; this is the merge path's own gate for direct import callers.
                    const {valid, rejected} = partitionRowsByVectorValidity({rows: writeBatch, expectedDimension: aiConfig.vectorDimension});

                    if (rejected.length > 0) {
                        const reasons = rejected.map(r => `${r.id ?? 'unknown'} (${r.reason})`).slice(0, 5).join(', ');
                        throw new Error(`Knowledge Base import vector invariant rejected ${rejected.length} row(s): ${reasons} — not persisted`);
                    }

                    const upsertArgs = {
                        ids       : valid.map(r => r.id),
                        embeddings: valid.map(r => r.embedding),
                        metadatas : valid.map(r => r.metadata)
                    };
                    if (valid.some(r => r.document != null)) {
                        upsertArgs.documents = valid.map(r => r.document ?? '');
                    }
                    await collection.upsert(upsertArgs);

                    imported     += valid.length;
                    fileImported += valid.length;
                };

                for await (const line of rl) {
                    if (!line.trim()) continue;

                    batch.push(JSON.parse(line));

                    if (batch.length === BATCH_SIZE) {
                        await flushBatch();
                    }
                }

                await flushBatch();

                if (fileImported === 0) {
                    logger.log(`No records found in ${filePath}. Skipping.`);
                }
            }

            return {
                message : `Import complete. Ingested ${imported} chunks across ${sourceFiles.length} file(s).`,
                imported,
                mode
            };
        } catch (error) {
            logger.error('[DatabaseService] Error importing knowledge base:', error);
            const importError = new Error(`DATABASE_IMPORT_ERROR: ${error.message}`);
            importError.code  = 'DATABASE_IMPORT_ERROR';
            throw importError;
        }
    }

    /**
     * Truncates the Knowledge Base collection. The collection is dropped via Chroma's
     * `deleteCollection`; the cached `ChromaManager` references are reset so the next
     * `getKnowledgeBaseCollection()` call lazily recreates an empty collection.
     *
     * Routes through the shared destructive-operation guard with a truncate-shaped operation
     * identifier (`knowledge-base.chroma.truncate`), distinct from `deleteDatabase` which
     * delegates to `VectorService.deleteCollection` (operation `knowledge-base.chroma.delete`).
     * Both operations are mechanically similar but the operation/mode metadata in operator
     * diagnostics differs — `truncate` reflects "wipe-for-restore-replace", `delete` reflects
     * "permanent removal".
     *
     * Production-target invocations require both the bypass env var
     * (`NEO_ALLOW_PRODUCTION_DESTRUCTIVE_AI_SUBSTRATE=true`) and an explicit operator
     * confirmation token. Disposable targets (`tmp/`, OS tempdir, `:memory:` SQLite) are
     * allowed automatically.
     *
     * @param {Object}        [options]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<{message: String}>}
     */
    async truncateDatabase({confirmation} = {}) {
        const collectionName = aiConfig.collectionName;

        try {
            await DestructiveOperationGuard.assertDestructiveTargetAllowed({
                operation: 'knowledge-base.chroma.truncate',
                subsystem: 'knowledge-base',
                mode     : 'truncate',
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

            // Route through ChromaManager.deleteCollection so the canonical-name guard applies.
            // The path-target guard above already passed `assertDestructiveTargetAllowed`;
            // forward the operator confirmation so the canonical-name guard accepts it.
            await ChromaManager.deleteCollection({name: collectionName, confirmation});

            ChromaManager.invalidateKnowledgeBaseCollectionCache();

            const message = `Knowledge base collection '${collectionName}' truncated successfully.`;
            logger.log(message);
            return {message};
        } catch (error) {
            if (error.message?.includes(`Collection ${collectionName} does not exist.`)) {
                const message = `Knowledge base collection '${collectionName}' did not exist. No action taken.`;
                logger.log(message);
                return {message};
            }
            throw error;
        }
    }

    /**
     * Manages knowledge base data operations based on the provided action.
     * @param {Object}  params
     * @param {String}        params.action       'sync', 'create', 'embed', or 'delete'
     * @param {Boolean}      [params.viaMcp]      True when dispatched from the MCP toolService
     *                                            wrapper; threaded through to `embed()` to enable
     *                                            the work-volume gate. CLI callers
     *                                            omit this and bypass the gate.
     * @param {String}       [params.staleStrategy] Optional VectorService stale strategy.
     * @param {String|Object} [params.confirmation] Explicit production confirmation token for delete.
     * @returns {Promise<Object>}
     */
    async manageKnowledgeBase({action, viaMcp = false, staleStrategy, confirmation}) {
        switch (action) {
            case 'sync':
                return this.syncDatabase({viaMcp, staleStrategy});
            case 'create':
                return this.createKnowledgeBase();
            case 'embed':
                return this.embedKnowledgeBase({viaMcp, staleStrategy});
            case 'delete':
                return this.deleteDatabase({confirmation});
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
        let   totalChunks = 0;

        // Sources are discovered via SourceRegistry instead of a hardcoded array. Default
        // Neo sources auto-register at import-time via `./source/_export.mjs` unless
        // `aiConfig.useDefaultSources === false`; tenant-supplied custom sources register
        // either declaratively via `aiConfig.customSources` or programmatically via
        // `SourceRegistry.registerSource(...)`. Insertion order is preserved for
        // byte-equivalent generated JSONL output.
        const sources      = SourceRegistry.getSources();
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
     * @param {Object}       [options]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<object>} A promise that resolves to a success message.
     */
    async deleteDatabase({confirmation} = {}) {
        return await VectorService.deleteCollection({confirmation});
    }

    /**
     * Reads the generated JSONL file and upserts the data into the ChromaDB collection.
     * Delegates to VectorService.
     * @param {Object}  [opts]
     * @param {Boolean} [opts.viaMcp=false] True when invoked via MCP tool dispatch;
     *                                      threaded to VectorService.embed for the
     *                                      work-volume gate.
     * @param {String}  [opts.staleStrategy] Explicit stale-data handling strategy.
     * @param {Function} [opts.shouldYield]  Cooperative heavy-maintenance-lease yield predicate,
     *                                      threaded to VectorService.embed so a long re-embed releases the
     *                                      lease at a batch boundary and resumes on the next sweep.
     * @returns {Promise<object>} A promise that resolves to a success message, OR a
     *     `{error, code: 'KB_SYNC_VOLUME_EXCEEDED', ...}` shape when the MCP gate fires.
     */
    async embedKnowledgeBase({viaMcp = false, staleStrategy, shouldYield} = {}) {
        return await VectorService.embed(aiConfig.dataPath, {viaMcp, staleStrategy, shouldYield});
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
    }

    /**
     * A convenience orchestrator that runs the entire knowledge base synchronization process.
     * It first creates the knowledge base file and then embeds its contents into the vector database.
     * This provides a simple, single-command way to update the knowledge base from scratch.
     * @param {Object}  [opts]
     * @param {Boolean} [opts.viaMcp=false] True when invoked via MCP tool dispatch;
     *                                      threaded to embed() for the work-volume gate.
     * @param {String}  [opts.staleStrategy] Explicit stale-data handling strategy.
     * @param {Function} [opts.shouldYield]  Cooperative heavy-maintenance-lease yield predicate,
     *                                      threaded to the embed step.
     * @returns {Promise<object>} A promise that resolves to the final success message from the embedding step.
     */
    async syncDatabase({viaMcp = false, staleStrategy, shouldYield} = {}) {
        logger.log('Starting full database synchronization...');
        await this.createKnowledgeBase();
        return await this.embedKnowledgeBase({viaMcp, staleStrategy, shouldYield});
    }
}

export default Neo.setupClass(DatabaseService);
