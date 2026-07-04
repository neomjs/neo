import aiConfig                                                   from '../../mcp/server/memory-core/config.mjs';
import fs                                                         from 'fs-extra';
import logger                                                     from '../../mcp/server/memory-core/logger.mjs';
import path                                                       from 'path';
import readline                                                   from 'readline';
import Base                                                       from '../../../src/core/Base.mjs';
import StorageRouter                                              from './managers/StorageRouter.mjs';
import DestructiveOperationGuard                                  from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';
import {partitionRowsByVectorValidity, summarizeVectorRejections} from './helpers/vectorWriteInvariant.mjs';

/**
 * @summary Service for exporting and importing memory core data.
 *
 * This class provides functionality to backup and restore the agent's memory and session summary data.
 * It supports exporting collections to JSONL files and importing them back, with options to either merge
 * or replace existing data. This is crucial for data migration and disaster recovery.
 *
 * @class Neo.ai.services.memory-core.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.DatabaseService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        await StorageRouter.ready();
    }

    /**
     * Helper method to export a ChromaDB collection.
     * @param {Object} collection The ChromaDB collection to export.
     * @param {String} backupPath The directory to save the backup file.
     * @param {String} filePrefix The prefix for the backup filename.
     * @param {String} collectionName Stable collection label for logs, stats, and fail-loud errors.
     * @returns {Promise<{collection: String, backupFile: String|null, expected: Number, exported: Number, skipped: Number, skippedIds: String[]}>} Export statistics.
     * @private
     */
    async #exportCollection(collection, backupPath, filePrefix, collectionName = collection.name || filePrefix) {
        logger.log(`Fetching all documents from "${collectionName}"...`);

        // 1. Get total count first
        const count = await collection.count();
        if (count === 0) {
            logger.log(`No documents found in ${collectionName} to export.`);
            return {
                collection: collectionName,
                backupFile: null,
                expected  : 0,
                exported  : 0,
                skipped   : 0,
                skippedIds: []
            }
        }

        logger.log(`Found ${count} documents in ${collectionName} to export.`);

        await fs.ensureDir(backupPath);
        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);
        const stats       = {
            collection: collectionName,
            backupFile,
            expected  : count,
            exported  : 0,
            skipped   : 0,
            skippedIds: []
        };

        // 2. Paginated Fetch
        const limit  = 2000; // Safe batch size
        let   offset = 0;

        while (offset < count) {
            logger.log(`Fetching batch: ${offset} to ${Math.min(offset + limit, count)} of ${count}`);

            let batch;
            try {
                batch = await collection.get({
                    include: ["documents", "embeddings", "metadatas"],
                    limit,
                    offset : offset
                });
            } catch (batchErr) {
                logger.log(`Batch ${offset} fetch failed: ${batchErr.message}. Initiating surgical 1-by-1 rescue mode...`);

                // Fetch only IDs first to bypass corrupt payload/embedding pointers
                const idBatch = await collection.get({
                    include: [],
                    limit,
                    offset : offset
                });

                batch = {ids: [], metadatas: [], documents: [], embeddings: []};

                for (const id of idBatch.ids) {
                    try {
                        const single = await collection.get({
                            ids    : [id],
                            include: ["documents", "embeddings", "metadatas"]
                        });

                        if (single.ids && single.ids.length > 0) {
                            batch.ids.push(single.ids[0]);
                            batch.documents.push(single.documents[0]);
                            batch.metadatas.push(single.metadatas[0]);
                            batch.embeddings.push(single.embeddings[0]);
                        }
                    } catch (singleErr) {
                        stats.skipped++;
                        stats.skippedIds.push(id);
                        logger.error(`Skipping corrupted vector ID during export: ${id} (${singleErr.message})`);
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
                stats.exported++;
            }

            offset += limit;
        }

        await new Promise(resolve => writeStream.end(resolve));
        if (stats.exported !== stats.expected) {
            const error = new Error(
                `PARTIAL_COLLECTION_EXPORT: ${collectionName} exported ${stats.exported}/${stats.expected} ` +
                `records to ${backupFile}; skipped ${stats.skipped} corrupted vector id(s).`
            );
            error.code    = 'PARTIAL_COLLECTION_EXPORT';
            error.details = stats;
            throw error
        }

        logger.log(`Successfully exported ${stats.exported}/${stats.expected} documents from ${collectionName} to: ${backupFile}`);
        return stats
    }

    /**
     * Helper method to export the Native Graph (Nodes and Edges) as JSONL.
     * @param {String} backupPath The directory to save the backup file.
     * @param {String} filePrefix The prefix for the backup filename.
     * @returns {Promise<number>} The total number of graph elements exported.
     * @private
     */
    async #exportGraph(backupPath, filePrefix) {
        logger.log(`Fetching all nodes and edges from the native graph...`);
        const GraphService = (await import('./GraphService.mjs')).default;

        // Ensure graph is initialized
        if (!GraphService.db || !GraphService.db.storage || !GraphService.db.storage.db) {
             logger.log(`Graph database not initialized. Skipping graph export.`);
             return 0;
        }

        const db = GraphService.db.storage.db;

        let nodesCount = 0;
        let edgesCount = 0;

        try {
            nodesCount = db.prepare('SELECT count(*) as c FROM Nodes').get().c || 0;
            edgesCount = db.prepare('SELECT count(*) as c FROM Edges').get().c || 0;
        } catch (e) {
            logger.error(`Error querying Native Graph tables: ${e.message}`);
            return 0;
        }

        const totalCount = nodesCount + edgesCount;

        if (totalCount === 0) {
            logger.log(`No nodes or edges found in the native graph to export.`);
            return 0;
        }

        logger.log(`Found ${nodesCount} nodes and ${edgesCount} edges to export.`);

        const fs   = (await import('fs-extra')).default;
        const path = (await import('path')).default;
        await fs.ensureDir(backupPath);

        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        let exported = 0;

        // Export Nodes
        const nodesStmt = db.prepare('SELECT data FROM Nodes');
        for (const row of nodesStmt.iterate()) {
             try {
                 const node   = JSON.parse(row.data);
                 const record = { type: 'node', data: node };
                 writeStream.write(JSON.stringify(record) + '\n');
                 exported++;
             } catch(e) {
                 logger.error(`Error parsing node during export`, e);
             }
        }

        // Export Edges
        const edgesStmt = db.prepare('SELECT data FROM Edges');
        for (const row of edgesStmt.iterate()) {
             try {
                 const edge   = JSON.parse(row.data);
                 const record = { type: 'edge', data: edge };
                 writeStream.write(JSON.stringify(record) + '\n');
                 exported++;
             } catch(e) {
                 logger.error(`Error parsing edge during export`, e);
             }
        }

        await new Promise(resolve => writeStream.end(resolve));
        logger.log(`Successfully exported ${exported} graph elements to: ${backupFile}`);
        return exported;
    }

    /**
     * Helper method to import the Native Graph from JSONL.
     * @param {String} filePath The JSONL file path.
     * @param {String} mode 'merge' or 'replace'.
     * @param {String|Object} [confirmation] Explicit production confirmation token.
     * @returns {Promise<number>}
     * @private
     */
    async #importGraph(filePath, mode, confirmation) {
        logger.log(`Importing Graph Data from ${filePath} (mode: ${mode})...`);
        const GraphService = (await import('./GraphService.mjs')).default;

        if (!GraphService.db || !GraphService.db.storage || !GraphService.db.storage.db) {
            throw new Error(`Graph database not initialized. Cannot import graph.`);
        }

        const db = GraphService.db.storage.db;

        if (mode === 'replace') {
            await this.#assertGraphDestructiveTargetAllowed({
                operation: 'memory-core.graph.import.replace',
                mode     : 'replace',
                source   : {path: filePath},
                confirmation
            });

            logger.log(`Replace mode: Truncating existing Graph Nodes and Edges...`);
            db.prepare('DELETE FROM Nodes').run();
            db.prepare('DELETE FROM Edges').run();
        }

        const fs       = (await import('fs-extra')).default;
        const readline = (await import('readline')).default;

        const fileStream = fs.createReadStream(filePath);
        const rl         = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let imported = 0;

        // Mode-dependent INSERT semantics:
        //   - 'replace' mode: TRUNCATE-then-OR-REPLACE. Conflict impossible after truncate,
        //     OR REPLACE retained for backward parity. Backup IS the new state.
        //   - 'merge' mode: OR IGNORE. Preserves live rows when IDs collide; backup-only IDs
        //     still INSERT; live-only IDs untouched. This preserves live post-wipe re-ingestion
        //     while letting backups fill records that are genuinely missing.
        const conflictClause = mode === 'replace' ? 'OR REPLACE' : 'OR IGNORE';
        const insertNode     = db.prepare(`INSERT ${conflictClause} INTO Nodes (id, user_id, data) VALUES (?, ?, ?)`);
        const insertEdge     = db.prepare(`
            INSERT ${conflictClause} INTO Edges (id, user_id, source, target, type, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `);

        // Truthful counters distinguish inserted (`changes === 1`) from skippedExisting
        // (`changes === 0`; OR IGNORE no-op) and failed (exception per record). better-sqlite3
        // exposes this through `stmt.run().changes`.
        const counts = {
            nodes: {inserted: 0, skippedExisting: 0, failed: 0},
            edges: {inserted: 0, skippedExisting: 0, failed: 0}
        };

        // Run within a transaction for speed
        const insertBatch = db.transaction((records) => {
            for (const record of records) {
                if (record.type === 'node') {
                    try {
                        const result = insertNode.run(
                            record.data.id,
                            record.data.properties?.userId || record.data.user_id || null,
                            JSON.stringify(record.data)
                        );
                        if (result.changes === 1) counts.nodes.inserted++;
                        else                       counts.nodes.skippedExisting++;
                    } catch (e) {
                        counts.nodes.failed++;
                        if (counts.nodes.failed <= 5) logger.warn(`[importGraph] node insert failed for id=${record.data?.id}: ${e.message}`);
                    }
                } else if (record.type === 'edge') {
                    const edgeData = record.data;
                    const edgeId   = edgeData.id || `${edgeData.source}->${edgeData.target}:${edgeData.type}`;

                    if (!edgeData.source || !edgeData.target || !edgeData.type) {
                        counts.edges.failed++;
                        if (counts.edges.failed <= 5) logger.warn(`[importGraph] edge missing source/target/type: id=${edgeId}`);
                        continue;
                    }

                    try {
                        const result = insertEdge.run(
                            edgeId,
                            edgeData.properties?.userId || edgeData.user_id || null,
                            edgeData.source,
                            edgeData.target,
                            edgeData.type,
                            JSON.stringify(edgeData)
                        );
                        if (result.changes === 1) counts.edges.inserted++;
                        else                       counts.edges.skippedExisting++;
                    } catch (e) {
                        counts.edges.failed++;
                        if (counts.edges.failed <= 5) logger.warn(`[importGraph] edge insert failed for id=${edgeId}: ${e.message}`);
                    }
                }
                imported++;
            }
        });

        const batch = [];
        for await (const line of rl) {
            if (line.trim()) {
                batch.push(JSON.parse(line));
                if (batch.length >= 2000) {
                     insertBatch(batch);
                     batch.length = 0;
                }
            }
        }
        if (batch.length > 0) {
             insertBatch(batch);
        }

        const summary = `nodes(inserted=${counts.nodes.inserted}, skipped=${counts.nodes.skippedExisting}, failed=${counts.nodes.failed}) ` +
                        `edges(inserted=${counts.edges.inserted}, skipped=${counts.edges.skippedExisting}, failed=${counts.edges.failed})`;
        logger.log(`Successfully imported ${imported} graph elements: ${summary}`);
        return {imported, counts, mode};
    }

    /**
     * Exports the memory database (memories, summaries, temporal summaries, graph) to JSONL files.
     *
     * Accepts an optional `backupPath` so orchestrators (e.g. `ai/scripts/maintenance/backup.mjs`)
     * can direct artifacts into a subfolder of an atomic timestamped bundle without
     * needing to post-process file locations. Default behavior is unchanged (flat write
     * to `aiConfig.backupPath`).
     *
     * @param {Object}    options
     * @param {String[]} [options.include=['memories','summaries','temporal-summaries','graph']] Array of collections to export.
     * @param {String}   [options.backupPath=aiConfig.backupPath]           Directory for the JSONL artifacts.
     * @returns {Promise<Object>}
     */
    async exportDatabase({include=['memories', 'summaries', 'temporal-summaries', 'graph'], backupPath = aiConfig.backupPath} = {}) {
        try {
            logger.log('Starting agent memory export...');
            let memoryStats = null, summaryStats = null, temporalSummaryStats = null, graphStats = null;

            if (include.includes('memories')) {
                const collection = await StorageRouter.getMemoryCollection();
                memoryStats      = await this.#exportCollection(collection, backupPath, 'memory-backup', aiConfig.collections.memory);
            }

            if (include.includes('summaries')) {
                const collection = await StorageRouter.getSummaryCollection();
                summaryStats     = await this.#exportCollection(collection, backupPath, 'summaries-backup', aiConfig.collections.session);
            }

            if (include.includes('temporal-summaries')) {
                const collection = await StorageRouter.getTemporalSummaryCollection();
                temporalSummaryStats = await this.#exportCollection(collection, backupPath, 'temporal-summary-backup', aiConfig.collections.temporalSummary);
            }

            if (include.includes('graph')) {
                const graphCount = await this.#exportGraph(backupPath, 'graph-backup');
                graphStats       = {expected: graphCount, exported: graphCount};
            }

            const memoryCount          = memoryStats?.exported || 0,
                  summaryCount         = summaryStats?.exported || 0,
                  temporalSummaryCount = temporalSummaryStats?.exported || 0,
                  graphCount           = graphStats?.exported || 0,
                  result               = {
                      message: `Export complete. Exported ${memoryCount} memories, ${summaryCount} summaries, ${temporalSummaryCount} temporal summaries, and ${graphCount} graph elements.`,
                      count  : memoryCount + summaryCount + temporalSummaryCount + graphCount
                  };

            if (memoryStats) result.memories = memoryStats;
            if (summaryStats) result.summaries = summaryStats;
            if (temporalSummaryStats) result.temporalSummaries = temporalSummaryStats;
            if (graphStats) result.graph = graphStats;

            return result
        } catch (error) {
            logger.error('[DatabaseService] Error exporting database:', error);
            const exportError = new Error(`DATABASE_EXPORT_ERROR: ${error.message}`);
            exportError.code  = 'DATABASE_EXPORT_ERROR';
            if (error.details) exportError.details = error.details;
            throw exportError;
        }
    }

    /**
     * Imports a previously exported JSONL file back into the database.
     * @param {Object} options
     * @param {String} options.file The path to the backup file to import.
     * @param {String}        options.mode The import mode: 'merge' or 'replace'.
     * @param {Boolean}      [options.reEmbed=false] If true, regenerates embeddings for all records.
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<{imported: number, total: number, mode: string}>}
     */
    async importDatabase({file, mode, reEmbed=false, confirmation}) {
        try {
            let filesToImport = [];

            // If the user specifies a specific file
            if (file && (file.endsWith('.jsonl') || file.endsWith('.json'))) {
                if (!await fs.pathExists(file)) {
                    throw new Error(`Backup file not found at ${file}`);
                }
                filesToImport.push(file);
            } else {
                // "Grab them all" mode - scan fallback/unified backup folders
                const pathsToScan = [
                    file, // user provided directory
                    aiConfig.backupPath, // .neo-ai-data/backups/
                    path.resolve(process.cwd(), 'dist/memory-backups') // legacy
                ];

                for (const sweepTarget of pathsToScan) {
                    if (sweepTarget && await fs.pathExists(sweepTarget)) {
                        const stat = await fs.stat(sweepTarget);
                        if (stat.isDirectory()) {
                            const dirFiles = await fs.readdir(sweepTarget);
                            for (const df of dirFiles) {
                                if (df.endsWith('.jsonl')) {
                                    filesToImport.push(path.join(sweepTarget, df));
                                }
                            }
                        }
                    }
                }
            }

            if (filesToImport.length === 0) {
                return {message: 'No JSONL backup files found to import.'};
            }

            // Deduplicate paths
            filesToImport = [...new Set(filesToImport)];
            logger.log(`Starting agent memory import. Discovered ${filesToImport.length} backup file(s)...`);

            if (mode === 'replace') {
                // Truncate ONLY the subsystems that this import will restore — selected
                // by the same filename heuristic the per-file dispatch loop uses below.
                // Truncating subsystems that aren't being restored would be destructive
                // without restoration. Each subsystem's truncate fires the destructive-op
                // guard independently.
                const subsystemsToWipe = new Set();
                for (const filePath of filesToImport) {
                    const base = path.basename(filePath);
                    if      (base.startsWith('graph-backup'))            subsystemsToWipe.add('graph');
                    else if (base.startsWith('memory-backup'))           subsystemsToWipe.add('memories');
                    else if (base.startsWith('temporal-summary-backup')) subsystemsToWipe.add('temporal-summaries');
                    else                                                 subsystemsToWipe.add('summaries');
                }

                if (subsystemsToWipe.size > 0) {
                    logger.log(`Replace mode: truncating ${[...subsystemsToWipe].join(', ')} before batch import...`);
                    await this.truncateDatabase({include: [...subsystemsToWipe], confirmation});
                }
            }

            let totalImported        = 0;
            let targetCollectionName = '';
            // Per-substrate truthful counters surface alongside the aggregate so operator
            // validation can distinguish inserted vs skippedExisting vs failed. Graph counts come
            // from `#importGraph`. Chroma counts come from the mode-branched path below: merge mode
            // preflights existing IDs in chunks and only `collection.add()`s missing IDs; replace
            // mode runs `collection.upsert()` after subsystem truncate. `memoriesInserted` remains
            // as a backward-compatible aggregate of memories.inserted + summaries.inserted.
            const subsystemCounts = {
                graph            : null,
                memories         : {inserted: 0, skippedExisting: 0, failed: 0},
                summaries        : {inserted: 0, skippedExisting: 0, failed: 0},
                temporalSummaries: {inserted: 0, skippedExisting: 0, failed: 0},
                memoriesInserted : 0
            };

            // Atomic vector-write invariant: an explicit-embedding import must carry a valid same-dimension
            // vector — a row whose vector is missing/empty/wrong-dim/non-finite is rejected fail-loud rather
            // than half-persisted as metadata-only (the corruption shape the invariant exists to prevent).
            const expectedDimension = aiConfig.vectorDimension;

            for (const filePath of filesToImport) {
                logger.log(`Importing: ${filePath}`);

                const isGraphBackup = path.basename(filePath).startsWith('graph-backup');
                if (isGraphBackup) {
                    const graphImportResult = await this.#importGraph(filePath, mode, confirmation);
                    // `#importGraph` returns {imported, counts, mode}; counts exposes node/edge
                    // inserted/skippedExisting/failed for truthful merge accounting.
                    totalImported += graphImportResult.imported;
                    subsystemCounts.graph = graphImportResult.counts;
                    continue;
                }

                // Determine which collection to import into based on filename heuristics
                const isMemoryBackup          = path.basename(filePath).startsWith('memory-backup');
                const isTemporalSummaryBackup = path.basename(filePath).startsWith('temporal-summary-backup');
                let   collection              = isMemoryBackup
                    ? await StorageRouter.getMemoryCollection()
                    : isTemporalSummaryBackup
                        ? await StorageRouter.getTemporalSummaryCollection()
                        : await StorageRouter.getSummaryCollection();

                targetCollectionName = collection.name; // roughly tracking target

                // Route per-file counters into the right substrate bucket so memories vs summaries
                // vs temporal summaries truthful counts stay separable across multi-file batches.
                const chromaCounts = isMemoryBackup
                    ? subsystemCounts.memories
                    : isTemporalSummaryBackup ? subsystemCounts.temporalSummaries : subsystemCounts.summaries;

                const fileStream = fs.createReadStream(filePath);
                const rl         = readline.createInterface({input: fileStream, crlfDelay: Infinity});
                const records    = [];

                for await (const line of rl) {
                    if (line.trim()) {
                        records.push(JSON.parse(line));
                    }
                }

                if (records.length === 0) {
                    logger.log(`No records found in ${filePath}. Skipping.`);
                    continue;
                }

                if (reEmbed) {
                    logger.log(`Re-embedding enabled. Stripping ${records.length} existing embeddings...`);
                    records.forEach(r => delete r.embedding);
                }

                // Chroma has TWO upsert/add limits: (1) record-count cap ~5461; (2) HTTP
                // body size cap that 413-rejects large payloads. With 4096-dim qwen3
                // embeddings (~32KB each) + document text, per-record is ~35-40KB.
                // Chunk size 250 = ~10MB body, well within HTTP limits + record cap.
                // Empirical anchors 2026-05-10:
                //   - 9244 records: "Record set length 9244 exceeds max batch size 5461"
                //   - 4000 records: "413: Payload Too Large"
                const CHROMA_UPSERT_CHUNK_SIZE = 250;

                let fileInserted        = 0;
                let fileSkippedExisting = 0;
                let fileFailed          = 0;

                if (mode === 'merge') {
                    // Preserve-live merge, matching graph-side INSERT OR IGNORE semantics. Chunked
                    // existence-check via `collection.get({ids})`, then `collection.add()` for the
                    // missing-ID subset only. Live records are NOT overwritten, so the running
                    // daemon's authoritative state survives.
                    const existingIds = new Set();
                    for (let i = 0; i < records.length; i += CHROMA_UPSERT_CHUNK_SIZE) {
                        const chunkIds  = records.slice(i, i + CHROMA_UPSERT_CHUNK_SIZE).map(r => r.id);
                        const existence = await collection.get({ids: chunkIds, include: []});
                        existence.ids.forEach(id => existingIds.add(id));
                    }

                    const missing = records.filter(r => !existingIds.has(r.id));
                    fileSkippedExisting = existingIds.size;

                    if (existingIds.size > 0) {
                        logger.log(`  merge mode: ${existingIds.size} live ID(s) preserved; ${missing.length} new record(s) to insert.`);
                    }

                    for (let i = 0; i < missing.length; i += CHROMA_UPSERT_CHUNK_SIZE) {
                        let chunk = missing.slice(i, i + CHROMA_UPSERT_CHUNK_SIZE);
                        // reEmbed strips vectors (Chroma re-embeds), so the invariant guards only the
                        // explicit-embedding path: reject any row lacking a valid same-dimension vector.
                        if (!reEmbed) {
                            const {valid, rejected} = partitionRowsByVectorValidity({rows: chunk, expectedDimension});
                            if (rejected.length > 0) {
                                const {count, byReason} = summarizeVectorRejections(rejected);
                                logger.error(`[importMemories] vector-write invariant rejected ${count} row(s) without a valid same-dimension vector ${JSON.stringify(byReason)} — not persisted`);
                                fileFailed += rejected.length;
                            }
                            chunk = valid;
                        }
                        if (chunk.length === 0) {
                            continue;
                        }
                        try {
                            await collection.add({
                                ids       : chunk.map(r => r.id),
                                embeddings: chunk.map(r => r.embedding),
                                metadatas : chunk.map(r => r.metadata),
                                documents : chunk.map(r => r.document)
                            });
                            fileInserted += chunk.length;
                        } catch (e) {
                            fileFailed += chunk.length;
                            logger.error(`[importMemories] add failed for chunk ${Math.floor(i / CHROMA_UPSERT_CHUNK_SIZE) + 1}: ${e.message}`);
                        }
                        if (missing.length > CHROMA_UPSERT_CHUNK_SIZE) {
                            logger.log(`  added chunk ${Math.floor(i / CHROMA_UPSERT_CHUNK_SIZE) + 1}/${Math.ceil(missing.length / CHROMA_UPSERT_CHUNK_SIZE)} (${chunk.length} records)`);
                        }
                    }
                } else {
                    // Replace mode: subsystem already truncated above; upsert is safe
                    // (no live rows to collide with). Fail-fast on chunk error matches
                    // fail-fast behavior; the outer try/catch wraps it as DATABASE_IMPORT_ERROR.
                    let replaceRejected = 0;
                    for (let i = 0; i < records.length; i += CHROMA_UPSERT_CHUNK_SIZE) {
                        let chunk = records.slice(i, i + CHROMA_UPSERT_CHUNK_SIZE);
                        // reEmbed strips vectors (Chroma re-embeds), so the invariant guards only the
                        // explicit-embedding path: reject any row lacking a valid same-dimension vector.
                        if (!reEmbed) {
                            const {valid, rejected} = partitionRowsByVectorValidity({rows: chunk, expectedDimension});
                            if (rejected.length > 0) {
                                const {count, byReason} = summarizeVectorRejections(rejected);
                                logger.error(`[importMemories] vector-write invariant rejected ${count} row(s) without a valid same-dimension vector ${JSON.stringify(byReason)} — not persisted`);
                                replaceRejected += rejected.length;
                            }
                            chunk = valid;
                        }
                        if (chunk.length === 0) {
                            continue;
                        }
                        await collection.upsert({
                            ids       : chunk.map(r => r.id),
                            embeddings: chunk.map(r => r.embedding),
                            metadatas : chunk.map(r => r.metadata),
                            documents : chunk.map(r => r.document)
                        });
                        if (records.length > CHROMA_UPSERT_CHUNK_SIZE) {
                            logger.log(`  upserted chunk ${Math.floor(i / CHROMA_UPSERT_CHUNK_SIZE) + 1}/${Math.ceil(records.length / CHROMA_UPSERT_CHUNK_SIZE)} (${chunk.length} records)`);
                        }
                    }
                    fileFailed   += replaceRejected;
                    fileInserted  = records.length - replaceRejected;
                }

                chromaCounts.inserted            += fileInserted;
                chromaCounts.skippedExisting     += fileSkippedExisting;
                chromaCounts.failed              += fileFailed;
                totalImported                    += fileInserted;
                subsystemCounts.memoriesInserted += fileInserted;
            }

            return {
                message : `Import batch complete. Successfully ingested ${totalImported} records across ${filesToImport.length} file(s).`,
                imported: totalImported,
                mode,
                // Structured per-substrate breakdown for operator validation.
                // `graph` is null when no graph file was imported in this batch; otherwise
                // exposes {nodes: {inserted,skippedExisting,failed}, edges: {inserted,skippedExisting,failed}}.
                // `memories` + `summaries` each expose {inserted, skippedExisting, failed}
                // — merge mode populates skippedExisting; replace mode runs upsert so
                // skippedExisting stays 0. `memoriesInserted` is the backward-compat aggregate.
                counts  : subsystemCounts
            };
        } catch (error) {
            logger.error('[DatabaseService] Error importing database:', error);
            const importError = new Error(`DATABASE_IMPORT_ERROR: ${error.message}`);
            importError.code  = 'DATABASE_IMPORT_ERROR';
            throw importError;
        }
    }

    /**
     * Truncates specified collections (or graph) from the database.
     * @param {Object} options
     * @param {String[]}      [options.include=['memories', 'summaries', 'graph']]
     * @param {String|Object} [options.confirmation] Explicit production confirmation token.
     * @returns {Promise<{message: string}>}
     */
    async truncateDatabase({include=['memories', 'summaries', 'graph'], confirmation} = {}) {
        try {
            logger.log('Starting truncation of agent database...');
            let truncated = [];

            if (include.includes('memories')) {
                const proxy = Neo.create('Neo.ai.services.memory-core.managers.CollectionProxy', { collectionType: 'memory' });
                await proxy.drop({confirmation});
                truncated.push('memories');
            }

            if (include.includes('summaries')) {
                const proxy = Neo.create('Neo.ai.services.memory-core.managers.CollectionProxy', { collectionType: 'session' });
                await proxy.drop({confirmation});
                truncated.push('summaries');
            }

            if (include.includes('temporal-summaries')) {
                const proxy = Neo.create('Neo.ai.services.memory-core.managers.CollectionProxy', { collectionType: 'temporalSummary' });
                await proxy.drop({confirmation});
                truncated.push('temporal-summaries');
            }

            if (include.includes('graph')) {
                await this.#assertGraphDestructiveTargetAllowed({
                    operation: 'memory-core.graph.truncate',
                    mode     : 'truncate',
                    confirmation
                });

                const GraphService = (await import('./GraphService.mjs')).default;
                if (GraphService.db?.storage?.db) {
                    GraphService.db.storage.db.prepare('DELETE FROM Nodes').run();
                    GraphService.db.storage.db.prepare('DELETE FROM Edges').run();
                    truncated.push('graph');
                }
            }

            return {message: `Truncation complete. Cleared: ${truncated.join(', ')}`};
        } catch (error) {
            logger.error('[DatabaseService] Error truncating database:', error);
            const truncateError = new Error(`DATABASE_TRUNCATE_ERROR: ${error.message}`);
            truncateError.code  = 'DATABASE_TRUNCATE_ERROR';
            throw truncateError;
        }
    }

    /**
     * Manages database backups and truncations.
     * @param {Object} options
     * @param {String} options.action   The action to perform: 'import', 'export', or 'truncate'.
     * @param {Object} [options.config] Additional options for the action.
     * @returns {Promise<Object>}
     */
    async manageDatabaseBackup({action, ...config}) {
        if (action === 'export') {
            return this.exportDatabase(config);
        } else if (action === 'import') {
            return this.importDatabase(config);
        } else if (action === 'truncate') {
            return this.truncateDatabase(config);
        } else {
            throw new Error(`Unknown action: ${action}`);
        }
    }

    /**
     * Applies the shared destructive-operation guard to Native Edge Graph targets.
     *
     * @param {Object}        options
     * @param {String}        options.operation
     * @param {String}        options.mode
     * @param {Object}       [options.source]
     * @param {String|Object} [options.confirmation]
     * @returns {Promise<Object>}
     * @private
     */
    async #assertGraphDestructiveTargetAllowed({operation, mode, source, confirmation}) {
        return DestructiveOperationGuard.assertDestructiveTargetAllowed({
            operation,
            subsystem: 'memory-core',
            mode,
            target   : {
                sqlitePath: aiConfig.storagePaths.graph,
                path      : aiConfig.storagePaths.graph,
                repoRoot  : process.cwd()
            },
            source,
            confirmation
        })
    }
}

export default Neo.setupClass(DatabaseService);
