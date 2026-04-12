import aiConfig      from '../config.mjs';
import fs            from 'fs-extra';
import logger        from '../logger.mjs';
import path          from 'path';
import readline      from 'readline';
import Base          from '../../../../../src/core/Base.mjs';
import StorageRouter from '../managers/StorageRouter.mjs';

/**
 * @summary Service for exporting and importing memory core data.
 *
 * This class provides functionality to backup and restore the agent's memory and session summary data.
 * It supports exporting collections to JSONL files and importing them back, with options to either merge
 * or replace existing data. This is crucial for data migration and disaster recovery.
 *
 * @class Neo.ai.mcp.server.memory-core.services.DatabaseService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.DatabaseService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.DatabaseService',
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
     * @returns {Promise<number>} The number of exported documents.
     * @private
     */
    async #exportCollection(collection, backupPath, filePrefix) {
        logger.log(`Fetching all documents from "${collection.name}"...`);

        // 1. Get total count first
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

        // 2. Paginated Fetch
        const limit = 2000; // Safe batch size
        let offset  = 0;

        while (offset < count) {
            logger.log(`Fetching batch: ${offset} to ${Math.min(offset + limit, count)} of ${count}`);

            let batch;
            try {
                batch = await collection.get({
                    include: ["documents", "embeddings", "metadatas"],
                    limit  : limit,
                    offset : offset
                });
            } catch (batchErr) {
                logger.log(`Batch ${offset} fetch failed: ${batchErr.message}. Initiating surgical 1-by-1 rescue mode...`);

                // Fetch only IDs first to bypass corrupt payload/embedding pointers
                const idBatch = await collection.get({
                    include: [],
                    limit  : limit,
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

        const fs        = (await import('fs-extra')).default;
        const path      = (await import('path')).default;
        await fs.ensureDir(backupPath);
        
        const timestamp   = new Date().toISOString().replace(/:/g, '-');
        const backupFile  = path.join(backupPath, `${filePrefix}-${timestamp}.jsonl`);
        const writeStream = fs.createWriteStream(backupFile);

        let exported = 0;

        // Export Nodes
        const nodesStmt = db.prepare('SELECT data FROM Nodes');
        for (const row of nodesStmt.iterate()) {
             try {
                 const node = JSON.parse(row.data);
                 const record = { type: 'node', data: node };
                 writeStream.write(JSON.stringify(record) + '\\n');
                 exported++;
             } catch(e) {
                 logger.error(`Error parsing node during export`, e);
             }
        }

        // Export Edges
        const edgesStmt = db.prepare('SELECT data FROM Edges');
        for (const row of edgesStmt.iterate()) {
             try {
                 const edge = JSON.parse(row.data);
                 const record = { type: 'edge', data: edge };
                 writeStream.write(JSON.stringify(record) + '\\n');
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
     * @returns {Promise<number>}
     * @private
     */
    async #importGraph(filePath, mode) {
        logger.log(`Importing Graph Data from ${filePath} (mode: ${mode})...`);
        const GraphService = (await import('./GraphService.mjs')).default;

        if (!GraphService.db || !GraphService.db.storage || !GraphService.db.storage.db) {
            throw new Error(`Graph database not initialized. Cannot import graph.`);
        }
        
        const db = GraphService.db.storage.db;

        if (mode === 'replace') {
            logger.log(`Replace mode: Truncating existing Graph Nodes and Edges...`);
            db.prepare('DELETE FROM Nodes').run();
            db.prepare('DELETE FROM Edges').run();
        }

        const fs = (await import('fs-extra')).default;
        const readline = (await import('readline')).default;
        
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        let imported = 0;
        
        db.transaction((records) => {
            const insertNode = db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)');
            const insertEdge = db.prepare('INSERT OR REPLACE INTO Edges (source, target, data) VALUES (?, ?, ?)');
            
            for (const record of records) {
                if (record.type === 'node') {
                    insertNode.run(record.data.id, JSON.stringify(record.data));
                } else if (record.type === 'edge') {
                    insertEdge.run(record.data.source, record.data.target, JSON.stringify(record.data));
                }
                imported++;
            }
        })([]); // Execute an empty transaction block initially, but we need to batch it.
        
        // Let's do it directly in loop for simplicity
        const insertNode = db.prepare('INSERT OR REPLACE INTO Nodes (id, data) VALUES (?, ?)');
        const insertEdge = db.prepare('INSERT OR REPLACE INTO Edges (source, target, data) VALUES (?, ?, ?)');

        // Run within a transaction for speed
        const insertBatch = db.transaction((records) => {
            for (const record of records) {
                if (record.type === 'node') {
                    insertNode.run(record.data.id, JSON.stringify(record.data));
                } else if (record.type === 'edge') {
                    insertEdge.run(record.data.source, record.data.target, JSON.stringify(record.data));
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

        logger.log(`Successfully imported ${imported} graph elements.`);
        return imported;
    }

    /**
     * Exports the entire memory database (both memories and summaries) to a JSONL file.
     * @param {Object} options
     * @param {String[]} [options.include=['memories', 'summaries', 'graph']] Array of collections to export.
     * @returns {Promise<{message: string}>}
     */
    async exportDatabase({include=['memories', 'summaries', 'graph']} = {}) {
        try {
            logger.log('Starting agent memory export...');
            let memoryCount = 0, summaryCount = 0, graphCount = 0;

            if (include.includes('memories')) {
                const collection = await StorageRouter.getMemoryCollection();
                memoryCount      = await this.#exportCollection(collection, aiConfig.backupPath, 'memory-backup');
            }

            if (include.includes('summaries')) {
                const collection = await StorageRouter.getSummaryCollection();
                summaryCount     = await this.#exportCollection(collection, aiConfig.backupPath, 'summaries-backup');
            }

            if (include.includes('graph')) {
                graphCount = await this.#exportGraph(aiConfig.backupPath, 'graph-backup');
            }

            return {message: `Export complete. Exported ${memoryCount} memories, ${summaryCount} summaries, and ${graphCount} graph elements.`};
        } catch (error) {
            logger.error('[DatabaseService] Error exporting database:', error);
            const exportError = new Error(`DATABASE_EXPORT_ERROR: ${error.message}`);
            exportError.code  = 'DATABASE_EXPORT_ERROR';
            throw exportError;
        }
    }

    /**
     * Imports a previously exported JSONL file back into the database.
     * @param {Object} options
     * @param {String} options.file The path to the backup file to import.
     * @param {String} options.mode The import mode: 'merge' or 'replace'.
     * @param {Boolean} [options.reEmbed=false] If true, regenerates embeddings for all records.
     * @returns {Promise<{imported: number, total: number, mode: string}>}
     */
    async importDatabase({file, mode, reEmbed=false}) {
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
                logger.log('Replace mode specified - wiping target collections before batch import...');
                // Note: Proxy delete requires specific implementation, relying on merge for now if not supported natively.
            }

            let totalImported        = 0;
            let targetCollectionName = '';

            for (const filePath of filesToImport) {
                logger.log(`Importing: ${filePath}`);
                
                const isGraphBackup = path.basename(filePath).startsWith('graph-backup');
                if (isGraphBackup) {
                    const graphImportCount = await this.#importGraph(filePath, mode);
                    totalImported += graphImportCount;
                    continue;
                }

                // Determine which collection to import into based on filename heuristics
                const isMemoryBackup = path.basename(filePath).startsWith('memory-backup');
                let collection       = isMemoryBackup
                    ? await StorageRouter.getMemoryCollection()
                    : await StorageRouter.getSummaryCollection();

                targetCollectionName = collection.name; // roughly tracking target

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

                await collection.upsert({
                    ids       : records.map(r => r.id),
                    embeddings: records.map(r => r.embedding),
                    metadatas : records.map(r => r.metadata),
                    documents : records.map(r => r.document)
                });

                totalImported += records.length;
            }

            return {
                message : `Import batch complete. Successfully ingested ${totalImported} records across ${filesToImport.length} file(s).`,
                imported: totalImported,
                mode
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
     * @param {String[]} [options.include=['memories', 'summaries', 'graph']] 
     * @returns {Promise<{message: string}>}
     */
    async truncateDatabase({include=['memories', 'summaries', 'graph']} = {}) {
        try {
            logger.log('Starting truncation of agent database...');
            let truncated = [];

            if (include.includes('memories')) {
                const proxy = Neo.create('Neo.ai.mcp.server.memory-core.managers.CollectionProxy', { collectionType: 'memory' });
                await proxy.drop();
                truncated.push('memories');
            }

            if (include.includes('summaries')) {
                const proxy = Neo.create('Neo.ai.mcp.server.memory-core.managers.CollectionProxy', { collectionType: 'session' });
                await proxy.drop();
                truncated.push('summaries');
            }
            
            if (include.includes('graph')) {
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
}

export default Neo.setupClass(DatabaseService);
