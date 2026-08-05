import aiConfig                                                              from '../../mcp/server/memory-core/config.mjs';
import fs                                                                    from 'fs-extra';
import logger                                                                from '../../mcp/server/memory-core/logger.mjs';
import path                                                                  from 'path';
import readline                                                              from 'readline';
import Base                                                                  from '../../../src/core/Base.mjs';
import StorageRouter                                                         from './managers/StorageRouter.mjs';
import DestructiveOperationGuard                                             from '../../mcp/server/shared/services/DestructiveOperationGuard.mjs';
import {classifyExportCompleteness, EXPORT_COMPLETENESS, recordExportGrowth} from './helpers/exportCompleteness.mjs';
import {partitionRowsByVectorValidity, summarizeVectorRejections}            from './helpers/vectorWriteInvariant.mjs';
import {validateJsonlSourceFile}                                             from './helpers/vectorJsonlSourceValidation.mjs';
import {importGraphJsonl}                                                    from './helpers/graphJsonlImport.mjs';

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
     * @returns {Promise<{collection: String, collectionId: String|null, backupFile: String|null, expected: Number, exported: Number, skipped: Number, skippedIds: String[]}>} Export statistics.
     * @private
     */
    async #exportCollection(collection, backupPath, filePrefix, collectionName = collection.name || filePrefix) {
        logger.log(`Fetching all documents from "${collectionName}"...`);

        // Identity, captured beside the name and never in place of it. The name survives a promotion
        // by construction — `VectorService` swaps shadow into canonical under the same name — so only
        // the id can distinguish "the same source held nothing" from "a different source is here now".
        // Absent on sources that have no Chroma handle (the native graph); `null` degrades the
        // lineage axis to `unknown` rather than asserting continuity it cannot observe.
        const collectionId = collection?.id ?? null;

        // 1. Get total count first
        const count = await collection.count();
        if (count === 0) {
            logger.log(`No documents found in ${collectionName} to export.`);
            return {
                collection: collectionName,
                collectionId,
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
            collectionId,
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

        const verdict = classifyExportCompleteness(stats.exported, stats.expected);

        // An unreadable count cannot certify a bundle, and a collection that GREW is not a loss.
        // Treating every inequality as a partial export aborted the entire backup on `32272/32271`
        // — one row MORE than expected — because a live agent wrote a memory mid-export.
        if (verdict === EXPORT_COMPLETENESS.partial || verdict === EXPORT_COMPLETENESS.indeterminate) {
            const error = new Error(
                `PARTIAL_COLLECTION_EXPORT: ${collectionName} exported ${stats.exported}/${stats.expected} ` +
                `records to ${backupFile}; skipped ${stats.skipped} corrupted vector id(s). Verdict: ${verdict}.`
            );
            error.code    = 'PARTIAL_COLLECTION_EXPORT';
            error.details = {...stats, verdict};
            throw error
        }

        if (verdict === EXPORT_COMPLETENESS.grew) {
            // Every row the snapshot knew about was written, plus late arrivals — aborting here
            // destroys a usable bundle. It is NOT provable completeness either: this loop pages by
            // offset, so an insert landing in an already-walked page shifts later rows, and a
            // concurrent write can skip one row while duplicating another and still finish high.
            recordExportGrowth(stats);

            logger.warn(
                `[DatabaseService] ${collectionName} grew during export: ${stats.exported}/${stats.expected} ` +
                `(+${stats.growthDelta}). Every snapshotted row was captured; because this path pages by ` +
                'offset, the bundle is complete-or-better but not provably exact.'
            );
        }

        logger.log(`Successfully exported ${stats.exported}/${stats.expected} documents from ${collectionName} to: ${backupFile}`);
        return stats
    }

    /**
     * Helper method to export the Native Graph (Nodes and Edges) as JSONL.
     * @param {String} backupPath The directory to save the backup file.
     * @param {String} filePrefix The prefix for the backup filename.
     * @returns {Promise<{collection: String, backupFile: String|null, expected: Number, exported: Number, skipped: Number, skippedIds: String[]}>} Export statistics preserving source-row completeness.
     * @throws {Error} `GRAPH_COUNT_QUERY_FAILED` when the source tables cannot be counted.
     * @throws {Error} `PARTIAL_COLLECTION_EXPORT` when one or more counted rows cannot be exported.
     * @private
     */
    async #exportGraph(backupPath, filePrefix) {
        logger.log(`Fetching all nodes and edges from the native graph...`);
        const GraphService   = (await import('./GraphService.mjs')).default,
              collectionName = 'native-graph',
              emptyStats     = {
                  collection: collectionName,
                  backupFile: null,
                  expected  : 0,
                  exported  : 0,
                  skipped   : 0,
                  skippedIds: []
              };

        // Ensure graph is initialized
        if (!GraphService.db || !GraphService.db.storage || !GraphService.db.storage.db) {
             logger.log(`Graph database not initialized. Skipping graph export.`);
             return emptyStats
        }

        const db = GraphService.db.storage.db;

        let nodesCount = 0;
        let edgesCount = 0;

        try {
            nodesCount = db.prepare('SELECT count(*) as c FROM Nodes').get().c || 0;
            edgesCount = db.prepare('SELECT count(*) as c FROM Edges').get().c || 0;
        } catch (cause) {
            logger.error(`Error querying Native Graph tables: ${cause.message}`);

            const error = new Error(`GRAPH_COUNT_QUERY_FAILED: could not count ${collectionName} rows (${cause.message}).`, {cause});
            error.code    = 'GRAPH_COUNT_QUERY_FAILED';
            error.details = {
                collection: collectionName,
                cause     : cause.message,
                stage     : 'count'
            };
            throw error
        }

        const totalCount = nodesCount + edgesCount;

        if (totalCount === 0) {
            logger.log(`No nodes or edges found in the native graph to export.`);
            return emptyStats
        }

        logger.log(`Found ${nodesCount} nodes and ${edgesCount} edges to export.`);

        const fs   = (await import('fs-extra')).default;
        const path = (await import('path')).default;
        await fs.ensureDir(backupPath);

        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);
        const stats       = {
            collection: collectionName,
            backupFile,
            expected  : totalCount,
            exported  : 0,
            skipped   : 0,
            skippedIds: []
        };

        // Export Nodes
        const nodesStmt = db.prepare('SELECT id, data FROM Nodes');
        for (const row of nodesStmt.iterate()) {
             try {
                 const node   = JSON.parse(row.data);
                 const record = { type: 'node', data: node };
                 writeStream.write(JSON.stringify(record) + '\n');
                 stats.exported++;
             } catch (error) {
                 stats.skipped++;
                 stats.skippedIds.push(`node:${row.id}`);
                 logger.error(`Error parsing node during export`, error);
             }
        }

        // Export Edges
        const edgesStmt = db.prepare('SELECT id, data FROM Edges');
        for (const row of edgesStmt.iterate()) {
             try {
                 const edge   = JSON.parse(row.data);
                 const record = { type: 'edge', data: edge };
                 writeStream.write(JSON.stringify(record) + '\n');
                 stats.exported++;
             } catch (error) {
                 stats.skipped++;
                 stats.skippedIds.push(`edge:${row.id}`);
                 logger.error(`Error parsing edge during export`, error);
             }
        }

        await new Promise(resolve => writeStream.end(resolve));

        const verdict = classifyExportCompleteness(stats.exported, stats.expected);

        if (verdict === EXPORT_COMPLETENESS.partial || verdict === EXPORT_COMPLETENESS.indeterminate) {
            const error = new Error(
                `PARTIAL_COLLECTION_EXPORT: ${collectionName} exported ${stats.exported}/${stats.expected} ` +
                `records to ${backupFile}; skipped ${stats.skipped} unreadable graph row(s). Verdict: ${verdict}.`
            );
            error.code    = 'PARTIAL_COLLECTION_EXPORT';
            error.details = {...stats, verdict};
            throw error
        }

        if (verdict === EXPORT_COMPLETENESS.grew) {
            // The graph grew between the count and the scan. Nothing holds the source still across
            // that window — the two counts, the `await`ed directory/stream setup, and the two
            // iterations are all separate reads, and a second connection (another daemon writing one
            // memory) lands in it. Nodes and Edges are also read as two statements, so the tables can
            // come from different instants: complete-or-better, not a single-instant snapshot.
            recordExportGrowth(stats);

            logger.warn(
                `[DatabaseService] ${collectionName} grew during export: ${stats.exported}/${stats.expected} ` +
                `(+${stats.growthDelta}). Every counted row was captured; because Nodes and Edges are read ` +
                'as separate statements, the bundle is complete-or-better but not a single-instant snapshot.'
            );
        }

        logger.log(`Successfully exported ${stats.exported}/${stats.expected} graph elements to: ${backupFile}`);
        return stats
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
        }

        const {imported, counts} = await importGraphJsonl({
            db,
            filePath,
            mode,
            warn: message => logger.warn(message)
        });

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
                graphStats = await this.#exportGraph(backupPath, 'graph-backup')
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
     * Chroma-backed JSONL files are parsed, validated, existence-filtered, and
     * written inside the existing 250-row bound; neither rows nor merge IDs are
     * retained for the full file.
     *
     * @returns {Promise<{message: string, imported: number, mode: string, counts: Object}>}
     */
    async importDatabase({file, mode, reEmbed=false, confirmation, preserveDeliveryReadState = false}) {
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

            // `readAt`/`archivedAt` on `DELIVERED_TO` edges are graph-owned mutable state — `markRead`
            // writes them to storage and the WAL carries `readAt: null` forever by design (see
            // `MailboxService.getStorageDeliveryMutableState`, which lets the committed per-recipient value
            // win over that send-time null during WAL-replay projection). An OPERATIONAL re-seed restores a
            // snapshot that lags behind live reads and would silently revert acked `mark_read` writes.
            //
            // Preserving them is opt-in and never the default: `replace` is an operator-facing seam whose
            // contract is "the backup IS the new state". A disaster-recovery restore must reproduce the
            // backup exactly, so only a caller that knows it is doing an operational re-seed may ask for
            // live read-state to survive. The capture itself happens inside the truncate transaction
            // (see `truncateDatabase`) so no acknowledged write can be lost between capture and wipe.
            let preservedDeliveryState = [];

            if (mode === 'replace') {
                // Prove the FULL source before any destructive operation: every row of every file
                // must parse, and every Chroma-bound row must carry a non-empty id plus a valid
                // same-dimension vector (graph backups are parse-checked only — their rows are
                // nodes/edges, not vectors). Without this pass, a corrupt final row would truncate
                // a subsystem and only then be discovered by the per-batch write gate below.
                for (const filePath of filesToImport) {
                    await validateJsonlSourceFile({
                        filePath,
                        expectedDimension: aiConfig.vectorDimension,
                        vectorRows       : !path.basename(filePath).startsWith('graph-backup')
                    });
                }

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
                    ({preservedDeliveryState = []} = await this.truncateDatabase({
                        include: [...subsystemsToWipe],
                        confirmation,
                        preserveDeliveryReadState
                    }));
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

                // Chroma has TWO upsert/add limits: (1) record-count cap ~5461; (2) HTTP
                // body size cap that 413-rejects large payloads. With 4096-dim qwen3
                // embeddings (~32KB each) + document text, per-record is ~35-40KB.
                // Chunk size 250 = ~10MB body, well within HTTP limits + record cap.
                // Empirical anchors 2026-05-10:
                //   - 9244 records: "Record set length 9244 exceeds max batch size 5461"
                //   - 4000 records: "413: Payload Too Large"
                const CHROMA_UPSERT_CHUNK_SIZE = 250;

                let fileInserted         = 0;
                let fileSkippedExisting  = 0;
                let fileFailed           = 0;
                let batch                = [];
                let batchNumber          = 0;
                let fileRecordsProcessed = 0;

                const flushBatch = async () => {
                    if (batch.length === 0) return;

                    // Detach before awaiting the store so rows and ID state stay scoped to
                    // this one Chroma request. The async readline loop is naturally paused
                    // until the flush completes.
                    let chunk = batch;
                    batch = [];
                    batchNumber++;
                    fileRecordsProcessed += chunk.length;

                    if (reEmbed) {
                        chunk.forEach(record => delete record.embedding);
                    }

                    if (mode === 'merge') {
                        // Preserve-live merge, matching graph-side INSERT OR IGNORE semantics.
                        // Existence state is deliberately batch-local: after add() settles,
                        // both the Set and missing rows can be collected before the next read.
                        const chunkIds    = chunk.map(record => record.id);
                        const existence   = await collection.get({ids: chunkIds, include: []});
                        const existingIds = new Set(existence.ids);

                        chunk = chunk.filter(record => !existingIds.has(record.id));
                        fileSkippedExisting += existingIds.size;

                        if (existingIds.size > 0) {
                            logger.log(`  merge batch ${batchNumber}: ${existingIds.size} live ID(s) preserved; ${chunk.length} new record(s) to insert.`);
                        }

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
                            return;
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
                            logger.error(`[importMemories] add failed for chunk ${batchNumber}: ${e.message}`);
                        }
                    } else {
                        // Replace mode: subsystem already truncated above; upsert is safe
                        // (no live rows to collide with). Fail-fast on chunk error matches
                        // fail-fast behavior; the outer try/catch wraps it as DATABASE_IMPORT_ERROR.
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
                            return;
                        }
                        await collection.upsert({
                            ids       : chunk.map(r => r.id),
                            embeddings: chunk.map(r => r.embedding),
                            metadatas : chunk.map(r => r.metadata),
                            documents : chunk.map(r => r.document)
                        });
                        fileInserted += chunk.length;
                    }
                };

                const fileStream = fs.createReadStream(filePath);
                const rl         = readline.createInterface({input: fileStream, crlfDelay: Infinity});

                for await (const line of rl) {
                    if (!line.trim()) continue;

                    batch.push(JSON.parse(line));

                    if (batch.length === CHROMA_UPSERT_CHUNK_SIZE) {
                        await flushBatch();
                    }
                }

                await flushBatch();

                if (fileRecordsProcessed === 0) {
                    logger.log(`No records found in ${filePath}. Skipping.`);
                    continue;
                }

                chromaCounts.inserted            += fileInserted;
                chromaCounts.skippedExisting     += fileSkippedExisting;
                chromaCounts.failed              += fileFailed;
                totalImported                    += fileInserted;
                subsystemCounts.memoriesInserted += fileInserted;
            }

            // Re-apply the graph-owned delivery state captured before the truncate, wherever the restored
            // snapshot left it null — a committed read/archive receipt wins over a lagged snapshot's send-time
            // null, exactly as `getStorageDeliveryMutableState` enforces during WAL-replay projection. Only
            // null-in-restore rows are touched, so a fresher import is never regressed. Keyed by (source, target)
            // — the identity of one per-recipient delivery — because the importer re-derives the edge `id`.
            if (preservedDeliveryState.length) {
                const graphDb = (await import('./GraphService.mjs')).default.db?.storage?.db;
                if (graphDb) {
                    const reapplyReadAt     = graphDb.prepare(`UPDATE Edges SET data = json_set(data, '$.properties.readAt', ?)     WHERE source = ? AND target = ? AND type = 'DELIVERED_TO' AND json_extract(data, '$.properties.readAt')     IS NULL`),
                          reapplyArchivedAt = graphDb.prepare(`UPDATE Edges SET data = json_set(data, '$.properties.archivedAt', ?) WHERE source = ? AND target = ? AND type = 'DELIVERED_TO' AND json_extract(data, '$.properties.archivedAt') IS NULL`);
                    let reapplied = 0;
                    graphDb.transaction(rows => {
                        for (const row of rows) {
                            if (row.readAt     != null) reapplied += reapplyReadAt.run(row.readAt, row.source, row.target).changes;
                            if (row.archivedAt != null) reapplyArchivedAt.run(row.archivedAt, row.source, row.target);
                        }
                    })(preservedDeliveryState);
                    // ALWAYS log, including zero. A receipt emitted only when non-zero cannot
                    // distinguish "preservation ran and had nothing to re-apply" (a fresh bundle)
                    // from "preservation never engaged" (the caller used the recovery path by
                    // mistake) — and that is the exact ambiguity an operator reads this line to
                    // resolve. Suppressing the zero makes the absence of output mean two things.
                    logger.log(`[importDatabase] Re-applied ${reapplied} committed DELIVERED_TO read-receipt(s) preserved across the replace.`);
                }
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
    async truncateDatabase({include=['memories', 'summaries', 'graph'], confirmation, preserveDeliveryReadState = false} = {}) {
        try {
            logger.log('Starting truncation of agent database...');
            let truncated              = [],
                preservedDeliveryState = [];

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
                    const graphDb = GraphService.db.storage.db;

                    // Capture-and-truncate in ONE transaction when the caller opts in. A separate SELECT
                    // followed by the DELETE leaves a window in which an acknowledged `mark_read` commits
                    // and is then wiped without ever having been captured — the same lost-acknowledged-write
                    // class this preservation exists to prevent, reintroduced inside the operation.
                    // better-sqlite3 transactions are synchronous and serialized, so nothing interleaves.
                    preservedDeliveryState = graphDb.transaction(() => {
                        const captured = preserveDeliveryReadState
                            ? graphDb.prepare(
                                `SELECT source,
                                        target,
                                        json_extract(data, '$.properties.readAt')     AS readAt,
                                        json_extract(data, '$.properties.archivedAt') AS archivedAt
                                 FROM Edges
                                 WHERE type = 'DELIVERED_TO'
                                   AND (json_extract(data, '$.properties.readAt')     IS NOT NULL
                                        OR json_extract(data, '$.properties.archivedAt') IS NOT NULL)`
                            ).all()
                            : [];

                        graphDb.prepare('DELETE FROM Nodes').run();
                        graphDb.prepare('DELETE FROM Edges').run();

                        return captured
                    })();

                    truncated.push('graph');
                }
            }

            return {message: `Truncation complete. Cleared: ${truncated.join(', ')}`, preservedDeliveryState};
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
